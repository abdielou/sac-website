/**
 * Extract OpenRouter usage metadata from a chat/completions response.
 * Returns null when the response has no usable usage fields.
 */
export function extractOpenRouterUsage(data, model) {
  const usage = data?.usage
  if (!usage || typeof usage !== 'object') return null

  const promptTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : undefined
  const completionTokens =
    typeof usage.completion_tokens === 'number' ? usage.completion_tokens : undefined
  const totalTokens = typeof usage.total_tokens === 'number' ? usage.total_tokens : undefined
  const costAmount = typeof usage.cost === 'number' ? usage.cost : undefined

  if (
    promptTokens === undefined &&
    completionTokens === undefined &&
    totalTokens === undefined &&
    costAmount === undefined
  ) {
    return null
  }

  return {
    openRouterGenerationId: typeof data?.id === 'string' ? data.id : undefined,
    model: typeof data?.model === 'string' ? data.model : model,
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

/**
 * Build OpenRouter chat/completions body, omitting params unsupported by the model.
 * @param {{
 *   model: string,
 *   messages: object[],
 *   temperature?: number,
 *   forceJson?: boolean,
 *   modalities?: string[],
 * }} options
 */
export function buildOpenRouterChatBody({
  model,
  messages,
  temperature,
  forceJson = false,
  modalities,
}) {
  const body = { model, messages }
  if (typeof temperature === 'number') body.temperature = temperature
  if (Array.isArray(modalities) && modalities.length > 0) body.modalities = modalities
  if (forceJson && modelSupportsJsonObjectResponseFormat(model)) {
    body.response_format = { type: 'json_object' }
  }
  return body
}
