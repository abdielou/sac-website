import { markGeneratedImageAssetPrepared } from './prepareGeneratedImageAsset'

/**
 * Return only final image bytes that the workflow marked as prepared before its
 * post-result policy review. Legacy template/provider assets are intentionally
 * suppressed because this route cannot prove that their displayed bytes were reviewed.
 */
export async function applyTemplateRendersToWorkflowResult(workflowPayload) {
  if (!workflowPayload || typeof workflowPayload !== 'object') return workflowPayload

  const generationResult = workflowPayload.result
  if (!generationResult || !Array.isArray(generationResult.drafts)) {
    return workflowPayload
  }

  let generatedImage = generationResult.generatedImage || null
  let renderError = null

  if (
    (generationResult.templateRequest || generatedImage?.dataUrl) &&
    !generatedImage?.preparedForDisplay
  ) {
    renderError =
      'La imagen histórica no tiene una revisión de política verificable y no se mostrará.'
    generatedImage = null
  }

  if (generatedImage?.preparedForDisplay) {
    try {
      generatedImage = markGeneratedImageAssetPrepared(generatedImage)
    } catch (error) {
      console.error('applyTemplateRendersToWorkflowResult: prepared image invalid', error)
      renderError = 'No se pudo preparar la imagen generada para descarga. Intenta nuevamente.'
      generatedImage = null
    }
  }

  const drafts = generationResult.drafts.map((draft) => {
    const {
      templateRequest: _legacyTemplate,
      generatedImages: _legacyImages,
      ...publicDraft
    } = draft
    const missingInformation = Array.isArray(draft.missingInformation)
      ? [...draft.missingInformation]
      : []
    if (renderError && !missingInformation.includes(renderError)) {
      missingInformation.push(renderError)
    }
    return renderError ? { ...publicDraft, missingInformation } : publicDraft
  })

  const {
    templateRequest: _templateRequest,
    templateAssets: _templateAssets,
    generatedImage: _unnormalizedImage,
    imagePlatforms: _imagePlatforms,
    ...publicResult
  } = generationResult
  const publicGeneratedImage = generatedImage
    ? (({ preparedForDisplay: _preparedForDisplay, ...asset }) => asset)(generatedImage)
    : null

  return {
    ...workflowPayload,
    result: {
      ...publicResult,
      drafts,
      ...(publicGeneratedImage
        ? {
            generatedImage: publicGeneratedImage,
            ...(Array.isArray(generationResult.imagePlatforms)
              ? { imagePlatforms: generationResult.imagePlatforms }
              : null),
          }
        : null),
    },
  }
}
