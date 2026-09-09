// test/email-threads.test.js
// Pure matching rules for the email accountability dashboard

import { normalizeSubject, parseRecipients, buildEmailThreads } from '../lib/email-threads'

const GROUP = 'info@example.org'
const NOW = '2026-09-07T12:00:00.000Z'

const rec = (over) => ({
  time: '2026-09-01T10:00:00.000Z',
  actor: GROUP,
  messageId: '<m1@ext.com>',
  subject: 'Solicitud de actividad',
  destinations: `mailing-list-server::${GROUP}`,
  ...over,
})

// The group logs a "sent" event for every message it fans out. The helper
// adds one per inbound record so the default fixtures count as distributed.
const fanOut = (inbound) =>
  inbound
    .filter((r) => r.messageId)
    .map((r) => ({
      time: r.time,
      actor: GROUP,
      messageId: r.messageId,
      subject: r.subject,
      destinations: 'smtp-outbound:x:board@example.org',
    }))

const build = ({ inbound = [], sent = [], noFanOut = false, ...parts } = {}) =>
  buildEmailThreads({
    inbound,
    replied: [],
    sent: noFanOut ? sent : [...sent, ...fanOut(inbound)],
    groupAddress: GROUP,
    now: NOW,
    ...parts,
  })

describe('normalizeSubject', () => {
  test('strips repeated reply and forward prefixes and lower-cases', () => {
    expect(normalizeSubject('Re: RV: Fwd: Hola  Mundo ')).toBe('hola  mundo')
    expect(normalizeSubject('Re : Website Ideas')).toBe('website ideas')
  })

  test('maps an empty subject to a placeholder', () => {
    expect(normalizeSubject('')).toBe('(sin asunto)')
    expect(normalizeSubject(undefined)).toBe('(sin asunto)')
  })
})

describe('parseRecipients', () => {
  test('takes the address after the last colon of each item', () => {
    const raw = `mailing-list-server::${GROUP},smtp-outbound-to-gmail:gmail-delivery-server:Ana@gmail.com`
    expect(parseRecipients(raw)).toEqual([GROUP, 'ana@gmail.com'])
  })

  test('returns an empty list for empty input', () => {
    expect(parseRecipients('')).toEqual([])
    expect(parseRecipients(undefined)).toEqual([])
  })
})

describe('buildEmailThreads', () => {
  test('marks an unanswered message older than the threshold as overdue', () => {
    const out = build({ inbound: [rec({ time: '2026-08-25T10:00:00.000Z' })] })
    expect(out.threads).toHaveLength(1)
    expect(out.threads[0]).toMatchObject({
      id: 'solicitud de actividad',
      subject: 'Solicitud de actividad',
      status: 'overdue',
      daysWaiting: 13,
      inboundCount: 1,
      replies: [],
    })
    expect(out.summary).toEqual({ overdue: 1, pending: 0, answered: 0 })
  })

  test('marks an unanswered recent message as pending', () => {
    const out = build({ inbound: [rec({ time: '2026-09-05T10:00:00.000Z' })] })
    expect(out.threads[0].status).toBe('pending')
    expect(out.threads[0].daysWaiting).toBe(2)
  })

  test('links an exact reply event to the thread by message id', () => {
    const out = build({
      inbound: [rec()],
      replied: [
        rec({
          time: '2026-09-02T09:00:00.000Z',
          actor: 'board@example.org',
          destinations: '::board@example.org',
        }),
      ],
    })
    expect(out.threads[0].status).toBe('answered')
    expect(out.threads[0].replies).toEqual([
      { by: 'board@example.org', at: '2026-09-02T09:00:00.000Z', replyAll: false, method: 'exact' },
    ])
    expect(out.threads[0].daysWaiting).toBe(0)
  })

  test('infers a reply from a sent message with the same subject to an outside address', () => {
    const out = build({
      inbound: [rec()],
      sent: [
        rec({
          time: '2026-09-03T09:00:00.000Z',
          actor: 'board@example.org',
          messageId: '<reply1@example.org>',
          subject: 'Re: Solicitud de actividad',
          destinations: 'smtp-outbound-to-gmail:gmail-delivery-server:ana@gmail.com',
        }),
      ],
    })
    expect(out.threads[0].status).toBe('answered')
    expect(out.threads[0].replies).toEqual([
      { by: 'board@example.org', at: '2026-09-03T09:00:00.000Z', replyAll: false, method: 'sent' },
    ])
  })

  test('flags replyAll when the group address is among the recipients', () => {
    const out = build({
      inbound: [rec()],
      sent: [
        rec({
          time: '2026-09-03T09:00:00.000Z',
          actor: 'board@example.org',
          messageId: '<reply1@example.org>',
          subject: 'Re: Solicitud de actividad',
          destinations: `smtp-outbound:gmail-delivery-server:ana@gmail.com,mailing-list-server::${GROUP}`,
        }),
      ],
    })
    expect(out.threads[0].replies[0].replyAll).toBe(true)
  })

  test('an exact reply takes replyAll from a matching sent event', () => {
    // Only the group address is a recipient, so rule 5 never records this
    // sent event. The replyAll flag can only come from the rule 4 lookup.
    const sentReply = rec({
      time: '2026-09-03T08:59:30.000Z',
      actor: 'board@example.org',
      messageId: '<reply1@example.org>',
      subject: 'Re: Solicitud de actividad',
      destinations: `mailing-list-server::${GROUP}`,
    })
    const out = build({
      inbound: [rec()],
      replied: [rec({ time: '2026-09-03T08:59:00.000Z', actor: 'board@example.org' })],
      sent: [sentReply],
    })
    expect(out.threads[0].replies).toHaveLength(1)
    expect(out.threads[0].replies[0]).toMatchObject({ method: 'exact', replyAll: true })
  })

  test('ignores sent and replied events whose actor is the group itself', () => {
    // The group logs a "sent" event with the original message id when it
    // fans a message out to members. That is not a reply.
    const out = build({
      inbound: [rec()],
      sent: [
        rec({
          time: '2026-09-01T10:00:05.000Z',
          actor: GROUP,
          destinations: 'smtp-outbound:x:board@example.org,smtp-outbound:x:other@example.org',
        }),
      ],
      replied: [rec({ time: '2026-09-02T09:00:00.000Z', actor: GROUP })],
    })
    expect(out.threads).toHaveLength(1)
    expect(out.threads[0].inboundCount).toBe(1)
    expect(out.threads[0].status).toBe('pending')
    expect(out.threads[0].replies).toEqual([])
  })

  test('ignores a sent message that only goes to domain addresses', () => {
    const out = build({
      inbound: [rec()],
      sent: [
        rec({
          time: '2026-09-03T09:00:00.000Z',
          actor: 'board@example.org',
          messageId: '<internal@example.org>',
          subject: 'Re: Solicitud de actividad',
          destinations: 'smtp-outbound:x:other@example.org',
        }),
      ],
    })
    expect(out.threads[0].status).toBe('pending')
    expect(out.threads[0].replies).toEqual([])
  })

  test('treats an inbound copy of a member reply as a reply, not as new inbound', () => {
    const replyId = '<reply1@example.org>'
    const out = build({
      inbound: [
        rec(),
        rec({
          time: '2026-09-03T09:00:05.000Z',
          messageId: replyId,
          subject: 'Re: Solicitud de actividad',
        }),
      ],
      sent: [
        // Only the group address is a recipient, so rule 5 skips this event
        // and the reply can only come from the internal-copy rule.
        rec({
          time: '2026-09-03T09:00:00.000Z',
          actor: 'board@example.org',
          messageId: replyId,
          subject: 'Re: Solicitud de actividad',
          destinations: `mailing-list-server::${GROUP}`,
        }),
      ],
    })
    expect(out.threads).toHaveLength(1)
    expect(out.threads[0].inboundCount).toBe(1)
    expect(out.threads[0].status).toBe('answered')
    expect(out.threads[0].replies).toEqual([
      { by: 'board@example.org', at: '2026-09-03T09:00:00.000Z', replyAll: true, method: 'sent' },
    ])
  })

  test('counts a duplicated inbound record once', () => {
    const out = build({
      inbound: [
        rec(),
        // Same message id delivered twice (page boundary or duplicate event)
        rec({ time: '2026-09-03T10:00:00.000Z' }),
      ],
      replied: [rec({ time: '2026-09-02T09:00:00.000Z', actor: 'board@example.org' })],
    })
    expect(out.threads).toHaveLength(1)
    expect(out.threads[0].inboundCount).toBe(1)
    expect(out.threads[0].lastInboundAt).toBe('2026-09-01T10:00:00.000Z')
    expect(out.threads[0].status).toBe('answered')
  })

  test('does not match a replied event without a message id', () => {
    const out = build({
      inbound: [rec({ messageId: '' })],
      replied: [
        rec({ time: '2026-09-02T09:00:00.000Z', actor: 'board@example.org', messageId: '' }),
      ],
    })
    expect(out.threads).toHaveLength(1)
    expect(out.threads[0].inboundCount).toBe(1)
    expect(out.threads[0].status).toBe('pending')
    expect(out.threads[0].replies).toEqual([])
  })

  test('an external follow-up after the reply reopens the thread', () => {
    const out = build({
      inbound: [
        rec(),
        rec({
          time: '2026-09-04T10:00:00.000Z',
          messageId: '<m2@ext.com>',
          subject: 'Re: Solicitud de actividad',
        }),
      ],
      replied: [rec({ time: '2026-09-02T09:00:00.000Z', actor: 'board@example.org' })],
    })
    expect(out.threads[0].inboundCount).toBe(2)
    expect(out.threads[0].lastInboundAt).toBe('2026-09-04T10:00:00.000Z')
    expect(out.threads[0].status).toBe('pending')
    expect(out.threads[0].daysWaiting).toBe(3)
  })

  test('groups an empty subject under the placeholder', () => {
    const out = build({ inbound: [rec({ subject: '' })] })
    expect(out.threads[0].id).toBe('(sin asunto)')
    expect(out.threads[0].subject).toBe('(sin asunto)')
  })

  test('sorts overdue first, then pending, then answered, newest inbound first', () => {
    const out = build({
      inbound: [
        rec({ messageId: '<a>', subject: 'A', time: '2026-09-05T10:00:00.000Z' }),
        rec({ messageId: '<b>', subject: 'B', time: '2026-08-20T10:00:00.000Z' }),
        rec({ messageId: '<c>', subject: 'C', time: '2026-08-22T10:00:00.000Z' }),
        rec({ messageId: '<d>', subject: 'D', time: '2026-09-01T10:00:00.000Z' }),
      ],
      replied: [
        rec({ messageId: '<d>', time: '2026-09-02T10:00:00.000Z', actor: 'board@example.org' }),
      ],
    })
    expect(out.threads.map((t) => t.subject)).toEqual(['C', 'B', 'A', 'D'])
    expect(out.summary).toEqual({ overdue: 2, pending: 1, answered: 1 })
  })

  test('deduplicates replies by actor and minute', () => {
    const out = build({
      inbound: [rec()],
      replied: [
        rec({ time: '2026-09-02T09:00:10.000Z', actor: 'board@example.org' }),
        rec({ time: '2026-09-02T09:00:40.000Z', actor: 'board@example.org' }),
      ],
    })
    expect(out.threads[0].replies).toHaveLength(1)
  })

  test('reports window, threshold, and generatedAt', () => {
    const out = build({})
    expect(out).toMatchObject({ generatedAt: NOW, windowDays: 30, thresholdDays: 7, threads: [] })
  })
})

describe('buildEmailThreads senders', () => {
  const senders = new Map([
    ['<m1@ext.com>', { name: 'Ana', email: 'ana@ext.com', date: '2026-09-01T10:00:00.000Z' }],
    ['<m2@ext.com>', { name: '', email: 'bob@ext.com', date: '2026-09-04T10:00:00.000Z' }],
  ])

  test('attaches the sender of the first inbound message', () => {
    const out = build({
      inbound: [
        rec(),
        rec({
          time: '2026-09-04T10:00:00.000Z',
          messageId: '<m2@ext.com>',
          subject: 'Re: Solicitud de actividad',
        }),
      ],
      senders,
    })
    expect(out.threads[0].sender).toEqual({ name: 'Ana', email: 'ana@ext.com' })
  })

  test('falls back to a later inbound message when the first has no match', () => {
    const out = build({
      inbound: [
        rec({ messageId: '<unknown@ext.com>' }),
        rec({
          time: '2026-09-04T10:00:00.000Z',
          messageId: '<m2@ext.com>',
          subject: 'Re: Solicitud de actividad',
        }),
      ],
      senders,
    })
    expect(out.threads[0].sender).toEqual({ name: '', email: 'bob@ext.com' })
  })

  test('is null without a match and without a senders map', () => {
    expect(build({ inbound: [rec({ messageId: '<x>' })], senders }).threads[0].sender).toBeNull()
    expect(build({ inbound: [rec()] }).threads[0].sender).toBeNull()
  })

  test('passes senderStatus through', () => {
    const status = { ok: false, reason: 'not_configured' }
    expect(build({ senderStatus: status }).senderStatus).toEqual(status)
    expect(build({}).senderStatus).toBeNull()
  })
})

describe('buildEmailThreads held messages', () => {
  test('drops inbound messages the group never fanned out and counts them', () => {
    const out = build({
      inbound: [rec(), rec({ messageId: '<spam@blast.com>', subject: 'Casino leads' })],
      sent: fanOut([rec()]),
      noFanOut: true,
    })
    expect(out.threads.map((t) => t.subject)).toEqual(['Solicitud de actividad'])
    expect(out.heldCount).toBe(1)
  })

  test('keeps a record without a message id', () => {
    const out = build({ inbound: [rec({ messageId: '' })], noFanOut: true })
    expect(out.threads).toHaveLength(1)
    expect(out.heldCount).toBe(0)
  })

  test('keeps everything when dropHeld is false', () => {
    const out = build({
      inbound: [rec({ messageId: '<spam@blast.com>' })],
      noFanOut: true,
      dropHeld: false,
    })
    expect(out.threads).toHaveLength(1)
    expect(out.heldCount).toBe(0)
  })

  test('reports zero held when every message was distributed', () => {
    expect(build({ inbound: [rec()] }).heldCount).toBe(0)
  })
})

describe('buildEmailThreads messageId', () => {
  test('exposes the newest inbound message id for deep links', () => {
    const out = build({
      inbound: [
        rec(),
        rec({
          time: '2026-09-04T10:00:00.000Z',
          messageId: '<m2@ext.com>',
          subject: 'Re: Solicitud de actividad',
        }),
      ],
    })
    expect(out.threads[0].messageId).toBe('<m2@ext.com>')
  })

  test('is null when no inbound record had an id', () => {
    expect(
      build({ inbound: [rec({ messageId: '' })], noFanOut: true }).threads[0].messageId
    ).toBeNull()
  })
})

describe('buildEmailThreads spam verdicts', () => {
  const copy = (actor, spam, over = {}) =>
    rec({ actor, spam, destinations: `gmail-ui::${actor}`, ...over })

  test('drops a message that every member mailbox flagged as spam', () => {
    const out = build({
      inbound: [rec()],
      memberCopies: [copy('a@example.org', true), copy('b@example.org', true)],
    })
    expect(out.threads).toHaveLength(0)
    expect(out.spamCount).toBe(1)
  })

  test('keeps a message with a mixed verdict', () => {
    const out = build({
      inbound: [rec()],
      memberCopies: [copy('a@example.org', true), copy('b@example.org', false)],
    })
    expect(out.threads).toHaveLength(1)
    expect(out.spamCount).toBe(0)
  })

  test('keeps a message without member copies', () => {
    const out = build({ inbound: [rec()] })
    expect(out.threads).toHaveLength(1)
    expect(out.spamCount).toBe(0)
  })

  test('ignores verdicts when dropHeld is false', () => {
    const out = build({
      inbound: [rec()],
      memberCopies: [copy('a@example.org', true)],
      dropHeld: false,
    })
    expect(out.threads).toHaveLength(1)
  })
})

describe('buildEmailThreads requireCopy', () => {
  const senders = new Map([['<m1@ext.com>', { name: 'Ana', email: 'ana@ext.com', date: 'x' }]])

  test('drops a thread with no copy in the reading mailbox', () => {
    const out = build({
      inbound: [rec(), rec({ messageId: '<gone@ext.com>', subject: 'Borrado' })],
      senders,
      requireCopy: true,
    })
    expect(out.threads.map((t) => t.subject)).toEqual(['Solicitud de actividad'])
    expect(out.noCopyCount).toBe(1)
  })

  test('keeps every thread when requireCopy is off', () => {
    const out = build({ inbound: [rec({ messageId: '<gone@ext.com>' })], senders })
    expect(out.threads).toHaveLength(1)
    expect(out.noCopyCount).toBe(0)
  })
})
