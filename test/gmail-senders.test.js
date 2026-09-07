// test/gmail-senders.test.js
// Gmail metadata reader: From parsing, label lookup, listing, window cutoff

const mockRequest = jest.fn()

jest.mock('google-auth-library', () => ({
  JWT: jest.fn().mockImplementation((opts) => ({ opts, request: mockRequest })),
}))

import { JWT } from 'google-auth-library'
import { parseFromHeader, fetchSenders, createGmailAuth } from '../lib/gmail-senders'

const MAILBOX = 'admin@example.org'
const START = '2026-08-08T00:00:00.000Z'

const message = (id, { from, messageId, date }) => ({
  id,
  internalDate: String(new Date(date).getTime()),
  payload: {
    headers: [
      { name: 'From', value: from },
      { name: 'Message-ID', value: messageId },
      { name: 'Date', value: date },
    ],
  },
})

function mockGmail({ labels, pages, messages }) {
  mockRequest.mockImplementation(async ({ url }) => {
    const u = new URL(url)
    if (u.pathname.endsWith('/labels')) return { data: { labels } }
    if (u.pathname.endsWith('/messages')) {
      const token = u.searchParams.get('pageToken') ?? 'p1'
      return { data: pages[token] }
    }
    const id = u.pathname.split('/').pop()
    return { data: messages[id] }
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'sa@example.iam'
  process.env.GOOGLE_PRIVATE_KEY = 'line1\\nline2'
})

describe('parseFromHeader', () => {
  test('splits a display name and an address', () => {
    expect(parseFromHeader('"Ana Pérez" <Ana@X.com>')).toEqual({
      name: 'Ana Pérez',
      email: 'ana@x.com',
    })
    expect(parseFromHeader('Ana Pérez <ana@x.com>')).toEqual({
      name: 'Ana Pérez',
      email: 'ana@x.com',
    })
  })

  test('handles a bare address and empty input', () => {
    expect(parseFromHeader('ana@x.com')).toEqual({ name: '', email: 'ana@x.com' })
    expect(parseFromHeader('')).toEqual({ name: '', email: '' })
    expect(parseFromHeader(undefined)).toEqual({ name: '', email: '' })
  })
})

describe('createGmailAuth', () => {
  test('builds a JWT with the metadata scope that impersonates the mailbox', () => {
    createGmailAuth(MAILBOX)
    expect(JWT).toHaveBeenCalledWith({
      email: 'sa@example.iam',
      key: 'line1\nline2',
      scopes: ['https://www.googleapis.com/auth/gmail.metadata'],
      subject: MAILBOX,
    })
  })
})

describe('fetchSenders', () => {
  test('resolves the label by name, lists it, and maps Message-ID to sender', async () => {
    mockGmail({
      labels: [
        { id: 'INBOX', name: 'INBOX', type: 'system' },
        { id: 'Label_7', name: 'SAC/info', type: 'user' },
      ],
      pages: { p1: { messages: [{ id: 'm1' }] } },
      messages: {
        m1: message('m1', {
          from: '"Ana" <ana@x.com>',
          messageId: ' <abc@x.com> ',
          date: '2026-09-01T10:00:00Z',
        }),
      },
    })
    const senders = await fetchSenders({
      auth: { request: mockRequest },
      mailbox: MAILBOX,
      labelName: 'sac/INFO',
      startTime: START,
    })
    expect(senders.get('<abc@x.com>')).toEqual({
      name: 'Ana',
      email: 'ana@x.com',
      date: '2026-09-01T10:00:00.000Z',
    })

    const urls = mockRequest.mock.calls.map((c) => new URL(c[0].url))
    expect(urls[0].pathname).toBe('/gmail/v1/users/admin%40example.org/labels')
    expect(urls[1].pathname).toBe('/gmail/v1/users/admin%40example.org/messages')
    expect(urls[1].searchParams.get('labelIds')).toBe('Label_7')
    expect(urls[1].searchParams.get('maxResults')).toBe('500')
    expect(urls[1].searchParams.has('q')).toBe(false)
    expect(urls[2].pathname).toBe('/gmail/v1/users/admin%40example.org/messages/m1')
    expect(urls[2].searchParams.get('format')).toBe('metadata')
    expect(urls[2].searchParams.getAll('metadataHeaders')).toEqual(['From', 'Message-ID', 'Date'])
  })

  test('throws when the label does not exist', async () => {
    mockGmail({ labels: [{ id: 'INBOX', name: 'INBOX', type: 'system' }], pages: {}, messages: {} })
    await expect(
      fetchSenders({
        auth: { request: mockRequest },
        mailbox: MAILBOX,
        labelName: 'SAC/info',
        startTime: START,
      })
    ).rejects.toThrow('Gmail label not found: SAC/info')
  })

  test('follows pages and stops at the first page older than the window', async () => {
    mockGmail({
      labels: [{ id: 'L', name: 'SAC/info', type: 'user' }],
      pages: {
        p1: { messages: [{ id: 'new' }], nextPageToken: 'p2' },
        p2: { messages: [{ id: 'edge' }, { id: 'old' }], nextPageToken: 'p3' },
        p3: { messages: [{ id: 'older' }] },
      },
      messages: {
        new: message('new', { from: 'a@x.com', messageId: '<new>', date: '2026-09-01T10:00:00Z' }),
        edge: message('edge', {
          from: 'b@x.com',
          messageId: '<edge>',
          date: '2026-08-10T10:00:00Z',
        }),
        old: message('old', { from: 'c@x.com', messageId: '<old>', date: '2026-08-01T10:00:00Z' }),
        older: message('older', {
          from: 'd@x.com',
          messageId: '<older>',
          date: '2026-07-01T10:00:00Z',
        }),
      },
    })
    const senders = await fetchSenders({
      auth: { request: mockRequest },
      mailbox: MAILBOX,
      labelName: 'SAC/info',
      startTime: START,
    })
    expect([...senders.keys()]).toEqual(['<new>', '<edge>'])
    const listCalls = mockRequest.mock.calls.filter((c) =>
      new URL(c[0].url).pathname.endsWith('/messages')
    )
    expect(listCalls).toHaveLength(2)
    expect(new URL(listCalls[1][0].url).searchParams.get('pageToken')).toBe('p2')
  })

  test('returns an empty map when the label holds no messages', async () => {
    mockGmail({
      labels: [{ id: 'L', name: 'SAC/info', type: 'user' }],
      pages: { p1: {} },
      messages: {},
    })
    const senders = await fetchSenders({
      auth: { request: mockRequest },
      mailbox: MAILBOX,
      labelName: 'SAC/info',
      startTime: START,
    })
    expect(senders.size).toBe(0)
  })

  test('skips messages without a Message-ID header', async () => {
    mockGmail({
      labels: [{ id: 'L', name: 'SAC/info', type: 'user' }],
      pages: { p1: { messages: [{ id: 'm1' }] } },
      messages: {
        m1: {
          id: 'm1',
          internalDate: String(Date.parse('2026-09-01T10:00:00Z')),
          payload: { headers: [{ name: 'From', value: 'a@x.com' }] },
        },
      },
    })
    const senders = await fetchSenders({
      auth: { request: mockRequest },
      mailbox: MAILBOX,
      labelName: 'SAC/info',
      startTime: START,
    })
    expect(senders.size).toBe(0)
  })
})
