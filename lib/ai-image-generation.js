/**
 * Image asset generation helpers (Phase 2E).
 * Text and images use the same OpenRouter multimodal model. Runtime configuration
 * is intentionally limited to OPENROUTER_API_KEY and OPENROUTER_MODEL.
 */

const DEFAULT_MODEL = 'google/gemini-3.1-flash-lite-image'

/**
 * @returns {{ model: string }}
 */
export function getImageGenerationConfig() {
  return {
    model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
  }
}

/**
 * Extract usage/cost from OpenRouter image/chat response.
 * @param {object} data
 * @param {string} model
 */
export function extractOpenRouterImageUsage(data, model) {
  const usage = data?.usage
  if (!usage || typeof usage !== 'object') return null

  const costAmount = typeof usage.cost === 'number' ? usage.cost : undefined
  const totalTokens = typeof usage.total_tokens === 'number' ? usage.total_tokens : undefined

  if (costAmount === undefined && totalTokens === undefined) return null

  return {
    model: typeof data?.model === 'string' ? data.model : model,
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
 * Parse image data URL from OpenRouter chat completions (or legacy /images) responses.
 * @param {object} data
 * @returns {{ dataUrl: string, mimeType: string } | null}
 */
export function parseOpenRouterImageResponse(data) {
  const imagesEntry = data?.data?.[0]
  if (imagesEntry && typeof imagesEntry === 'object') {
    if (typeof imagesEntry.url === 'string' && imagesEntry.url.trim()) {
      return inferDataUrl(imagesEntry.url)
    }
    if (typeof imagesEntry.b64_json === 'string' && imagesEntry.b64_json.trim()) {
      const b64 = imagesEntry.b64_json.trim()
      if (b64.startsWith('data:')) return inferDataUrl(b64)
      return { dataUrl: `data:image/png;base64,${b64}`, mimeType: 'image/png' }
    }
  }

  const messageImages = data?.choices?.[0]?.message?.images
  if (Array.isArray(messageImages) && messageImages.length > 0) {
    const first = messageImages[0]
    const url = first?.image_url?.url || first?.imageUrl?.url
    if (typeof url === 'string' && url.trim()) {
      return inferDataUrl(url.trim())
    }
  }

  return null
}

/**
 * @param {string} value
 * @returns {{ dataUrl: string, mimeType: string }}
 */
function inferDataUrl(value) {
  if (value.startsWith('data:')) {
    const mimeMatch = value.match(/^data:([^;]+);/)
    return {
      dataUrl: value,
      mimeType: mimeMatch?.[1] || 'image/png',
    }
  }
  return { dataUrl: value, mimeType: 'image/png' }
}

/**
 * @param {object} params
 * @param {string} [params.platform] - Optional; omit for shared assets.
 * @param {number} [params.index=0]
 * @param {string} params.dataUrl
 * @param {string} params.mimeType
 * @param {string} [params.rationale]
 */
export function buildGeneratedImageAsset({ platform, index = 0, dataUrl, mimeType, rationale }) {
  const ext = mimeType === 'image/jpeg' || mimeType === 'image/jpg' ? 'jpg' : 'png'
  const tag = platform || 'social'
  return {
    assetId: `generated-${tag}-${index}`,
    status: 'draft',
    rationale,
    mimeType,
    dataUrl,
    downloadFileName: `sac-borrador-${tag}.${ext}`,
  }
}

/**
 * Attach a fallback note when image asset generation fails; keeps imagePrompt intact.
 * @param {object} draft
 * @param {string} reason
 */
export function applyImageAssetFallbackToDraft(draft, reason) {
  const missingInformation = Array.isArray(draft.missingInformation)
    ? [...draft.missingInformation]
    : []
  const message = `No se pudo generar imagen: ${reason}. Usa el prompt de imagen manualmente.`
  if (!missingInformation.includes(message)) {
    missingInformation.push(message)
  }
  return {
    ...draft,
    missingInformation,
  }
}
