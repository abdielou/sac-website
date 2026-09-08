// test/refresh-scope.test.js
// Header refresh scope: pathname to section, section to cache and query keys

import { refreshScopeFor, normalizeRefreshScope, REFRESH_SCOPES } from '../lib/admin/refresh-scope'

describe('refreshScopeFor', () => {
  test.each([
    ['/admin/emails', 'emails'],
    ['/admin/emails/', 'emails'],
    ['/admin/payments', 'payments'],
    ['/admin/members', 'members'],
    ['/admin/members/123', 'members'],
    ['/admin', 'all'],
    ['/admin/', 'all'],
    ['/admin/articles', 'all'],
    ['/admin/media', 'all'],
    ['/admin/all', 'all'],
    [null, 'all'],
    [undefined, 'all'],
  ])('%s -> %s', (pathname, scope) => {
    expect(refreshScopeFor(pathname)).toBe(scope)
  })
})

describe('normalizeRefreshScope', () => {
  test('keeps known scopes and maps anything else to all', () => {
    expect(normalizeRefreshScope('emails')).toBe('emails')
    expect(normalizeRefreshScope('payments')).toBe('payments')
    expect(normalizeRefreshScope('bogus')).toBe('all')
    expect(normalizeRefreshScope(undefined)).toBe('all')
    expect(normalizeRefreshScope({ toString: () => 'emails' })).toBe('all')
  })
})

describe('REFRESH_SCOPES', () => {
  test('every scoped section names one cache key and one query key', () => {
    for (const name of ['members', 'payments', 'emails']) {
      expect(REFRESH_SCOPES[name].cacheKeys).toEqual([name])
      expect(REFRESH_SCOPES[name].queryKeys).toEqual([[name]])
    }
    expect(REFRESH_SCOPES.all.cacheKeys).toBeNull()
    expect(REFRESH_SCOPES.all.queryKeys).toEqual([['members'], ['payments'], ['emails']])
  })
})
