const { isAiRunBusy } = require('../../lib/hooks/AiRunProvider')

describe('generation run lifetime', () => {
  test('keeps an old workflow active until the workflow reports a terminal status', () => {
    expect(
      isAiRunBusy({
        mode: 'generate',
        status: 'running',
        updatedAt: '2020-01-01T00:00:00.000Z',
      })
    ).toBe(true)
    expect(isAiRunBusy({ mode: 'generate', status: 'completed' })).toBe(false)
  })
})
