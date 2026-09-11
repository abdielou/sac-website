/**
 * @jest-environment node
 */

import {
  DEFAULT_OPENROUTER_IMAGE_MODEL,
  attachOpenRouterAttemptMetadata,
  modelSupportsJsonObjectResponseFormat,
  resolveOpenRouterModels,
  shouldRetryOpenRouterOperation,
} from '../../lib/ai-openrouter'
import { generateOpenRouterImage, generateOpenRouterText } from '../../lib/ai-openrouter-sdk'

function openRouterResponse({ content = '', images, model = 'test/multimodal' } = {}) {
  return new Response(
    JSON.stringify({
      id: 'generation-sdk-1',
      model,
      provider: 'test',
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content,
            ...(images ? { images } : null),
          },
        },
      ],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120,
        cost: 0.0012,
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )
}

function messageText(message) {
  if (typeof message?.content === 'string') return message.content
  return (message?.content || [])
    .filter((part) => part?.type === 'text')
    .map((part) => part.text)
    .join('\n')
}

describe('resolveOpenRouterModels', () => {
  test('uses the text companion for text operations and preserves the image model', () => {
    expect(resolveOpenRouterModels('google/gemini-3.1-flash-lite-image')).toEqual({
      imageModel: 'google/gemini-3.1-flash-lite-image',
      textModel: 'google/gemini-3.1-flash-lite',
    })
  })

  test('preserves unknown and test models for backwards compatibility', () => {
    expect(resolveOpenRouterModels('test/multimodal')).toEqual({
      imageModel: 'test/multimodal',
      textModel: 'test/multimodal',
    })
  })

  test('uses the default image model and its text companion when config is blank', () => {
    expect(resolveOpenRouterModels('  ')).toEqual({
      imageModel: DEFAULT_OPENROUTER_IMAGE_MODEL,
      textModel: 'google/gemini-3.1-flash-lite',
    })
  })

  test('repairs inline dotenv comments before resolving either modality', () => {
    expect(
      resolveOpenRouterModels(
        'google/gemini-3.1-flash-lite-image   # Multimodal: text + image output'
      )
    ).toEqual({
      imageModel: 'google/gemini-3.1-flash-lite-image',
      textModel: 'google/gemini-3.1-flash-lite',
    })
  })
})

describe('modelSupportsJsonObjectResponseFormat', () => {
  test('rejects JSON mode for Gemini image models', () => {
    expect(modelSupportsJsonObjectResponseFormat('google/gemini-3.1-flash-lite-image')).toBe(false)
    expect(modelSupportsJsonObjectResponseFormat('google/gemini-3.1-flash-image')).toBe(false)
  })

  test('allows JSON mode for text models', () => {
    expect(modelSupportsJsonObjectResponseFormat('openai/gpt-5.4-nano')).toBe(true)
    expect(modelSupportsJsonObjectResponseFormat('google/gemini-3.1-flash-lite')).toBe(true)
  })
})

describe('shouldRetryOpenRouterOperation', () => {
  test('does not retry deterministic provider rejections', () => {
    expect(
      shouldRetryOpenRouterOperation(
        Object.assign(new Error('OpenRouter HTTP 401'), {
          name: 'OpenRouterSdkError',
          retryable: false,
        })
      )
    ).toBe(false)
  })

  test('retries transient provider and explicitly classified malformed responses', () => {
    expect(
      shouldRetryOpenRouterOperation(
        Object.assign(new Error('OpenRouter HTTP 503'), {
          name: 'OpenRouterSdkError',
          retryable: true,
        })
      )
    ).toBe(true)
    expect(
      shouldRetryOpenRouterOperation(
        attachOpenRouterAttemptMetadata(new Error('JSON inválido'), { retryable: true })
      )
    ).toBe(true)
  })

  test('does not retry unclassified errors or deterministic local TypeErrors', () => {
    expect(shouldRetryOpenRouterOperation(new Error('bug local'))).toBe(false)
    expect(shouldRetryOpenRouterOperation(new TypeError('shape inesperado'))).toBe(false)
  })

  test('attaches paid usage without overriding an existing provider classification', () => {
    const usage = { totalTokens: 12, cost: { amount: 0.001, currency: 'USD' } }
    const error = Object.assign(new Error('schema inválido'), { retryable: false })

    expect(attachOpenRouterAttemptMetadata(error, { usage, retryable: true })).toMatchObject({
      usage,
      retryable: false,
    })
  })
})

describe('OpenRouter Vercel AI SDK adapter', () => {
  test('routes text through the companion model and preserves usage metadata', async () => {
    let request
    const fetchImpl = jest.fn(async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) }
      return openRouterResponse({
        content: '{"ok":true}',
        model: 'google/gemini-3.1-flash-lite',
      })
    })

    const result = await generateOpenRouterText({
      apiKey: 'test-key',
      fetchImpl,
      model: 'google/gemini-3.1-flash-lite-image',
      messages: [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'Return JSON' },
      ],
      temperature: 0.2,
      forceJson: true,
      maxOutputTokens: 400,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(request.url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(new Headers(request.options.headers).get('authorization')).toBe('Bearer test-key')
    expect(request.body).toMatchObject({
      model: 'google/gemini-3.1-flash-lite',
      temperature: 0.2,
      max_tokens: 400,
      modalities: ['text'],
      provider: { data_collection: 'deny' },
      usage: { include: true },
      response_format: { type: 'json_object' },
    })
    expect(request.body.image_config).toBeUndefined()
    expect(messageText(request.body.messages[0])).toBe('System prompt')
    expect(messageText(request.body.messages[1])).toBe('Return JSON')
    expect(result).toEqual({
      text: '{"ok":true}',
      hasImage: false,
      usage: {
        openRouterGenerationId: 'generation-sdk-1',
        model: 'google/gemini-3.1-flash-lite',
        promptTokens: 100,
        completionTokens: 20,
        totalTokens: 120,
        cost: { amount: 0.0012, currency: 'USD' },
      },
    })
  })

  test('converts vision inputs to the AI SDK file format and back to image_url', async () => {
    let body
    const fetchImpl = jest.fn(async (_url, options) => {
      body = JSON.parse(options.body)
      return openRouterResponse({ content: '{"safe":true}' })
    })

    await generateOpenRouterText({
      apiKey: 'test-key',
      fetchImpl,
      model: 'test/multimodal',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Review this image' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/jpeg;base64,QUFBQQ==' },
            },
          ],
        },
      ],
      forceJson: true,
    })

    expect(body.messages[0].content).toContainEqual({
      type: 'image_url',
      image_url: { url: 'data:image/jpeg;base64,QUFBQQ==' },
    })
  })

  test('keeps chat-based image generation and returns its file, id, and cost', async () => {
    let body
    const fetchImpl = jest.fn(async (_url, options) => {
      body = JSON.parse(options.body)
      return openRouterResponse({
        images: [
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,QUFBQQ==' },
          },
        ],
        model: 'google/gemini-3.1-flash-lite-image',
      })
    })

    const result = await generateOpenRouterImage({
      apiKey: 'test-key',
      fetchImpl,
      model: 'google/gemini-3.1-flash-lite-image',
      messages: [{ role: 'user', content: 'Draw Saturn' }],
      imageConfig: { aspect_ratio: '3:4' },
      maxOutputTokens: 2048,
    })

    expect(body.modalities).toEqual(['image', 'text'])
    expect(body.provider).toEqual({ data_collection: 'deny' })
    expect(body.image_config).toEqual({ aspect_ratio: '3:4' })
    expect(body.response_format).toBeUndefined()
    expect(result.image).toEqual({
      dataUrl: 'data:image/png;base64,QUFBQQ==',
      mimeType: 'image/png',
    })
    expect(result.usage).toMatchObject({
      openRouterGenerationId: 'generation-sdk-1',
      model: 'google/gemini-3.1-flash-lite-image',
      cost: { amount: 0.0012, currency: 'USD' },
    })
  })

  test('does not add SDK retries and does not expose provider response bodies', async () => {
    const fetchImpl = jest.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: 'provider-secret-body' } }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        })
    )

    await expect(
      generateOpenRouterText({
        apiKey: 'test-key',
        fetchImpl,
        model: 'test/multimodal',
        messages: [{ role: 'user', content: 'Hello' }],
      })
    ).rejects.toMatchObject({
      name: 'OpenRouterSdkError',
      message: 'OpenRouter HTTP 503',
      statusCode: 503,
      retryable: true,
      openRouterErrorCode: 'provider_error',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  test('classifies a valid provider response without choices as empty', async () => {
    const fetchImpl = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'generation-empty-1',
            model: 'test/multimodal',
            provider: 'test',
            choices: [],
            usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    )

    await expect(
      generateOpenRouterText({
        apiKey: 'test-key',
        fetchImpl,
        model: 'test/multimodal',
        messages: [{ role: 'user', content: 'Hello' }],
      })
    ).rejects.toMatchObject({
      name: 'OpenRouterSdkError',
      message: 'Respuesta de OpenRouter sin contenido',
      retryable: true,
      openRouterErrorCode: 'empty_response',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  test('keeps an API call failure without an HTTP status classified as network', async () => {
    const networkError = Object.assign(new Error('fetch failed'), {
      name: 'AI_APICallError',
      isRetryable: true,
    })
    const fetchImpl = jest.fn(async () => {
      throw networkError
    })

    await expect(
      generateOpenRouterText({
        apiKey: 'test-key',
        fetchImpl,
        model: 'test/multimodal',
        messages: [{ role: 'user', content: 'Hello' }],
      })
    ).rejects.toMatchObject({
      name: 'OpenRouterSdkError',
      message: 'No se pudo conectar con OpenRouter',
      retryable: true,
      openRouterErrorCode: 'network_error',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  test('does not classify an unexpected local TypeError as a retryable network failure', async () => {
    const fetchImpl = jest.fn()

    await expect(
      generateOpenRouterText({
        apiKey: 'test-key',
        fetchImpl,
        model: 'test/multimodal',
        messages: null,
      })
    ).rejects.toMatchObject({
      name: 'OpenRouterSdkError',
      retryable: false,
      openRouterErrorCode: 'sdk_processing_error',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
