/** @jest-environment node */

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body, init = {}) => ({ status: init.status || 200, body }),
  },
}))

import {
  __resetWorkflowStartRateLimitForTests,
  checkWorkflowStartRateLimit,
} from '../../lib/ai-rate-limit'

describe('AI workflow start rate limit', () => {
  beforeEach(() => {
    __resetWorkflowStartRateLimitForTests()
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-09-15T12:00:00.000Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('limits the sixth distinct workflow start within one minute', () => {
    const email = 'user@example.com'

    for (let run = 0; run < 5; run += 1) {
      expect(checkWorkflowStartRateLimit(email)).toBeNull()
    }
    expect(checkWorkflowStartRateLimit(email)).toMatchObject({ status: 429 })
  })

  test('drops timestamps older than the one minute window', () => {
    const email = 'user@example.com'

    for (let run = 0; run < 5; run += 1) {
      expect(checkWorkflowStartRateLimit(email)).toBeNull()
    }
    jest.advanceTimersByTime(60 * 1000 + 1)

    expect(checkWorkflowStartRateLimit(email)).toBeNull()
  })

  test('keeps counters isolated per user', () => {
    for (let run = 0; run < 5; run += 1) {
      expect(checkWorkflowStartRateLimit('a@example.com')).toBeNull()
    }
    expect(checkWorkflowStartRateLimit('a@example.com')).toMatchObject({ status: 429 })

    expect(checkWorkflowStartRateLimit('b@example.com')).toBeNull()
  })

  test('does not limit calls without an email', () => {
    for (let run = 0; run < 10; run += 1) {
      expect(checkWorkflowStartRateLimit('')).toBeNull()
      expect(checkWorkflowStartRateLimit(undefined)).toBeNull()
    }
  })

  test('does not record a rejected call, so the window is not extended', () => {
    const email = 'user@example.com'

    for (let run = 0; run < 5; run += 1) {
      expect(checkWorkflowStartRateLimit(email)).toBeNull()
    }
    jest.advanceTimersByTime(30 * 1000)
    expect(checkWorkflowStartRateLimit(email)).toMatchObject({ status: 429 })

    // The first five calls expire together; the rejected call at +30s must not
    // keep the user locked out past that point.
    jest.advanceTimersByTime(30 * 1000 + 1)
    expect(checkWorkflowStartRateLimit(email)).toBeNull()
  })
})
