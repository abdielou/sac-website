import {
  buildOpenRouterChatBody,
  buildOpenRouterImageChatBody,
  buildOpenRouterTextChatBody,
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

describe('intent-specific OpenRouter chat bodies', () => {
  test('text requests always ask for text and omit image generation settings', () => {
    const body = buildOpenRouterTextChatBody({
      model: 'google/gemini-3.1-flash-lite-image',
      messages: [{ role: 'user', content: 'review' }],
      temperature: 0,
      forceJson: true,
      modalities: ['image', 'text'],
      imageConfig: { aspect_ratio: '3:4' },
    })

    expect(body.modalities).toEqual(['text'])
    expect(body.image_config).toBeUndefined()
  })

  test('image requests always ask for image and text and accept image_config', () => {
    const body = buildOpenRouterImageChatBody({
      model: 'google/gemini-3.1-flash-lite-image',
      messages: [{ role: 'user', content: 'draw' }],
      modalities: ['text'],
      imageConfig: { aspect_ratio: '3:4' },
    })

    expect(body.modalities).toEqual(['image', 'text'])
    expect(body.image_config).toEqual({ aspect_ratio: '3:4' })
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
    expect(body.image_config).toBeUndefined()
  })

  test('maps image generation options to image_config', () => {
    const body = buildOpenRouterChatBody({
      model: 'google/gemini-3.1-flash-lite-image',
      messages: [{ role: 'user', content: 'draw' }],
      modalities: ['image', 'text'],
      imageConfig: { aspect_ratio: '3:4' },
    })

    expect(body.image_config).toEqual({ aspect_ratio: '3:4' })
    expect(body.imageConfig).toBeUndefined()
  })
})
