// test/emails-card.test.js
// InquiriesCard renders counts for read_inquiries users and nothing otherwise

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
jest.mock('../lib/hooks/useAdminData', () => ({ useInquiries: jest.fn() }))

import { renderToString } from 'react-dom/server'
import { useSession } from 'next-auth/react'
import { useInquiries } from '../lib/hooks/useAdminData'
import { InquiriesCard } from '../components/admin/InquiriesCard'

const withPerms = (perms) =>
  useSession.mockReturnValue({ data: { user: { accessibleActions: perms } } })

describe('InquiriesCard', () => {
  test('renders nothing without read_inquiries', () => {
    withPerms(['read_members'])
    useInquiries.mockReturnValue({ data: undefined, isPending: false, isError: false })
    expect(renderToString(React.createElement(InquiriesCard))).toBe('')
    expect(useInquiries).toHaveBeenCalledWith({ enabled: false })
  })

  test('renders the two unanswered counts and links to the page', () => {
    withPerms(['read_inquiries'])
    useInquiries.mockReturnValue({
      data: { data: { summary: { overdue: 3, pending: 2, answered: 5 } } },
      isPending: false,
      isError: false,
    })
    const html = renderToString(React.createElement(InquiriesCard))
    expect(html).toContain('Consultas')
    // Tie each count to its label so a swapped slot fails the test
    expect(html).toMatch(/Sin responder \+7 días<\/span><span[^>]*>3</)
    expect(html).toMatch(/Pendientes<\/span><span[^>]*>2</)
    expect(html).not.toContain('Respondidos')
    expect(html).toContain('href="/admin/inquiries"')
  })

  test('renders a loading hint while pending', () => {
    withPerms(['read_inquiries'])
    useInquiries.mockReturnValue({ data: undefined, isPending: true, isError: false })
    expect(renderToString(React.createElement(InquiriesCard))).toContain('Cargando')
  })

  test('renders the error message on failure', () => {
    withPerms(['read_inquiries'])
    useInquiries.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('unauthorized_client'),
    })
    expect(renderToString(React.createElement(InquiriesCard))).toContain('unauthorized_client')
  })
})
