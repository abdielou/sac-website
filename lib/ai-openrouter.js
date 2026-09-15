export const DEFAULT_OPENROUTER_IMAGE_MODEL = 'google/gemini-3.1-flash-lite-image'

const OPENROUTER_TEXT_COMPANIONS = Object.freeze({
  'google/gemini-3.1-flash-lite-image': 'google/gemini-3.1-flash-lite',
})

/**
 * Normalize a model id defensively across the env loaders used by Next and
 * Workflow DevKit. Older dotenv parsers preserve an inline `# comment`, which
 * otherwise turns a valid model id into a provider-side 400.
 */
export function normalizeConfiguredOpenRouterModel(value) {
  const candidate = typeof value === 'string' ? value.trim() : ''
  if (!candidate) return ''
  return candidate.replace(/\s+#.*$/, '').trim()
}

/**
 * Extract the first JSON object embedded in a model text response,
 * tolerating markdown code fences. Returns null when nothing parses.
 * @param {string} text
 */
export function extractFirstJsonObject(text) {
  const cleaned = text
    .replace(/```(?:json)?/g, '')
    .replace(/```/g, '')
    .trim()

  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) return null

  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

/**
 * Resolve an image model and its text-only companion when the provider exposes
 * them as separate model ids. Programmatic callers may pass a text model id
 * directly, so an unknown id resolves to itself here; the environment loader
 * below is the strict entry point.
 * @param {string | undefined} configuredModel
 * @param {string | undefined} [configuredTextModel]
 * @returns {{ imageModel: string, textModel: string }}
 */
export function resolveOpenRouterModels(configuredModel, configuredTextModel) {
  const candidate = normalizeConfiguredOpenRouterModel(configuredModel)
  const imageModel = candidate || DEFAULT_OPENROUTER_IMAGE_MODEL
  const explicitTextModel = normalizeConfiguredOpenRouterModel(configuredTextModel)
  const textModel =
    explicitTextModel || OPENROUTER_TEXT_COMPANIONS[imageModel.toLowerCase()] || imageModel
  return { imageModel, textModel }
}

/**
 * Read the models from the environment. Text-only calls (policy review,
 * captions, validation) must never be routed to an image model silently, so an
 * image model without a known companion requires OPENROUTER_TEXT_MODEL.
 * @returns {{ imageModel: string, textModel: string }}
 */
export function getConfiguredOpenRouterModels() {
  const imageModel =
    normalizeConfiguredOpenRouterModel(process.env.OPENROUTER_MODEL) ||
    DEFAULT_OPENROUTER_IMAGE_MODEL
  const textModel =
    normalizeConfiguredOpenRouterModel(process.env.OPENROUTER_TEXT_MODEL) ||
    OPENROUTER_TEXT_COMPANIONS[imageModel.toLowerCase()]
  if (!textModel) {
    const error = new Error(
      `OPENROUTER_MODEL "${imageModel}" no tiene un modelo de texto conocido. Define OPENROUTER_TEXT_MODEL.`
    )
    error.code = 'OPENROUTER_TEXT_MODEL_REQUIRED'
    error.retryable = false
    throw error
  }
  return { imageModel, textModel }
}

/**
 * Preserve billing metadata on an error raised after a provider response and
 * classify whether repeating the provider call can plausibly repair it.
 */
export function attachOpenRouterAttemptMetadata(error, { usage = null, retryable } = {}) {
  const normalized =
    error instanceof Error ? error : new Error(String(error || 'Fallo de OpenRouter'))

  if (normalized.usage == null && usage != null) normalized.usage = usage
  if (typeof normalized.retryable !== 'boolean' && typeof retryable === 'boolean') {
    normalized.retryable = retryable
  }

  return normalized
}

/** Retry only failures explicitly classified as transient or malformed output. */
export function shouldRetryOpenRouterOperation(error) {
  return error?.retryable === true
}

/**
 * Merge usage from multiple OpenRouter attempts (e.g. retries).
 * Sums tokens/cost; keeps the latest successful generation id/model.
 */
export function mergeOpenRouterUsage(a, b) {
  if (!a) return b || null
  if (!b) return a

  const sumOptional = (x, y) => {
    if (typeof x !== 'number' && typeof y !== 'number') return undefined
    return (typeof x === 'number' ? x : 0) + (typeof y === 'number' ? y : 0)
  }

  const amountA = a.cost?.amount
  const amountB = b.cost?.amount
  const mergedAmount = sumOptional(amountA, amountB)

  return {
    openRouterGenerationId: b.openRouterGenerationId || a.openRouterGenerationId,
    model: b.model || a.model,
    promptTokens: sumOptional(a.promptTokens, b.promptTokens),
    completionTokens: sumOptional(a.completionTokens, b.completionTokens),
    totalTokens: sumOptional(a.totalTokens, b.totalTokens),
    cost:
      mergedAmount !== undefined
        ? {
            amount: mergedAmount,
            currency: b.cost?.currency || a.cost?.currency || 'USD',
          }
        : undefined,
  }
}

/**
 * Gemini image models (e.g. Nano Banana / flash-*-image) reject structured outputs.
 * Sending response_format: json_object yields HTTP 400 INVALID_ARGUMENT from Google.
 * @param {string} model
 * @returns {boolean}
 */
export function modelSupportsJsonObjectResponseFormat(model) {
  const id = String(model || '').toLowerCase()
  if (!id) return true
  if (id.includes('gemini') && id.includes('image')) return false
  if (id.includes('flash-lite-image') || id.includes('flash-image')) return false
  return true
}
