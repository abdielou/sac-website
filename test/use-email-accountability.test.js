// test/use-email-accountability.test.js
// The emails hook must keep one shared cache entry across instances, so the
// dashboard card and the emails page agree after a forced refresh.

import React, { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEmailAccountability } from '../lib/hooks/useAdminData'

global.React = React
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const jsonResponse = (body) => ({ ok: true, status: 200, json: async () => body })

// Two independent hook instances: one plays the page, one plays the card.
// Each one reports its latest data through an effect, not during render.
const seen = {}
const handles = {}

function Page() {
  const q = useEmailAccountability()
  useEffect(() => {
    seen.page = q.data
    handles.refresh = q.refresh
  })
  return null
}

function Card() {
  const q = useEmailAccountability()
  useEffect(() => {
    seen.card = q.data
  })
  return null
}

const flush = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

describe('useEmailAccountability', () => {
  let container
  let root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    seen.page = undefined
    seen.card = undefined
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    delete global.fetch
  })

  test('a forced refresh from one instance updates the shared cache entry', async () => {
    const first = { data: { summary: { overdue: 3, pending: 2, answered: 5 } } }
    const second = { data: { summary: { overdue: 0, pending: 1, answered: 9 } } }
    global.fetch = jest.fn(async (url) =>
      jsonResponse(String(url).includes('refresh=true') ? second : first)
    )

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
    })

    await act(async () => {
      root.render(
        React.createElement(
          QueryClientProvider,
          { client },
          React.createElement(Page),
          React.createElement(Card)
        )
      )
    })
    await flush()

    expect(seen.page).toEqual(first)
    expect(seen.card).toEqual(first)
    expect(global.fetch).toHaveBeenCalledTimes(1)

    await act(async () => {
      handles.refresh()
    })
    await flush()

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(String(global.fetch.mock.calls[1][0])).toContain('refresh=true')
    // Both instances read the same entry, so the card sees the fresh counts.
    expect(seen.page).toEqual(second)
    expect(seen.card).toEqual(second)
    expect(
      client
        .getQueryCache()
        .getAll()
        .map((q) => q.queryKey)
    ).toEqual([['emails']])
  })
})
