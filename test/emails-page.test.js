// test/emails-page.test.js
// Smoke tests: the emails page renders the table from the hook data

import React from 'react'

global.React = React

jest.mock('next-auth/react', () => ({ useSession: jest.fn() }))
const mockReplace = jest.fn()
let mockSearch = ''
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/admin/emails',
  useSearchParams: () => new URLSearchParams(mockSearch),
}))
jest.mock('../lib/hooks/useAdminData', () => ({ useEmailAccountability: jest.fn() }))

import { renderToString } from 'react-dom/server'
import { useSession } from 'next-auth/react'
import { useEmailAccountability } from '../lib/hooks/useAdminData'
import EmailsPage from '../app/admin/emails/page'

const thread = (over) => ({
  id: 'solicitud',
  subject: 'Solicitud de actividad',
  firstInboundAt: '2026-08-25T10:00:00.000Z',
  lastInboundAt: '2026-08-25T10:00:00.000Z',
  inboundCount: 1,
  status: 'overdue',
  daysWaiting: 13,
  replies: [],
  ...over,
})

beforeEach(() => {
  mockSearch = ''
  mockReplace.mockClear()
  useSession.mockReturnValue({
    status: 'authenticated',
    data: { user: { accessibleActions: ['read_emails'] } },
  })
})

describe('EmailsPage', () => {
  test('renders one row per thread with status, replier, and reply-all flag', () => {
    useEmailAccountability.mockReturnValue({
      isPending: false,
      isError: false,
      refresh: jest.fn(),
      isFetching: false,
      data: {
        meta: { fromCache: false },
        data: {
          generatedAt: '2026-09-07T12:00:00.000Z',
          windowDays: 30,
          thresholdDays: 7,
          summary: { overdue: 1, pending: 0, answered: 1 },
          threads: [
            thread(),
            thread({
              id: 'avistamiento',
              subject: 'Avistamiento',
              status: 'answered',
              daysWaiting: 1,
              replies: [
                {
                  by: 'board@example.org',
                  at: '2026-08-26T10:00:00.000Z',
                  replyAll: true,
                  method: 'exact',
                },
              ],
            }),
          ],
        },
      },
    })
    const html = renderToString(React.createElement(EmailsPage))
    expect(html).toContain('Correos del grupo')
    expect(html).toContain('Solicitud de actividad')
    expect(html).toContain('Sin responder')
    expect(html).toContain('Avistamiento')
    expect(html).toContain('Respondido')
    expect(html).toContain('board@example.org')
    expect(html).toContain('Sí')
    expect(html).toContain('Últimos 30 días')
  })

  test('renders the empty state when there are no threads', () => {
    useEmailAccountability.mockReturnValue({
      isPending: false,
      isError: false,
      refresh: jest.fn(),
      isFetching: false,
      data: {
        meta: { fromCache: true },
        data: {
          generatedAt: '2026-09-07T12:00:00.000Z',
          windowDays: 30,
          thresholdDays: 7,
          summary: { overdue: 0, pending: 0, answered: 0 },
          threads: [],
        },
      },
    })
    const html = renderToString(React.createElement(EmailsPage))
    expect(html).toContain('No hay correos en la ventana')
  })

  test('renders the error state on failure', () => {
    useEmailAccountability.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('unauthorized_client'),
      refresh: jest.fn(),
      isFetching: false,
      data: undefined,
    })
    const html = renderToString(React.createElement(EmailsPage))
    expect(html).toContain('unauthorized_client')
  })

  test('renders nothing without read_emails', () => {
    useSession.mockReturnValue({
      status: 'authenticated',
      data: { user: { accessibleActions: ['read_members'] } },
    })
    useEmailAccountability.mockReturnValue({
      isPending: true,
      isError: false,
      refresh: jest.fn(),
      isFetching: false,
    })
    expect(renderToString(React.createElement(EmailsPage))).toBe('')
  })
})

const loaded = (threads, extra = {}) => ({
  isPending: false,
  isError: false,
  refresh: jest.fn(),
  isFetching: false,
  data: {
    meta: { fromCache: false },
    data: {
      generatedAt: '2026-09-07T12:00:00.000Z',
      windowDays: 30,
      thresholdDays: 7,
      senderStatus: { ok: true, count: threads.length },
      summary: {
        overdue: threads.filter((t) => t.status === 'overdue').length,
        pending: threads.filter((t) => t.status === 'pending').length,
        answered: threads.filter((t) => t.status === 'answered').length,
      },
      threads,
      ...extra,
    },
  },
})

const three = [
  thread({ id: 'b', subject: 'Beta', sender: { name: 'Zoe Ruiz', email: 'zoe@ext.com' } }),
  thread({
    id: 'a',
    subject: 'Alfa',
    status: 'pending',
    daysWaiting: 2,
    sender: { name: '', email: 'ana@ext.com' },
  }),
  thread({
    id: 'c',
    subject: 'Gamma',
    status: 'answered',
    daysWaiting: 1,
    sender: null,
    replies: [
      { by: 'board@example.org', at: '2026-08-26T10:00:00.000Z', replyAll: false, method: 'sent' },
    ],
  }),
]

describe('EmailsPage sender, filter, and sort', () => {
  test('renders the sender name or email and a dash when unknown', () => {
    useEmailAccountability.mockReturnValue(loaded(three))
    const html = renderToString(React.createElement(EmailsPage))
    expect(html).toContain('Remitente')
    expect(html).toContain('Zoe Ruiz')
    expect(html).toContain('title="zoe@ext.com"')
    expect(html).toContain('ana@ext.com')
  })

  test('renders status filter buttons with counts and marks "Todos" active by default', () => {
    useEmailAccountability.mockReturnValue(loaded(three))
    const html = renderToString(React.createElement(EmailsPage))
    expect(html).toMatch(/Todos[^<]*<[^>]*>3</)
    expect(html).toMatch(/Sin responder[^<]*<[^>]*>1</)
    expect(html).toMatch(/Pendiente[^<]*<[^>]*>1</)
    expect(html).toMatch(/Respondido[^<]*<[^>]*>1</)
    expect(html).toMatch(/aria-pressed="true"[^>]*>Todos|Todos[^<]*aria-pressed="true"/)
  })

  test('preselects the filter from ?status= and hides the other rows', () => {
    mockSearch = 'status=pending'
    useEmailAccountability.mockReturnValue(loaded(three))
    const html = renderToString(React.createElement(EmailsPage))
    expect(html).toContain('Alfa')
    expect(html).not.toContain('Beta')
    expect(html).not.toContain('Gamma')
  })

  test('renders sortable column headers as buttons', () => {
    useEmailAccountability.mockReturnValue(loaded(three))
    const html = renderToString(React.createElement(EmailsPage))
    for (const label of ['Asunto', 'Remitente', 'Recibido', 'Días', 'Estado', 'Respondió']) {
      expect(html).toMatch(new RegExp(`<button[^>]*>[^<]*${label}`))
    }
  })

  test('shows a notice when senders are unavailable', () => {
    useEmailAccountability.mockReturnValue(
      loaded(three, { senderStatus: { ok: false, reason: 'not_configured' } })
    )
    expect(renderToString(React.createElement(EmailsPage))).toContain(
      'Remitentes no disponibles: falta configurar GMAIL_SENDER_LABEL'
    )
    useEmailAccountability.mockReturnValue(
      loaded(three, { senderStatus: { ok: false, reason: 'unauthorized_client' } })
    )
    expect(renderToString(React.createElement(EmailsPage))).toContain(
      'Remitentes no disponibles: unauthorized_client'
    )
  })

  test('shows no notice when senders loaded', () => {
    useEmailAccountability.mockReturnValue(loaded(three))
    expect(renderToString(React.createElement(EmailsPage))).not.toContain(
      'Remitentes no disponibles'
    )
  })
})
