const { isStaleGenerationRun } = require('../../lib/hooks/useAiGenerationRun')

describe('generation run staleness', () => {
  const now = new Date('2026-08-03T09:00:00.000Z').getTime()

  test('detects an active workflow with no activity for over five minutes', () => {
    expect(
      isStaleGenerationRun(
        {
          status: 'running',
          createdAt: '2026-08-03T08:30:27.596Z',
          startedAt: '2026-08-03T08:30:28.962Z',
          updatedAt: '2026-08-03T08:30:28.962Z',
        },
        now
      )
    ).toBe(true)
  })

  test('keeps a recently updated workflow active', () => {
    expect(
      isStaleGenerationRun(
        {
          status: 'running',
          startedAt: '2026-08-03T08:50:00.000Z',
          updatedAt: '2026-08-03T08:59:30.000Z',
        },
        now
      )
    ).toBe(false)
  })

  test('never marks a terminal workflow as stale', () => {
    expect(
      isStaleGenerationRun({ status: 'completed', updatedAt: '2026-08-03T08:00:00.000Z' }, now)
    ).toBe(false)
  })
})
