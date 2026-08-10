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
  })

  test('limits the sixth distinct workflow start within one minute', () => {
    const email = 'user@example.com'

    for (let run = 0; run < 5; run += 1) {
      expect(checkWorkflowStartRateLimit(email)).toBeNull()
    }
    expect(checkWorkflowStartRateLimit(email)).toMatchObject({ status: 429 })
  })
})
