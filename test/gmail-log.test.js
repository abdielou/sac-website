// test/gmail-log.test.js
// Reports API reader: auth setup, pagination, filters, normalization, caching

const mockRequest = jest.fn()

jest.mock('google-auth-library', () => ({
  JWT: jest.fn().mockImplementation((opts) => ({ opts, request: mockRequest })),
}))

jest.mock('../lib/gmail-senders', () => ({
  fetchSenders: jest.fn(),
  createGmailAuth: jest.fn(() => ({ kind: 'gmail-auth' })),
}))

import { JWT } from 'google-auth-library'
import { fetchSenders, createGmailAuth } from '../lib/gmail-senders'
import { invalidateCache, CACHE_KEYS } from '../lib/cache'
import { fetchGmailLogRecords, getEmailAccountability, GmailLogConfigError } from '../lib/gmail-log'

const ENV = { ...process.env }

const activity = (over) => ({
  id: { time: '2026-09-01T10:00:00.000Z' },
  actor: { email: 'Info@example.org' },
  events: [
    {
      name: 'delivery',
      parameters: [
        {
          name: 'event_info',
          messageValue: { parameter: [{ name: 'mail_event_type', intValue: '2' }] },
        },
        {
          name: 'message_info',
          messageValue: {
            parameter: [
              { name: 'rfc2822_message_id', value: '<m1@ext.com>' },
              { name: 'subject', value: 'Hola' },
              { name: 'flattened_destinations', value: 'mailing-list-server::info@example.org' },
            ],
          },
        },
      ],
    },
  ],
  ...over,
})

beforeEach(() => {
  jest.clearAllMocks()
  invalidateCache(CACHE_KEYS.EMAILS)
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'sa@example.iam'
  process.env.GOOGLE_PRIVATE_KEY = 'line1\\nline2'
  process.env.GOOGLE_REPORTS_ADMIN_EMAIL = 'admin@example.org'
  process.env.EMAIL_GROUP_ADDRESS = 'info@example.org'
  delete process.env.GMAIL_SENDER_LABEL
  delete process.env.GMAIL_SENDER_MAILBOX
  fetchSenders.mockResolvedValue(new Map())
})

afterAll(() => {
  process.env = ENV
})

describe('fetchGmailLogRecords', () => {
  test('builds the URL with user key, filter, window, and page size, then normalizes records', async () => {
    mockRequest.mockResolvedValueOnce({ data: { items: [activity()] } })
    const auth = { request: mockRequest }
    const records = await fetchGmailLogRecords({
      auth,
      userKey: 'info@example.org',
      mailEventType: 2,
      startTime: '2026-08-08T00:00:00.000Z',
      endTime: '2026-09-07T00:00:00.000Z',
    })
    const url = new URL(mockRequest.mock.calls[0][0].url)
    expect(url.pathname).toBe(
      '/admin/reports/v1/activity/users/info%40example.org/applications/gmail'
    )
    expect(url.searchParams.get('filters')).toBe('event_info.mail_event_type==2')
    expect(url.searchParams.get('startTime')).toBe('2026-08-08T00:00:00.000Z')
    expect(url.searchParams.get('endTime')).toBe('2026-09-07T00:00:00.000Z')
    expect(url.searchParams.get('maxResults')).toBe('1000')
    expect(records).toEqual([
      {
        time: '2026-09-01T10:00:00.000Z',
        actor: 'info@example.org',
        messageId: '<m1@ext.com>',
        subject: 'Hola',
        destinations: 'mailing-list-server::info@example.org',
      },
    ])
  })

  test('follows nextPageToken until the last page', async () => {
    mockRequest
      .mockResolvedValueOnce({ data: { items: [activity()], nextPageToken: 'p2' } })
      .mockResolvedValueOnce({
        data: { items: [activity({ id: { time: '2026-09-02T10:00:00.000Z' } })] },
      })
    const records = await fetchGmailLogRecords({
      auth: { request: mockRequest },
      userKey: 'all',
      mailEventType: 9,
      startTime: '2026-08-08T00:00:00.000Z',
      endTime: '2026-09-07T00:00:00.000Z',
    })
    expect(records).toHaveLength(2)
    const second = new URL(mockRequest.mock.calls[1][0].url)
    expect(second.searchParams.get('pageToken')).toBe('p2')
  })

  test('returns an empty list when the API has no items', async () => {
    mockRequest.mockResolvedValueOnce({ data: {} })
    const records = await fetchGmailLogRecords({
      auth: { request: mockRequest },
      userKey: 'all',
      mailEventType: 1,
      startTime: '2026-08-08T00:00:00.000Z',
      endTime: '2026-09-07T00:00:00.000Z',
    })
    expect(records).toEqual([])
  })
})

describe('getEmailAccountability', () => {
  test('throws GmailLogConfigError when an env var is missing', async () => {
    delete process.env.GOOGLE_REPORTS_ADMIN_EMAIL
    await expect(getEmailAccountability()).rejects.toBeInstanceOf(GmailLogConfigError)
    expect(mockRequest).not.toHaveBeenCalled()
  })

  test('creates a JWT that impersonates the admin with the audit scope', async () => {
    mockRequest.mockResolvedValue({ data: { items: [] } })
    await getEmailAccountability(true)
    expect(JWT).toHaveBeenCalledWith({
      email: 'sa@example.iam',
      key: 'line1\nline2',
      scopes: ['https://www.googleapis.com/auth/admin.reports.audit.readonly'],
      subject: 'admin@example.org',
    })
  })

  test('runs the three queries and returns threads', async () => {
    mockRequest.mockResolvedValue({ data: { items: [] } })
    mockRequest.mockResolvedValueOnce({ data: { items: [activity()] } })
    const { data, fromCache } = await getEmailAccountability(true)
    expect(fromCache).toBe(false)
    expect(mockRequest).toHaveBeenCalledTimes(3)
    const filters = mockRequest.mock.calls.map((c) => new URL(c[0].url).searchParams.get('filters'))
    expect(filters).toEqual([
      'event_info.mail_event_type==2',
      'event_info.mail_event_type==9',
      'event_info.mail_event_type==1',
    ])
    const inboundUrl = new URL(mockRequest.mock.calls[0][0].url)
    expect(inboundUrl.pathname).toContain('/users/info%40example.org/')
    expect(data.threads).toHaveLength(1)
    expect(data.threads[0].subject).toBe('Hola')
    expect(data.windowDays).toBe(30)
  })

  test('serves the second call from cache', async () => {
    mockRequest.mockResolvedValue({ data: { items: [] } })
    await getEmailAccountability(true)
    const second = await getEmailAccountability()
    expect(second.fromCache).toBe(true)
    expect(mockRequest).toHaveBeenCalledTimes(3)
  })

  test('propagates API errors', async () => {
    mockRequest.mockRejectedValue(new Error('Admin SDK API has not been used'))
    await expect(getEmailAccountability(true)).rejects.toThrow('Admin SDK API has not been used')
  })
})

describe('getEmailAccountability senders', () => {
  test('skips the sender lookup when GMAIL_SENDER_LABEL is empty', async () => {
    mockRequest.mockResolvedValue({ data: { items: [] } })
    const { data } = await getEmailAccountability(true)
    expect(fetchSenders).not.toHaveBeenCalled()
    expect(data.senderStatus).toEqual({ ok: false, reason: 'not_configured' })
  })

  test('reads senders from the admin mailbox by default and reports the count', async () => {
    process.env.GMAIL_SENDER_LABEL = 'SAC/info'
    mockRequest.mockResolvedValue({ data: { items: [] } })
    mockRequest.mockResolvedValueOnce({ data: { items: [activity()] } })
    fetchSenders.mockResolvedValue(
      new Map([['<m1@ext.com>', { name: 'Ana', email: 'ana@ext.com', date: 'x' }]])
    )
    const { data } = await getEmailAccountability(true)
    expect(createGmailAuth).toHaveBeenCalledWith('admin@example.org')
    expect(fetchSenders).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: { kind: 'gmail-auth' },
        mailbox: 'admin@example.org',
        labelName: 'SAC/info',
      })
    )
    expect(data.senderStatus).toEqual({ ok: true, count: 1 })
    expect(data.threads[0].sender).toEqual({ name: 'Ana', email: 'ana@ext.com' })
  })

  test('uses GMAIL_SENDER_MAILBOX when set', async () => {
    process.env.GMAIL_SENDER_LABEL = 'SAC/info'
    process.env.GMAIL_SENDER_MAILBOX = 'bot@example.org'
    mockRequest.mockResolvedValue({ data: { items: [] } })
    await getEmailAccountability(true)
    expect(createGmailAuth).toHaveBeenCalledWith('bot@example.org')
  })

  test('keeps the threads when the sender lookup fails', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    process.env.GMAIL_SENDER_LABEL = 'SAC/info'
    mockRequest.mockResolvedValue({ data: { items: [] } })
    mockRequest.mockResolvedValueOnce({ data: { items: [activity()] } })
    fetchSenders.mockRejectedValue(new Error('unauthorized_client'))
    const { data } = await getEmailAccountability(true)
    expect(data.threads).toHaveLength(1)
    expect(data.threads[0].sender).toBeNull()
    expect(data.senderStatus).toEqual({ ok: false, reason: 'unauthorized_client' })
    spy.mockRestore()
  })
})
