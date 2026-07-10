// Smoke tests: GroupSyncCard renders on the dashboard and respects the
// sync_groups action permission (same model as ScanCard / scan_inbox)

import React from 'react'

global.React = React

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}))

import { renderToString } from 'react-dom/server'
import { useSession } from 'next-auth/react'
import { GroupSyncCard } from '../components/admin/GroupSyncCard'

describe('GroupSyncCard', () => {
  test('renders the card for a user with sync_groups permission', () => {
    useSession.mockReturnValue({
      data: { user: { accessibleActions: ['sync_groups'] } },
    })
    const html = renderToString(React.createElement(GroupSyncCard))
    expect(html).toContain('Sincronizar Grupos')
    expect(html).toContain('Comparar grupos')
  })

  test('renders nothing without the sync_groups permission', () => {
    useSession.mockReturnValue({
      data: { user: { accessibleActions: ['scan_inbox', 'write_members'] } },
    })
    const html = renderToString(React.createElement(GroupSyncCard))
    expect(html).toBe('')
  })
})
