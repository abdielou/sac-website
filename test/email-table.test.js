// test/email-table.test.js
// Client-side sort and filter helpers for the emails page

import { filterThreads, sortThreads, gmailMessageUrl, STATUS_ORDER } from '../lib/email-table'

const t = (over) => ({
  id: over.subject.toLowerCase(),
  subject: over.subject,
  sender: null,
  lastInboundAt: '2026-09-01T10:00:00.000Z',
  daysWaiting: 0,
  status: 'pending',
  replies: [],
  ...over,
})

const threads = [
  t({
    subject: 'B',
    status: 'overdue',
    daysWaiting: 9,
    lastInboundAt: '2026-08-29T10:00:00.000Z',
    sender: { name: 'Zoe', email: 'zoe@x.com' },
  }),
  t({
    subject: 'a',
    status: 'pending',
    daysWaiting: 2,
    lastInboundAt: '2026-09-05T10:00:00.000Z',
    sender: { name: '', email: 'ana@x.com' },
  }),
  t({
    subject: 'C',
    status: 'answered',
    daysWaiting: 1,
    lastInboundAt: '2026-09-03T10:00:00.000Z',
    replies: [
      { by: 'board@example.org', at: '2026-09-04T10:00:00.000Z', replyAll: true, method: 'exact' },
    ],
  }),
]

describe('filterThreads', () => {
  test('returns all threads for "all"', () => {
    expect(filterThreads(threads, 'all')).toHaveLength(3)
  })

  test.each(['overdue', 'pending', 'answered'])('keeps only %s threads', (status) => {
    const out = filterThreads(threads, status)
    expect(out).toHaveLength(1)
    expect(out[0].status).toBe(status)
  })

  test('treats an unknown status as "all"', () => {
    expect(filterThreads(threads, 'bogus')).toHaveLength(3)
  })
})

describe('sortThreads', () => {
  test('sorts by subject case-insensitively, both directions', () => {
    expect(sortThreads(threads, 'subject', 'asc').map((x) => x.subject)).toEqual(['a', 'B', 'C'])
    expect(sortThreads(threads, 'subject', 'desc').map((x) => x.subject)).toEqual(['C', 'B', 'a'])
  })

  test('sorts by sender email with missing senders last in both directions', () => {
    expect(sortThreads(threads, 'sender', 'asc').map((x) => x.subject)).toEqual(['a', 'B', 'C'])
    expect(sortThreads(threads, 'sender', 'desc').map((x) => x.subject)).toEqual(['B', 'a', 'C'])
  })

  test('sorts by received date', () => {
    expect(sortThreads(threads, 'lastInboundAt', 'asc').map((x) => x.subject)).toEqual([
      'B',
      'C',
      'a',
    ])
    expect(sortThreads(threads, 'lastInboundAt', 'desc').map((x) => x.subject)).toEqual([
      'a',
      'C',
      'B',
    ])
  })

  test('sorts by days waiting numerically', () => {
    expect(sortThreads(threads, 'daysWaiting', 'asc').map((x) => x.daysWaiting)).toEqual([1, 2, 9])
    expect(sortThreads(threads, 'daysWaiting', 'desc').map((x) => x.daysWaiting)).toEqual([9, 2, 1])
  })

  test('sorts by status in overdue, pending, answered order', () => {
    expect(sortThreads(threads, 'status', 'asc').map((x) => x.status)).toEqual([
      'overdue',
      'pending',
      'answered',
    ])
    expect(sortThreads(threads, 'status', 'desc').map((x) => x.status)).toEqual([
      'answered',
      'pending',
      'overdue',
    ])
    expect(STATUS_ORDER).toEqual({ overdue: 0, pending: 1, answered: 2 })
  })

  test('sorts by replier with unanswered threads last in both directions', () => {
    expect(sortThreads(threads, 'replier', 'asc')[0].subject).toBe('C')
    expect(sortThreads(threads, 'replier', 'desc')[0].subject).toBe('C')
  })

  test('is stable and does not mutate the input', () => {
    const same = [t({ subject: 'x', daysWaiting: 1 }), t({ subject: 'y', daysWaiting: 1 })]
    const out = sortThreads(same, 'daysWaiting', 'asc')
    expect(out.map((x) => x.subject)).toEqual(['x', 'y'])
    expect(same.map((x) => x.subject)).toEqual(['x', 'y'])
    expect(out).not.toBe(same)
  })

  test('returns the input order for an unknown key', () => {
    expect(sortThreads(threads, 'nope', 'asc').map((x) => x.subject)).toEqual(['B', 'a', 'C'])
  })
})

describe('gmailMessageUrl', () => {
  test('builds a Gmail search by Message-ID for the viewer account', () => {
    expect(gmailMessageUrl('<abc+1@x.com>', 'viewer@example.org')).toBe(
      'https://mail.google.com/mail/?authuser=viewer%40example.org#search/rfc822msgid:abc%2B1%40x.com'
    )
  })

  test('omits authuser without a viewer and returns null without an id', () => {
    expect(gmailMessageUrl('<abc@x.com>')).toBe(
      'https://mail.google.com/mail/#search/rfc822msgid:abc%40x.com'
    )
    expect(gmailMessageUrl(null, 'v@x.com')).toBeNull()
    expect(gmailMessageUrl('', 'v@x.com')).toBeNull()
  })
})
