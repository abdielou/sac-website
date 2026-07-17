import {
  buildOpenRouterChatBody,
  modelSupportsJsonObjectResponseFormat,
} from '../../lib/ai-openrouter'

describe('modelSupportsJsonObjectResponseFormat', () => {
  test('returns false for Gemini image models', () => {
    expect(modelSupportsJsonObjectResponseFormat('google/gemini-3.1-flash-lite-image')).toBe(false)
    expect(modelSupportsJsonObjectResponseFormat('google/gemini-3.1-flash-image')).toBe(false)
  })

  test('returns true for text models', () => {
    expect(modelSupportsJsonObjectResponseFormat('openai/gpt-5.4-nano')).toBe(true)
    expect(modelSupportsJsonObjectResponseFormat('google/gemini-3.1-flash-lite')).toBe(true)
  })
})

describe('buildOpenRouterChatBody', () => {
  test('omits response_format for Gemini image models', () => {
    const body = buildOpenRouterChatBody({
      model: 'google/gemini-3.1-flash-lite-image',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.4,
      forceJson: true,
    })
    expect(body.response_format).toBeUndefined()
    expect(body.model).toBe('google/gemini-3.1-flash-lite-image')
    expect(body.temperature).toBe(0.4)
  })

  test('includes response_format for models that support it', () => {
    const body = buildOpenRouterChatBody({
      model: 'openai/gpt-5.4-nano',
      messages: [{ role: 'user', content: 'hi' }],
      forceJson: true,
    })
    expect(body.response_format).toEqual({ type: 'json_object' })
  })

  test('includes modalities when provided', () => {
    const body = buildOpenRouterChatBody({
      model: 'google/gemini-3.1-flash-lite-image',
      messages: [{ role: 'user', content: 'draw' }],
      modalities: ['image', 'text'],
    })
    expect(body.modalities).toEqual(['image', 'text'])
  })
})
