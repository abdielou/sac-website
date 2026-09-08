// test/emails-page.test.js
// The emails page lists unanswered group threads from the hook data

import React from 'react'

global.React = React

jest.mock('next-auth/react', () => ({ useSession: jest.fn() }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn() }) }))
jest.mock('../lib/hooks/useAdminData', () => ({ useEmailAccountability: jest.fn() }))

import { renderToString } from 'react-dom/server'
import { useSession } from 'next-auth/react'
import { useEmailAccountability } from '../lib/hooks/useAdminData'
import EmailsPage from '../app/admin/emails/page'

const thread = (over) => ({
  id: 'solicitud',
  subject: 'Solicitud de actividad',
  sender: null,
  firstInboundAt: '2026-08-25T10:00:00.000Z',
  lastInboundAt: '2026-08-25T10:00:00.000Z',
  inboundCount: 1,
  status: 'overdue',
  daysWaiting: 13,
  replies: [],
  ...over,
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
      heldCount: 0,
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
    replies: [
      { by: 'board@example.org', at: '2026-08-26T10:00:00.000Z', replyAll: false, method: 'sent' },
    ],
  }),
]

beforeEach(() => {
  useSession.mockReturnValue({
    status: 'authenticated',
    data: { user: { accessibleActions: ['read_emails'] } },
  })
})

describe('EmailsPage', () => {
  test('lists only unanswered threads with subject, sender, date, and days', () => {
    useEmailAccountability.mockReturnValue(loaded(three))
    const html = renderToString(React.createElement(EmailsPage))
    expect(html).toContain('Correos sin responder')
    expect(html).toContain('2 sin responder en los últimos 30 días')
    expect(html).toContain('Beta')
    expect(html).toContain('Alfa')
    expect(html).not.toContain('Gamma')
    expect(html).not.toContain('board@example.org')
    expect(html).toContain('Zoe Ruiz')
    expect(html).toContain('title="zoe@ext.com"')
    expect(html).toContain('ana@ext.com')
  })

  test('has no status column and no status filter', () => {
    useEmailAccountability.mockReturnValue(loaded(three))
    const html = renderToString(React.createElement(EmailsPage))
    expect(html).not.toContain('Estado')
    expect(html).not.toContain('Respondió')
    expect(html).not.toContain('Reply All')
    expect(html).not.toContain('aria-pressed')
  })

  test('renders sortable column headers as buttons', () => {
    useEmailAccountability.mockReturnValue(loaded(three))
    const html = renderToString(React.createElement(EmailsPage))
    for (const label of ['Asunto', 'Remitente', 'Recibido', 'Días']) {
      expect(html).toMatch(new RegExp(`<button[^>]*>[^<]*${label}`))
    }
  })

  test('colors the days cell by how long the thread has waited', () => {
    useEmailAccountability.mockReturnValue(
      loaded([
        thread({ id: 'd2', subject: 'Dos', daysWaiting: 2, status: 'pending' }),
        thread({ id: 'd5', subject: 'Cinco', daysWaiting: 5, status: 'pending' }),
        thread({ id: 'd9', subject: 'Nueve', daysWaiting: 9 }),
        thread({ id: 'd20', subject: 'Veinte', daysWaiting: 20 }),
      ])
    )
    const html = renderToString(React.createElement(EmailsPage))
    const cell = (days) => html.match(new RegExp(`<td[^>]*data-days="${days}"[^>]*>`))?.[0] ?? ''
    expect(cell(2)).toContain('bg-green-100')
    expect(cell(5)).toContain('bg-yellow-100')
    expect(cell(9)).toContain('bg-orange-100')
    expect(cell(20)).toContain('bg-red-100')
  })

  test('renders the all-answered state when nothing is pending', () => {
    useEmailAccountability.mockReturnValue(loaded([three[2]]))
    const html = renderToString(React.createElement(EmailsPage))
    expect(html).toContain('Todo respondido')
  })

  test('mentions messages held by the group in the subtitle', () => {
    useEmailAccountability.mockReturnValue(loaded(three, { heldCount: 23 }))
    expect(renderToString(React.createElement(EmailsPage))).toContain(
      '23 retenidos por el grupo, no mostrados'
    )
  })

  test('shows a notice when senders are unavailable', () => {
    useEmailAccountability.mockReturnValue(
      loaded(three, { senderStatus: { ok: false, reason: 'not_configured' } })
    )
    expect(renderToString(React.createElement(EmailsPage))).toContain(
      'Remitentes no disponibles: falta configurar GMAIL_SENDER_LABEL'
    )
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
    expect(renderToString(React.createElement(EmailsPage))).toContain('unauthorized_client')
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
