import { fetch } from 'workflow'
import {
  AI_AGENT_IDENTITY_PROMPT,
  formatUntrustedGuidelines,
  formatUntrustedRequest,
} from '../../../../lib/ai-agent'
import { shouldGenerateImagePrompt } from '../../../../lib/ai-constants'
import {
  applyPlatformImagePolicyToDraft,
  resolveImagePlatforms,
} from '../../../../lib/ai-generation-guardrails'
import { AiGenerationResultSchema } from '../../../../lib/ai-generation-schemas'
import {
  applyImageAssetFallbackToDraft,
  buildGeneratedImageAsset,
  getImageGenerationConfig,
} from '../../../../lib/ai-image-generation'
import {
  attachOpenRouterAttemptMetadata,
  mergeOpenRouterUsage,
  shouldRetryOpenRouterOperation,
} from '../../../../lib/ai-openrouter'
import { generateOpenRouterImage } from '../../../../lib/ai-openrouter-sdk'
import {
  imageBufferFromDataUrl,
  markGeneratedImageAssetPrepared,
  normalizeGeneratedImageAsset,
} from '../../../../lib/social-template/prepareGeneratedImageAsset'
import { renderSocialTemplateImage } from '../../../../lib/social-template/renderSocialTemplateImage'
import { OPENROUTER_IMAGE_MAX_TOKENS, OPENROUTER_IMAGE_TIMEOUT_MS } from './constants'
import { buildPinnedGuidelinePromptPayload } from './guidelinePromptPayload'

async function callImageProviderWithRetry(callProvider, { maxAttempts = 2 } = {}) {
  let usage = null
  const attempts = Math.max(1, Math.min(Number(maxAttempts) || 1, 2))
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await callProvider(attempt)
      return {
        response,
        usage: mergeOpenRouterUsage(usage, response.usage || null),
        attempts: attempt,
      }
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error || 'Fallo del proveedor'))
      usage = mergeOpenRouterUsage(usage, normalizedError.usage || null)
      normalizedError.accumulatedUsage = usage
      normalizedError.providerAttempts = attempt
      if (!shouldRetryOpenRouterOperation(normalizedError) || attempt === attempts) {
        throw normalizedError
      }
    }
  }

  throw new Error('No se ejecutó el proveedor de imágenes')
}

export function classifyImageProviderFailure(error) {
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : null
  if (error?.name === 'OpenRouterConfigurationError' || [401, 402, 403, 404].includes(statusCode)) {
    return {
      code: 'image_provider_configuration_error',
      stage: 'image_provider',
      retryable: false,
      kind: 'configuration',
    }
  }
  if (shouldRetryOpenRouterOperation(error)) {
    return {
      code: 'image_provider_retry_exhausted',
      stage: 'image_provider',
      retryable: true,
      kind: 'model_or_provider',
    }
  }
  if (error?.openRouterErrorCode === 'provider_rejection') {
    return {
      code: 'image_provider_rejected',
      stage: 'image_provider',
      retryable: false,
      kind: 'provider_rejection',
    }
  }
  return {
    code: 'image_asset_processing_failed',
    stage: 'image_generation',
    retryable: false,
    kind: 'processing',
  }
}

function publicImageFailureReason(failure) {
  switch (failure?.code) {
    case 'image_provider_configuration_error':
      return 'el servicio de imágenes necesita configuración administrativa'
    case 'image_provider_retry_exhausted':
      return 'el servicio no devolvió una imagen utilizable después de los intentos automáticos'
    case 'image_provider_rejected':
      return 'el servicio de imágenes rechazó la solicitud'
    default:
      return 'no se pudo procesar de forma segura la respuesta de imagen'
  }
}

export async function generateImageAssetsStep(input, promptResult, guidelines, options = {}) {
  'use step'

  if (!shouldGenerateImagePrompt(input.contentType, input, input.contentTypeDefinition)) {
    return { ok: true, skipped: true, result: promptResult, usage: null, retryable: false }
  }

  const draftWithPrompt = promptResult.drafts.find((d) => d.imagePrompt?.trim())
  if (!draftWithPrompt) {
    return { ok: true, skipped: true, result: promptResult, usage: null, retryable: false }
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  const imageGenerationConfig = getImageGenerationConfig()
  const model = imageGenerationConfig.model
  const correction = options?.correction
  const maxProviderAttempts = options?.maxProviderAttempts === 1 ? 1 : 2
  const generationRequest = {
    assetRole: 'final_image',
    contentData: input.contentData,
    contentType: input.contentType,
    imagePrompt: draftWithPrompt.imagePrompt,
    caption: draftWithPrompt.draftText,
    imageStyle: input.imageStyle,
    imageConstraints: input.imageConstraints,
    knownFacts: input.knownFacts,
    eventDetails: input.eventDetails,
    ...(correction
      ? {
          correction: {
            originalPrompt: correction.originalPrompt,
            reviewerReason: correction.reviewerReason,
          },
        }
      : null),
  }

  try {
    const { response, usage, attempts } = await callImageProviderWithRetry(
      async (attempt) => {
        const providerResponse = await generateOpenRouterImage({
          apiKey,
          fetchImpl: fetch,
          model,
          messages: [
            {
              role: 'system',
              content: AI_AGENT_IDENTITY_PROMPT,
            },
            {
              role: 'user',
              content: `Genera una sola imagen de borrador para redes sociales de SAC. El campo imagePrompt es la especificación visual canónica ya compilada por la etapa de dirección de arte: ejecútala completa, no la resumas ni la reemplaces con una interpretación del caption. Usa los demás campos solo para comprobar consistencia factual. Aplica las Guidelines fijadas sin reinterpretar sus requisitos sobre texto y sin inventar hechos no incluidos.

${formatUntrustedGuidelines(buildPinnedGuidelinePromptPayload(guidelines))}
${formatUntrustedRequest(generationRequest)}`,
            },
            ...(attempt > 1
              ? [
                  {
                    role: 'user',
                    content:
                      'El intento anterior no produjo un archivo de imagen utilizable. Corrige la salida y devuelve exactamente una imagen que cumpla el mismo brief visual.',
                  },
                ]
              : []),
          ],
          imageConfig: { aspect_ratio: imageGenerationConfig.aspectRatio },
          maxOutputTokens: OPENROUTER_IMAGE_MAX_TOKENS,
          timeoutMs: OPENROUTER_IMAGE_TIMEOUT_MS,
        })

        if (!providerResponse.image?.dataUrl) {
          throw attachOpenRouterAttemptMetadata(new Error('Respuesta del provider sin imagen'), {
            usage: providerResponse.usage,
            retryable: true,
          })
        }

        try {
          imageBufferFromDataUrl(providerResponse.image.dataUrl)
        } catch (error) {
          throw attachOpenRouterAttemptMetadata(error, {
            usage: providerResponse.usage,
            retryable: true,
          })
        }

        try {
          const parsedImage = providerResponse.image
          const asset = buildGeneratedImageAsset({
            dataUrl: parsedImage.dataUrl,
            mimeType: parsedImage.mimeType,
            contentType: input.contentType,
            contentTypeDefinition: input.contentTypeDefinition,
            eventDetails: input.eventDetails,
            topic: input.topic,
            rationale:
              draftWithPrompt.imageRationale ||
              'Borrador visual compartido generado a partir del prompt.',
          })

          return {
            ...providerResponse,
            result: AiGenerationResultSchema.parse({
              ...promptResult,
              generatedImage: asset,
              humanReviewRequired: true,
            }),
          }
        } catch (error) {
          throw attachOpenRouterAttemptMetadata(error, {
            usage: providerResponse.usage,
            retryable: false,
          })
        }
      },
      { maxAttempts: maxProviderAttempts }
    )

    return {
      ok: true,
      skipped: false,
      result: response.result,
      usage,
      providerAttempts: attempts,
    }
  } catch (err) {
    const failure = classifyImageProviderFailure(err)
    const updatedDrafts = promptResult.drafts.map((draft) =>
      applyImageAssetFallbackToDraft(draft, publicImageFailureReason(failure))
    )

    return {
      ok: true,
      skipped: false,
      result: AiGenerationResultSchema.parse({
        ...promptResult,
        drafts: updatedDrafts,
        humanReviewRequired: true,
      }),
      usage: err?.accumulatedUsage || null,
      retryable: failure.retryable,
      failureKind: failure.kind,
      failure,
      providerAttempts: err?.providerAttempts || 1,
    }
  }
}

/**
 * Generate one shared clean backdrop for template mode (ai_generated).
 * Uses the first draft's imagePrompt; result is attached later via attachTemplateRequestsToResult.
 */
export async function generateSharedBackdropStep(input, promptResult, guidelines, options = {}) {
  'use step'

  const draftWithPrompt = (promptResult.drafts || []).find((d) => d.imagePrompt?.trim())
  if (!draftWithPrompt) {
    return {
      ok: false,
      skipped: true,
      skippedReason: 'missing_image_prompt',
      backdropDataUrl: null,
      usage: null,
      retryable: false,
      result: promptResult,
    }
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  const imageGenerationConfig = getImageGenerationConfig()
  const model = imageGenerationConfig.model
  const maxProviderAttempts = options?.maxProviderAttempts === 1 ? 1 : 2

  const backdropPrompt = `${draftWithPrompt.imagePrompt}

Clean background only for a social media template overlay. No text, no logos, no captions, no typography baked into the image. Wide open negative space for headline text.`
  const backdropRequest = {
    contentData: input.contentData,
    contentType: input.contentType,
    imagePrompt: backdropPrompt,
    caption: draftWithPrompt.draftText,
    imageStyle: input.imageStyle,
    imageConstraints: input.imageConstraints,
    knownFacts: input.knownFacts,
    eventDetails: input.eventDetails,
    assetRole: 'template_backdrop',
  }

  try {
    const { response, usage, attempts } = await callImageProviderWithRetry(
      async (attempt) => {
        const providerResponse = await generateOpenRouterImage({
          apiKey,
          fetchImpl: fetch,
          model,
          messages: [
            {
              role: 'system',
              content: AI_AGENT_IDENTITY_PROMPT,
            },
            {
              role: 'user',
              content: `Genera una sola imagen de fondo limpio para una plantilla de redes sociales de SAC. El campo imagePrompt es la especificación visual canónica ya compilada: ejecútala completa y usa los demás campos solo para comprobar consistencia factual. La plantilla compondrá el texto después: no dibujes texto, logos, captions, tipografía ni marcas de agua en este asset intermedio.

${formatUntrustedGuidelines(buildPinnedGuidelinePromptPayload(guidelines))}
${formatUntrustedRequest(backdropRequest)}`,
            },
            ...(attempt > 1
              ? [
                  {
                    role: 'user',
                    content:
                      'El intento anterior no produjo un fondo de imagen utilizable. Corrige la salida y devuelve exactamente una imagen sin texto para la misma plantilla.',
                  },
                ]
              : []),
          ],
          imageConfig: { aspect_ratio: imageGenerationConfig.aspectRatio },
          maxOutputTokens: OPENROUTER_IMAGE_MAX_TOKENS,
          timeoutMs: OPENROUTER_IMAGE_TIMEOUT_MS,
        })

        if (!providerResponse.image?.dataUrl) {
          throw attachOpenRouterAttemptMetadata(new Error('Respuesta del provider sin imagen'), {
            usage: providerResponse.usage,
            retryable: true,
          })
        }
        try {
          imageBufferFromDataUrl(providerResponse.image.dataUrl)
        } catch (error) {
          throw attachOpenRouterAttemptMetadata(error, {
            usage: providerResponse.usage,
            retryable: true,
          })
        }
        return providerResponse
      },
      { maxAttempts: maxProviderAttempts }
    )

    const parsedImage = response.image

    return {
      ok: true,
      skipped: false,
      backdropDataUrl: parsedImage.dataUrl,
      usage,
      providerAttempts: attempts,
      result: promptResult,
    }
  } catch (err) {
    const failure = classifyImageProviderFailure(err)
    const drafts = promptResult.drafts.map((draft) =>
      applyImageAssetFallbackToDraft(draft, publicImageFailureReason(failure))
    )
    return {
      ok: false,
      skipped: false,
      backdropDataUrl: null,
      usage: err?.accumulatedUsage || null,
      retryable: failure.retryable,
      failureKind: failure.kind,
      failure,
      providerAttempts: err?.providerAttempts || 1,
      result: AiGenerationResultSchema.parse({
        ...promptResult,
        drafts,
        humanReviewRequired: true,
      }),
    }
  }
}

export async function prepareFinalImageStep(input, result) {
  'use step'

  const imagePlatforms = resolveImagePlatforms(input)
  try {
    result = AiGenerationResultSchema.parse({
      ...result,
      drafts: result.drafts.map((draft) => applyPlatformImagePolicyToDraft(draft, input)),
    })
    if (!result.generatedImage && !result.templateRequest) return { ok: true, result }

    let generatedImage
    if (result.templateRequest) {
      if (!result.templateAssets?.backgroundSource) {
        throw new Error('faltan los assets compartidos de la plantilla')
      }
      const rendered = await renderSocialTemplateImage({
        templateRequest: {
          ...result.templateRequest,
          backgroundSource: result.templateAssets.backgroundSource,
          ...(result.templateAssets.sponsorLogo
            ? { sponsorLogo: result.templateAssets.sponsorLogo }
            : null),
        },
      })
      generatedImage = markGeneratedImageAssetPrepared(
        buildGeneratedImageAsset({
          dataUrl: rendered.dataUrl,
          mimeType: rendered.mimeType,
          downloadFileName: result.templateAssets.downloadFileName,
          rationale:
            result.templateAssets.backgroundSource.mode === 'stock'
              ? 'Imagen de plantilla con fondo seleccionado.'
              : 'Imagen de plantilla con fondo generado por IA.',
        })
      )
    } else {
      generatedImage = await normalizeGeneratedImageAsset(result.generatedImage)
    }

    return {
      ok: true,
      result: AiGenerationResultSchema.parse({
        ...result,
        generatedImage,
        imagePlatforms,
        humanReviewRequired: true,
      }),
    }
  } catch (error) {
    console.error('generateAiWorkflow: failed to prepare final image', error)
    const {
      generatedImage: _generatedImage,
      templateRequest: _templateRequest,
      templateAssets: _templateAssets,
      imagePlatforms: _imagePlatforms,
      ...textResult
    } = result
    const drafts = textResult.drafts.map((draft) =>
      imagePlatforms.includes(draft.platform)
        ? applyImageAssetFallbackToDraft(draft, 'no se pudo preparar el arte final de forma segura')
        : draft
    )
    const retryable =
      Boolean(
        (result?.generatedImage && !result?.templateRequest) ||
        (result?.templateRequest && input?.backgroundMode === 'ai_generated')
      ) && !(error instanceof TypeError)
    return {
      ok: false,
      retryable,
      failureKind: 'post_processing',
      failure: {
        code: 'image_post_processing_failed',
        stage: 'image_preparation',
        retryable,
        kind: 'post_processing',
      },
      result: AiGenerationResultSchema.parse({
        ...textResult,
        drafts,
        humanReviewRequired: true,
      }),
    }
  }
}
