// lib/gmail-senders.js
// Reads From and Message-ID headers from one mailbox with the Gmail
// metadata scope. That scope exposes headers and labels only, never bodies.
// The mailbox is a group member, so it holds a copy of every group message.

import { JWT } from 'google-auth-library'

const SCOPE = 'https://www.googleapis.com/auth/gmail.metadata'
const API_BASE = 'https://gmail.googleapis.com/gmail/v1/users'
const PAGE_SIZE = 500
const CONCURRENCY = 25
const HEADERS = ['From', 'Message-ID', 'Date', 'X-Original-Sender']

/**
 * Split a From header into a name and a lower-case address.
 * @param {string|undefined} value
 * @returns {{ name: string, email: string }}
 */
export function parseFromHeader(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return { name: '', email: '' }
  const match = raw.match(/^(.*?)\s*<([^>]+)>\s*$/)
  if (!match) return { name: '', email: raw.toLowerCase() }
  const name = match[1]
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .trim()
  return { name, email: match[2].trim().toLowerCase() }
}

/**
 * Resolve the real sender of a group copy. Google Groups rewrites From to
 * `"Name via GroupName" <group@...>` for senders with a strict DMARC policy
 * and keeps the original address in X-Original-Sender.
 * @param {Record<string, string>} headers
 * @returns {{ name: string, email: string }}
 */
export function resolveSender(headers) {
  const from = parseFromHeader(headers.From)
  const original = String(headers['X-Original-Sender'] ?? '')
    .trim()
    .toLowerCase()
  const name = from.name
    .replace(/\s+via\s+.+$/i, '')
    .replace(/^['"](.*)['"]$/, '$1')
    .trim()
  return { name, email: original || from.email }
}

/**
 * JWT client that impersonates `mailbox` with the metadata scope.
 * @param {string} mailbox
 */
export function createGmailAuth(mailbox) {
  return new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: [SCOPE],
    subject: mailbox,
  })
}

async function resolveLabelId(auth, user, labelName) {
  const res = await auth.request({ url: `${API_BASE}/${user}/labels` })
  const wanted = labelName.toLowerCase()
  const label = (res.data?.labels ?? []).find((l) => l.name?.toLowerCase() === wanted)
  if (!label) throw new Error(`Gmail label not found: ${labelName}`)
  return label.id
}

async function getMessage(auth, user, id) {
  const url = new URL(`${API_BASE}/${user}/messages/${encodeURIComponent(id)}`)
  url.searchParams.set('format', 'metadata')
  for (const h of HEADERS) url.searchParams.append('metadataHeaders', h)
  const res = await auth.request({ url: url.toString() })
  return res.data
}

async function mapLimited(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

function headerMap(message) {
  const map = {}
  for (const h of message?.payload?.headers ?? []) map[h.name] = h.value
  return map
}

/**
 * Map Message-ID to sender for every message under the label that is not
 * older than `startTime`. Listing returns newest first, so paging stops at
 * the first page whose oldest message is outside the window.
 *
 * @param {object} options
 * @param {{ request: Function }} options.auth
 * @param {string} options.mailbox
 * @param {string} options.labelName
 * @param {string} options.startTime - ISO string
 * @returns {Promise<Map<string, { name: string, email: string, date: string }>>}
 */
export async function fetchSenders({ auth, mailbox, labelName, startTime }) {
  const user = encodeURIComponent(mailbox)
  const labelId = await resolveLabelId(auth, user, labelName)
  const startMs = new Date(startTime).getTime()
  const senders = new Map()

  let pageToken
  do {
    const url = new URL(`${API_BASE}/${user}/messages`)
    url.searchParams.set('labelIds', labelId)
    url.searchParams.set('maxResults', String(PAGE_SIZE))
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const res = await auth.request({ url: url.toString() })
    const ids = (res.data?.messages ?? []).map((m) => m.id)
    if (ids.length === 0) break

    const messages = await mapLimited(ids, CONCURRENCY, (id) => getMessage(auth, user, id))
    let reachedWindowStart = false
    for (const message of messages) {
      const ms = Number(message?.internalDate ?? 0)
      if (ms < startMs) {
        reachedWindowStart = true
        continue
      }
      const headers = headerMap(message)
      const messageId = String(headers['Message-ID'] ?? '').trim()
      if (!messageId) continue
      senders.set(messageId, { ...resolveSender(headers), date: new Date(ms).toISOString() })
    }
    pageToken = reachedWindowStart ? undefined : res.data?.nextPageToken
  } while (pageToken)

  return senders
}
