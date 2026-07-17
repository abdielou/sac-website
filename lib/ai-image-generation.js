/**
 * Image asset generation helpers (Phase 2E).
 * Image assets are always generated when the workflow produces image prompts —
 * not toggled by env flags. Requires OPENROUTER_API_KEY; optional spend ceilings
 * only cap runaway cost. MVP retention: download-only data URLs (no S3).
 */

const DEFAULT_MODEL = 'google/gemini-3.1-flash-lite-image'
const DEFAULT_MAX_COST_PER_RUN_USD = 0.5
const RETENTION = 'download-only'

/** @type {Map<string, number>} */
const monthlySpendByKey = new Map()

export function resetImageGenerationSpendForTests() {
  monthlySpendByKey.clear()
}

function currentMonthlySpendKey() {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * @returns {{
 *   model: string,
 *   maxCostPerRunUsd: number,
 *   spendCeilingUsd: number | null,
 *   retention: string,
 * }}
 */
export function getImageGenerationConfig() {
  const spendCeilingRaw = process.env.AI_IMAGE_GENERATION_SPEND_CEILING_USD
  const parsedCeiling = spendCeilingRaw ? Number.parseFloat(spendCeilingRaw) : NaN

  return {
    // Same OPENROUTER_MODEL used for text; validated multimodal model generates images too.
    model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
    maxCostPerRunUsd: Number.parseFloat(
      process.env.AI_IMAGE_GENERATION_MAX_COST_PER_RUN_USD || String(DEFAULT_MAX_COST_PER_RUN_USD)
    ),
    spendCeilingUsd: Number.isFinite(parsedCeiling) && parsedCeiling > 0 ? parsedCeiling : null,
    retention: RETENTION,
  }
}

/**
 * @param {number} amountUsd
 */
export function recordImageGenerationSpend(amountUsd) {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return
  const key = currentMonthlySpendKey()
  monthlySpendByKey.set(key, (monthlySpendByKey.get(key) || 0) + amountUsd)
}

/**
 * @param {number} [additionalCostUsd=0]
 * @returns {{ allowed: boolean, reason?: string, currentSpendUsd?: number, ceilingUsd?: number }}
 */
export function checkImageGenerationSpendCeiling(additionalCostUsd = 0) {
  const config = getImageGenerationConfig()
  if (!config.spendCeilingUsd) return { allowed: true }

  const key = currentMonthlySpendKey()
  const currentSpendUsd = monthlySpendByKey.get(key) || 0
  const projected = currentSpendUsd + (Number.isFinite(additionalCostUsd) ? additionalCostUsd : 0)

  if (projected > config.spendCeilingUsd) {
    return {
      allowed: false,
      reason: 'monthly_spend_ceiling',
      currentSpendUsd,
      ceilingUsd: config.spendCeilingUsd,
    }
  }

  return { allowed: true, currentSpendUsd, ceilingUsd: config.spendCeilingUsd }
}

/**
 * Preconditions for calling the image provider. Product decision is always "generate";
 * this only blocks when generation is impossible or over optional cost caps.
 * @param {{ accumulatedRunCostUsd?: number }} [options]
 */
export function resolveImageGenerationGate(options = {}) {
  const config = getImageGenerationConfig()
  const accumulatedRunCostUsd = options.accumulatedRunCostUsd || 0

  if (!process.env.OPENROUTER_API_KEY) {
    return { allowed: false, reason: 'missing_api_key', config }
  }

  const spendCheck = checkImageGenerationSpendCeiling(0)
  if (!spendCheck.allowed) {
    return { allowed: false, reason: spendCheck.reason, config, spend: spendCheck }
  }

  if (accumulatedRunCostUsd >= config.maxCostPerRunUsd) {
    return { allowed: false, reason: 'run_cost_limit', config }
  }

  return { allowed: true, config }
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
 * @param {string} params.platform
 * @param {number} [params.index=0]
 * @param {string} params.dataUrl
 * @param {string} params.mimeType
 * @param {string} [params.rationale]
 */
export function buildGeneratedImageAsset({ platform, index = 0, dataUrl, mimeType, rationale }) {
  const ext = mimeType === 'image/jpeg' || mimeType === 'image/jpg' ? 'jpg' : 'png'
  return {
    assetId: `generated-${platform}-${index}`,
    status: 'draft',
    rationale,
    mimeType,
    dataUrl,
    downloadFileName: `sac-borrador-${platform}.${ext}`,
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
