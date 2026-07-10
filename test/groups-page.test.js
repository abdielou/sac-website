// Smoke test: the Grupos admin page renders its initial UI shell

import React from 'react'

global.React = React

import { renderToString } from 'react-dom/server'
import GroupsAdminPage from '../app/admin/groups/page'

describe('Grupos admin page', () => {
  test('renders the sync UI shell', () => {
    const html = renderToString(React.createElement(GroupsAdminPage))
    expect(html).toContain('Sincronización de grupos')
    expect(html).toContain('Comparar grupos')
    expect(html).toContain('Comparar (sin caché)')
  })
})
