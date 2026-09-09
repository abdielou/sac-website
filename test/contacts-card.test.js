// test/emails-card.test.js
// ContactsCard renders counts for read_contacts users and nothing otherwise

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
jest.mock('../lib/hooks/useAdminData', () => ({ useContacts: jest.fn() }))

import { renderToString } from 'react-dom/server'
import { useSession } from 'next-auth/react'
import { useContacts } from '../lib/hooks/useAdminData'
import { ContactsCard } from '../components/admin/ContactsCard'

const withPerms = (perms) =>
  useSession.mockReturnValue({ data: { user: { accessibleActions: perms } } })

describe('ContactsCard', () => {
  test('renders nothing without read_contacts', () => {
    withPerms(['read_members'])
    useContacts.mockReturnValue({ data: undefined, isPending: false, isError: false })
    expect(renderToString(React.createElement(ContactsCard))).toBe('')
    expect(useContacts).toHaveBeenCalledWith({ enabled: false })
  })

  test('renders the two unanswered counts and links to the page', () => {
    withPerms(['read_contacts'])
    useContacts.mockReturnValue({
      data: { data: { summary: { overdue: 3, pending: 2, answered: 5 } } },
      isPending: false,
      isError: false,
    })
    const html = renderToString(React.createElement(ContactsCard))
    expect(html).toContain('Contactos')
    // Tie each count to its label so a swapped slot fails the test
    expect(html).toMatch(/Sin responder \+7 días<\/span><span[^>]*>3</)
    expect(html).toMatch(/Pendientes<\/span><span[^>]*>2</)
    expect(html).not.toContain('Respondidos')
    expect(html).toContain('href="/admin/contacts"')
  })

  test('renders a loading hint while pending', () => {
    withPerms(['read_contacts'])
    useContacts.mockReturnValue({ data: undefined, isPending: true, isError: false })
    expect(renderToString(React.createElement(ContactsCard))).toContain('Cargando')
  })

  test('renders the error message on failure', () => {
    withPerms(['read_contacts'])
    useContacts.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('unauthorized_client'),
    })
    expect(renderToString(React.createElement(ContactsCard))).toContain('unauthorized_client')
  })
})
