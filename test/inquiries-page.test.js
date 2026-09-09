// test/emails-page.test.js
// The emails page lists unanswered group threads from the hook data

import React from 'react'

global.React = React

jest.mock('next-auth/react', () => ({ useSession: jest.fn() }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn() }) }))
jest.mock('../lib/hooks/useAdminData', () => ({ useInquiries: jest.fn() }))

import { renderToString } from 'react-dom/server'
import { useSession } from 'next-auth/react'
import { useInquiries } from '../lib/hooks/useAdminData'
import InquiriesPage from '../app/admin/inquiries/page'

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
    data: { user: { accessibleActions: ['read_inquiries'], email: 'viewer@example.org' } },
  })
})

describe('InquiriesPage', () => {
  test('lists only unanswered threads with subject, sender, date, and days', () => {
    useInquiries.mockReturnValue(loaded(three))
    const html = renderToString(React.createElement(InquiriesPage))
    expect(html).toContain('Consultas sin responder')
    expect(html).toContain('2 sin responder en los últimos 30 días')
    expect(html).toContain('Beta')
    expect(html).toContain('Alfa')
    expect(html).not.toContain('Gamma')
    expect(html).not.toContain('board@example.org')
    expect(html).toContain('Zoe Ruiz')
    expect(html).toContain('title="zoe@ext.com"')
    expect(html).toContain('ana@ext.com')
  })

  test('lists the most recent unanswered email first by default', () => {
    useInquiries.mockReturnValue(
      loaded([
        thread({ id: 'old', subject: 'Viejo', lastInboundAt: '2026-08-01T10:00:00.000Z' }),
        thread({
          id: 'new',
          subject: 'Nuevo',
          lastInboundAt: '2026-09-05T10:00:00.000Z',
          status: 'pending',
        }),
        thread({ id: 'mid', subject: 'Medio', lastInboundAt: '2026-08-20T10:00:00.000Z' }),
      ])
    )
    const html = renderToString(React.createElement(InquiriesPage))
    const table = html.slice(html.indexOf('<table'))
    const order = ['Nuevo', 'Medio', 'Viejo'].map((s) => table.indexOf(s))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(table).toContain('▼')
  })

  test('links each subject to the message in the viewer Gmail', () => {
    useInquiries.mockReturnValue(loaded([thread({ messageId: '<m1@ext.com>' })]))
    const html = renderToString(React.createElement(InquiriesPage))
    expect(html).toContain(
      'href="https://mail.google.com/mail/?authuser=viewer%40example.org#search/rfc822msgid:m1%40ext.com"'
    )
    expect(html).toContain('target="_blank"')
  })

  test('renders a plain subject when the thread has no message id', () => {
    useInquiries.mockReturnValue(loaded([thread({ messageId: null })]))
    const html = renderToString(React.createElement(InquiriesPage))
    expect(html).toContain('Solicitud de actividad')
    expect(html).not.toContain('mail.google.com')
  })

  test('has no refresh button of its own; the header button covers it', () => {
    useInquiries.mockReturnValue(loaded(three))
    const html = renderToString(React.createElement(InquiriesPage))
    expect(html).not.toContain('Actualizar')
  })

  test('has no status column and no status filter', () => {
    useInquiries.mockReturnValue(loaded(three))
    const html = renderToString(React.createElement(InquiriesPage))
    expect(html).not.toContain('Estado')
    expect(html).not.toContain('Respondió')
    expect(html).not.toContain('Reply All')
    expect(html).not.toContain('aria-pressed')
  })

  test('renders sortable column headers as buttons', () => {
    useInquiries.mockReturnValue(loaded(three))
    const html = renderToString(React.createElement(InquiriesPage))
    for (const label of ['Asunto', 'Remitente', 'Recibido', 'Días']) {
      expect(html).toMatch(new RegExp(`<button[^>]*>[^<]*${label}`))
    }
  })

  test('colors the days cell by how long the thread has waited', () => {
    useInquiries.mockReturnValue(
      loaded([
        thread({ id: 'd2', subject: 'Dos', daysWaiting: 2, status: 'pending' }),
        thread({ id: 'd5', subject: 'Cinco', daysWaiting: 5, status: 'pending' }),
        thread({ id: 'd9', subject: 'Nueve', daysWaiting: 9 }),
        thread({ id: 'd20', subject: 'Veinte', daysWaiting: 20 }),
      ])
    )
    const html = renderToString(React.createElement(InquiriesPage))
    const cell = (days) => html.match(new RegExp(`<td[^>]*data-days="${days}"[^>]*>`))?.[0] ?? ''
    expect(cell(2)).toContain('bg-green-100')
    expect(cell(5)).toContain('bg-yellow-100')
    expect(cell(9)).toContain('bg-orange-100')
    expect(cell(20)).toContain('bg-red-100')
  })

  test('renders the all-answered state when nothing is pending', () => {
    useInquiries.mockReturnValue(loaded([three[2]]))
    const html = renderToString(React.createElement(InquiriesPage))
    expect(html).toContain('Todo respondido')
  })

  test('mentions messages held by the group in the subtitle', () => {
    useInquiries.mockReturnValue(loaded(three, { heldCount: 23 }))
    expect(renderToString(React.createElement(InquiriesPage))).toContain(
      '23 retenidos por el grupo, no mostrados'
    )
  })

  test('shows a notice when senders are unavailable', () => {
    useInquiries.mockReturnValue(
      loaded(three, { senderStatus: { ok: false, reason: 'not_configured' } })
    )
    expect(renderToString(React.createElement(InquiriesPage))).toContain(
      'Remitentes no disponibles: falta configurar GMAIL_SENDER_LABEL'
    )
  })

  test('renders the error state on failure', () => {
    useInquiries.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('unauthorized_client'),
      refresh: jest.fn(),
      isFetching: false,
      data: undefined,
    })
    expect(renderToString(React.createElement(InquiriesPage))).toContain('unauthorized_client')
  })

  test('renders nothing without read_inquiries', () => {
    useSession.mockReturnValue({
      status: 'authenticated',
      data: { user: { accessibleActions: ['read_members'] } },
    })
    useInquiries.mockReturnValue({
      isPending: true,
      isError: false,
      refresh: jest.fn(),
      isFetching: false,
    })
    expect(renderToString(React.createElement(InquiriesPage))).toBe('')
  })
})
