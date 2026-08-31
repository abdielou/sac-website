import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { generateText } from 'ai'

import { modelSupportsJsonObjectResponseFormat, resolveOpenRouterModels } from './ai-openrouter'

function inferImageMediaType(value) {
  const match = typeof value === 'string' ? value.match(/^data:([^;,]+)[;,]/i) : null
  return match?.[1] || 'image/png'
}

function normalizeFileData(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return value

  try {
    return new URL(value)
  } catch {
    return value
  }
}

/**
 * Convert the OpenAI-compatible image parts used by the workflows to the
 * canonical AI SDK message format. Text-only messages pass through unchanged.
 */
export function normalizeOpenRouterMessages(messages) {
  return messages.map((message) => {
    if (!Array.isArray(message.content)) return message

    return {
      ...message,
      content: message.content.map((part) => {
        if (part?.type !== 'image_url') return part

        const value = part.image_url?.url
        return {
          type: 'file',
          mediaType: inferImageMediaType(value),
          data: normalizeFileData(value),
        }
      }),
    }
  })
}

/**
 * Normalize AI SDK/OpenRouter metadata to the stable usage contract persisted
 * by workflow history and displayed by the admin UI.
 */
export function extractOpenRouterAiSdkUsage(result, fallbackModel) {
  const step = result?.finalStep || result
  const providerUsage = step?.providerMetadata?.openrouter?.usage
  const sdkUsage = result?.usage || step?.usage

  const promptTokens =
    typeof providerUsage?.promptTokens === 'number'
      ? providerUsage.promptTokens
      : typeof sdkUsage?.inputTokens === 'number'
        ? sdkUsage.inputTokens
        : undefined
  const completionTokens =
    typeof providerUsage?.completionTokens === 'number'
      ? providerUsage.completionTokens
      : typeof sdkUsage?.outputTokens === 'number'
        ? sdkUsage.outputTokens
        : undefined
  const totalTokens =
    typeof providerUsage?.totalTokens === 'number'
      ? providerUsage.totalTokens
      : typeof sdkUsage?.totalTokens === 'number'
        ? sdkUsage.totalTokens
        : undefined
  const costAmount = typeof providerUsage?.cost === 'number' ? providerUsage.cost : undefined

  if (
    promptTokens === undefined &&
    completionTokens === undefined &&
    totalTokens === undefined &&
    costAmount === undefined
  ) {
    return null
  }

  return {
    openRouterGenerationId: typeof step?.response?.id === 'string' ? step.response.id : undefined,
    model: typeof step?.response?.modelId === 'string' ? step.response.modelId : fallbackModel,
    promptTokens,
    completionTokens,
    totalTokens,
    cost:
      costAmount !== undefined
        ? {
            amount: costAmount,
            currency: 'USD',
          }
        : undefined,
  }
}

function normalizeOpenRouterSdkError(error) {
  if (error?.name === 'OpenRouterSdkError') return error

  const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : undefined
  const noContent = error?.name === 'AI_NoContentGeneratedError'
  const networkApiError = error?.name === 'AI_APICallError' && statusCode === undefined
  const timeoutOrAbort =
    error?.name === 'TimeoutError' ||
    error?.name === 'AbortError' ||
    error?.code === 'ABORT_ERR' ||
    error?.code === 'ETIMEDOUT'
  const responseError =
    statusCode === 200 ||
    noContent ||
    (!networkApiError &&
      statusCode === undefined &&
      typeof error?.name === 'string' &&
      error.name.startsWith('AI_'))
  const retryable =
    responseError ||
    networkApiError ||
    timeoutOrAbort ||
    statusCode === 408 ||
    statusCode === 429 ||
    statusCode >= 500
  const openRouterErrorCode = noContent
    ? 'empty_response'
    : responseError
      ? 'response_error'
      : networkApiError || timeoutOrAbort
        ? 'network_error'
        : statusCode !== undefined
          ? retryable
            ? 'provider_error'
            : 'provider_rejection'
          : 'sdk_processing_error'
  const message = noContent
    ? 'Respuesta de OpenRouter sin contenido'
    : responseError
      ? 'Respuesta inválida de OpenRouter'
      : networkApiError || timeoutOrAbort
        ? 'No se pudo conectar con OpenRouter'
        : statusCode !== undefined
          ? `OpenRouter HTTP ${statusCode}`
          : 'No se pudo procesar la operación de OpenRouter'
  const normalized = new Error(message, { cause: error })
  normalized.name = 'OpenRouterSdkError'
  normalized.statusCode = statusCode
  normalized.retryable = retryable
  normalized.openRouterErrorCode = openRouterErrorCode
  return normalized
}

function createProvider({ apiKey, fetchImpl }) {
  if (!apiKey || typeof fetchImpl !== 'function') {
    const error = new Error(
      !apiKey ? 'Falta OPENROUTER_API_KEY' : 'Falta una implementación de fetch'
    )
    error.name = 'OpenRouterConfigurationError'
    error.retryable = false
    throw error
  }

  return createOpenRouter({
    apiKey,
    compatibility: 'strict',
    fetch: fetchImpl,
    ...(process.env.OPENROUTER_SITE_URL ? { appUrl: process.env.OPENROUTER_SITE_URL } : null),
    ...(process.env.OPENROUTER_TITLE ? { appName: process.env.OPENROUTER_TITLE } : null),
  })
}

async function generateOpenRouterChat({
  apiKey,
  fetchImpl,
  model,
  messages,
  temperature,
  maxOutputTokens,
  timeoutMs,
  modalities,
  imageConfig,
  forceJson,
}) {
  const provider = createProvider({ apiKey, fetchImpl })
  const extraBody = {
    modalities,
    // Keep third-party routing on endpoints that do not collect request data.
    provider: { data_collection: 'deny' },
    ...(imageConfig ? { image_config: imageConfig } : null),
    ...(forceJson && modelSupportsJsonObjectResponseFormat(model)
      ? { response_format: { type: 'json_object' } }
      : null),
  }

  try {
    const result = await generateText({
      model: provider.chat(model, {
        usage: { include: true },
        extraBody,
      }),
      messages: normalizeOpenRouterMessages(messages),
      allowSystemInMessages: true,
      temperature,
      maxOutputTokens,
      maxRetries: 0,
      ...(timeoutMs ? { abortSignal: AbortSignal.timeout(timeoutMs) } : null),
    })

    return {
      text: result.text,
      files: result.files,
      usage: extractOpenRouterAiSdkUsage(result, model),
    }
  } catch (error) {
    throw normalizeOpenRouterSdkError(error)
  }
}

/** Generate a text/vision response through Vercel AI SDK and OpenRouter. */
export async function generateOpenRouterText(options) {
  const model = resolveOpenRouterModels(options.model).textModel
  const result = await generateOpenRouterChat({
    ...options,
    model,
    modalities: ['text'],
  })

  return {
    text: result.text,
    hasImage: result.files.some((file) => file.mediaType?.startsWith('image/')),
    usage: result.usage,
  }
}

/**
 * Generate through OpenRouter's existing multimodal chat contract. This keeps
 * generation id and cost metadata that the dedicated image endpoint omits.
 */
export async function generateOpenRouterImage(options) {
  const model = resolveOpenRouterModels(options.model).imageModel
  const result = await generateOpenRouterChat({
    ...options,
    model,
    modalities: ['image', 'text'],
  })
  const file = result.files.find((candidate) => candidate.mediaType?.startsWith('image/'))

  return {
    image: file
      ? {
          dataUrl: `data:${file.mediaType};base64,${file.base64}`,
          mimeType: file.mediaType,
        }
      : null,
    text: result.text,
    usage: result.usage,
  }
}
