// test/emails-page.test.js
// Smoke tests: the emails page renders the table from the hook data

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
  firstInboundAt: '2026-08-25T10:00:00.000Z',
  lastInboundAt: '2026-08-25T10:00:00.000Z',
  inboundCount: 1,
  status: 'overdue',
  daysWaiting: 13,
  replies: [],
  ...over,
})

beforeEach(() => {
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
