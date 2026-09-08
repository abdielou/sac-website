// lib/email-threads.js
// Pure matching rules that turn Gmail log records into accountability threads.
// No I/O here. See docs/superpowers/specs/2026-09-07-email-accountability-design.md.

const PREFIX_RE = /^\s*(?:(?:re|rv|fw|fwd)\s*:\s*)+/i
const EMPTY_SUBJECT = '(sin asunto)'
const DAY_MS = 24 * 60 * 60 * 1000
const STATUS_ORDER = { overdue: 0, pending: 1, answered: 2 }

/**
 * Normalize a subject for thread grouping.
 * Strips repeated reply and forward prefixes, trims, and lower-cases.
 * @param {string|undefined} subject
 * @returns {string}
 */
export function normalizeSubject(subject) {
  const cleaned = String(subject ?? '')
    .replace(PREFIX_RE, '')
    .trim()
    .toLowerCase()
  return cleaned || EMPTY_SUBJECT
}

/**
 * Parse `message_info.flattened_destinations` into lower-case addresses.
 * Each comma-separated item looks like `route:detail:address`.
 * @param {string|undefined} destinations
 * @returns {string[]}
 */
export function parseRecipients(destinations) {
  if (!destinations) return []
  return destinations
    .split(',')
    .map((item) =>
      item
        .slice(item.lastIndexOf(':') + 1)
        .trim()
        .toLowerCase()
    )
    .filter((address) => address.includes('@'))
}

function domainOf(address) {
  return (
    String(address ?? '')
      .toLowerCase()
      .split('@')[1] ?? ''
  )
}

// A member is a domain user other than the group itself. The group logs its
// own "sent" events when it fans a message out, and those must not count as
// replies.
function isMemberActor(record, domain, group) {
  return record.actor !== group && domainOf(record.actor) === domain
}

// Sender of the first inbound message that has a match, else any later one.
function senderOf(thread, senders) {
  for (const id of thread.inboundIds) {
    const hit = senders.get(id)
    if (hit) return { name: hit.name ?? '', email: hit.email ?? '' }
  }
  return null
}

function minuteKey(record) {
  return `${record.by}|${record.at.slice(0, 16)}`
}

function daysBetween(fromIso, toIso) {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime()
  return Math.max(0, Math.floor(ms / DAY_MS))
}

/**
 * Build accountability threads from three sets of Gmail log records.
 *
 * Record shape: { time, actor, messageId, subject, destinations }.
 * - inbound: mail_event_type 2 records for the group mailbox
 * - replied: mail_event_type 9 records for all users
 * - sent: mail_event_type 1 records for all users
 *
 * @returns {{ generatedAt: string, windowDays: number, thresholdDays: number,
 *   summary: { overdue: number, pending: number, answered: number }, threads: object[] }}
 */
export function buildEmailThreads({
  inbound = [],
  replied = [],
  sent = [],
  groupAddress,
  now,
  thresholdDays = 7,
  windowDays = 30,
  senders = new Map(),
  senderStatus = null,
  dropHeld = true,
}) {
  const group = String(groupAddress ?? '').toLowerCase()
  const domain = domainOf(group)
  const nowIso = new Date(now ?? Date.now()).toISOString()

  // Sent events by domain users, keyed by message id. These tell us which
  // inbound copies are internal replies and whether a reply was a Reply All.
  const sentByDomain = sent.filter((r) => isMemberActor(r, domain, group))
  const sentById = new Map()
  for (const r of sentByDomain) {
    if (r.messageId && !sentById.has(r.messageId)) sentById.set(r.messageId, r)
  }

  // Message ids the group fanned out to members. The group logs its own
  // "sent" event per distributed message. An inbound message without one was
  // held by the group's moderation, which is where the spam blasts end up.
  const distributed = new Set(sent.filter((r) => r.actor === group).map((r) => r.messageId))
  let heldCount = 0

  // Group inbound records into threads. Internal copies become replies.
  const threads = new Map()
  const getThread = (subject) => {
    const id = normalizeSubject(subject)
    if (!threads.has(id)) {
      threads.set(id, {
        id,
        subject: String(subject ?? '').trim() || EMPTY_SUBJECT,
        inboundIds: new Set(),
        inboundTimes: [],
        replies: [],
      })
    }
    return threads.get(id)
  }

  const sortedInbound = [...inbound].sort((a, b) => a.time.localeCompare(b.time))
  for (const r of sortedInbound) {
    const internal = sentById.get(r.messageId)
    if (internal) {
      const thread = getThread(r.subject)
      thread.replies.push({
        by: internal.actor,
        at: internal.time,
        replyAll: true,
        method: 'sent',
      })
      continue
    }
    if (dropHeld && r.messageId && !distributed.has(r.messageId)) {
      heldCount += 1
      continue
    }
    const thread = getThread(r.subject)
    // Count each message id once. A record without an id cannot be matched
    // to a reply event, so it is counted but never indexed.
    if (r.messageId) {
      if (thread.inboundIds.has(r.messageId)) continue
      thread.inboundIds.add(r.messageId)
    }
    if (thread.inboundTimes.length === 0)
      thread.subject = String(r.subject ?? '').trim() || EMPTY_SUBJECT
    thread.inboundTimes.push(r.time)
  }

  // Index threads by inbound message id for exact reply matching.
  const threadByInboundId = new Map()
  for (const thread of threads.values()) {
    for (const id of thread.inboundIds) threadByInboundId.set(id, thread)
  }

  // Exact replies: "replied to for the first time" events on an inbound id.
  for (const r of replied) {
    if (!r.messageId || !isMemberActor(r, domain, group)) continue
    const thread = threadByInboundId.get(r.messageId)
    if (!thread) continue
    const matchingSent = sentByDomain.find(
      (s) =>
        s.actor === r.actor &&
        normalizeSubject(s.subject) === thread.id &&
        Math.abs(new Date(s.time) - new Date(r.time)) <= 10 * 60 * 1000
    )
    const replyAll = matchingSent
      ? parseRecipients(matchingSent.destinations).includes(group)
      : false
    thread.replies.push({ by: r.actor, at: r.time, replyAll, method: 'exact' })
  }

  // Inferred replies: sent by a domain user, same subject, later than the
  // first inbound, and at least one recipient outside the domain.
  for (const s of sentByDomain) {
    const thread = threads.get(normalizeSubject(s.subject))
    if (!thread || thread.inboundTimes.length === 0) continue
    if (s.time <= thread.inboundTimes[0]) continue
    const recipients = parseRecipients(s.destinations)
    if (!recipients.some((addr) => domainOf(addr) !== domain)) continue
    thread.replies.push({
      by: s.actor,
      at: s.time,
      replyAll: recipients.includes(group),
      method: 'sent',
    })
  }

  // Finalize each thread.
  const result = []
  for (const thread of threads.values()) {
    if (thread.inboundTimes.length === 0) continue
    const seen = new Map()
    for (const reply of thread.replies.sort((a, b) => a.at.localeCompare(b.at))) {
      const key = minuteKey(reply)
      const existing = seen.get(key)
      if (!existing) {
        seen.set(key, reply)
      } else if (reply.method === 'exact' && existing.method !== 'exact') {
        seen.set(key, { ...reply, replyAll: existing.replyAll || reply.replyAll })
      } else if (reply.replyAll && !existing.replyAll) {
        existing.replyAll = true
      }
    }
    const replies = [...seen.values()]
    const firstInboundAt = thread.inboundTimes[0]
    const lastInboundAt = thread.inboundTimes[thread.inboundTimes.length - 1]
    const answer = replies.find((r) => r.at > lastInboundAt)
    let status
    if (answer) status = 'answered'
    else if (daysBetween(lastInboundAt, nowIso) >= thresholdDays) status = 'overdue'
    else status = 'pending'
    result.push({
      id: thread.id,
      subject: thread.subject,
      sender: senderOf(thread, senders),
      firstInboundAt,
      lastInboundAt,
      inboundCount: thread.inboundTimes.length,
      status,
      daysWaiting: daysBetween(lastInboundAt, answer ? answer.at : nowIso),
      replies,
    })
  }

  result.sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      b.lastInboundAt.localeCompare(a.lastInboundAt)
  )

  const summary = { overdue: 0, pending: 0, answered: 0 }
  for (const t of result) summary[t.status] += 1

  return {
    generatedAt: nowIso,
    windowDays,
    thresholdDays,
    senderStatus,
    heldCount,
    summary,
    threads: result,
  }
}
