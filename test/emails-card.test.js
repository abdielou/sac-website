// test/emails-card.test.js
// EmailsCard renders counts for read_emails users and nothing otherwise

import React from 'react'

global.React = React

jest.mock('next-auth/react', () => ({ useSession: jest.fn() }))
jest.mock('next/link', () => {
  // The mock factory cannot use out-of-scope variables, so require React here.
  const ReactLib = require('react')
  return {
    __esModule: true,
    default: ({ href, children, ...rest }) =>
      ReactLib.createElement(
        'a',
        { href: typeof href === 'string' ? href : href.pathname, ...rest },
        children
      ),
  }
})
jest.mock('../lib/hooks/useAdminData', () => ({ useEmailAccountability: jest.fn() }))

import { renderToString } from 'react-dom/server'
import { useSession } from 'next-auth/react'
import { useEmailAccountability } from '../lib/hooks/useAdminData'
import { EmailsCard } from '../components/admin/EmailsCard'

const withPerms = (perms) =>
  useSession.mockReturnValue({ data: { user: { accessibleActions: perms } } })

describe('EmailsCard', () => {
  test('renders nothing without read_emails', () => {
    withPerms(['read_members'])
    useEmailAccountability.mockReturnValue({ data: undefined, isPending: false, isError: false })
    expect(renderToString(React.createElement(EmailsCard))).toBe('')
    expect(useEmailAccountability).toHaveBeenCalledWith({ enabled: false })
  })

  test('renders the three counts and a link to the page', () => {
    withPerms(['read_emails'])
    useEmailAccountability.mockReturnValue({
      data: { data: { summary: { overdue: 3, pending: 2, answered: 5 } } },
      isPending: false,
      isError: false,
    })
    const html = renderToString(React.createElement(EmailsCard))
    expect(html).toContain('Correos del grupo')
    // Tie each count to its label so a swapped slot fails the test
    expect(html).toMatch(/Sin responder \+7 días<\/dt><dd[^>]*>3</)
    expect(html).toMatch(/Pendientes<\/dt><dd[^>]*>2</)
    expect(html).toMatch(/Respondidos<\/dt><dd[^>]*>5</)
    expect(html).toContain('href="/admin/emails"')
  })

  test('renders a loading hint while pending', () => {
    withPerms(['read_emails'])
    useEmailAccountability.mockReturnValue({ data: undefined, isPending: true, isError: false })
    expect(renderToString(React.createElement(EmailsCard))).toContain('Cargando')
  })

  test('renders the error message on failure', () => {
    withPerms(['read_emails'])
    useEmailAccountability.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('unauthorized_client'),
    })
    expect(renderToString(React.createElement(EmailsCard))).toContain('unauthorized_client')
  })
})
