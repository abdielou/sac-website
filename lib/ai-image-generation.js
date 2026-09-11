/**
 * Image asset generation helpers.
 * Runtime configuration is intentionally limited to OPENROUTER_API_KEY and
 * OPENROUTER_MODEL. Operation-specific model selection is resolved centrally.
 */

import { buildAiImageDownloadFileName } from './ai-image-download-name'
import { getConfiguredOpenRouterModels } from './ai-openrouter'
import { SOCIAL_ASPECT_RATIO } from './social-template/platformCanvas'

/**
 * @returns {{ model: string, aspectRatio: string }}
 */
export function getImageGenerationConfig() {
  return {
    model: getConfiguredOpenRouterModels().imageModel,
    aspectRatio: SOCIAL_ASPECT_RATIO,
  }
}

/**
 * @param {object} params
 * @param {string} [params.platform] - Optional; omit for shared assets.
 * @param {number} [params.index=0]
 * @param {string} params.dataUrl
 * @param {string} params.mimeType
 * @param {string} [params.rationale]
 * @param {string} [params.contentType]
 * @param {object} [params.eventDetails]
 * @param {string} [params.topic]
 * @param {string|Date} [params.generatedAt]
 * @param {string} [params.downloadFileName]
 */
export function buildGeneratedImageAsset({
  platform,
  index = 0,
  dataUrl,
  mimeType,
  rationale,
  contentType,
  contentTypeDefinition,
  eventDetails,
  topic,
  generatedAt,
  downloadFileName,
}) {
  const tag = platform || 'social'
  return {
    assetId: `generated-${tag}-${index}`,
    status: 'draft',
    rationale,
    mimeType,
    dataUrl,
    downloadFileName:
      downloadFileName ||
      buildAiImageDownloadFileName({
        contentType,
        contentTypeDefinition,
        eventDetails,
        topic,
        mimeType,
        generatedAt,
      }),
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
