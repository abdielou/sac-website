import { fetch } from 'workflow'
import {
  buildAgentSystemPrompt,
  formatUntrustedGuidelines,
  formatUntrustedRequest,
} from '../../../../lib/ai-agent'
import { shouldGenerateImagePrompt } from '../../../../lib/ai-constants'
import {
  mergeImagePromptsIntoResult,
  resolveImagePlatforms,
} from '../../../../lib/ai-generation-guardrails'
import {
  IMAGE_PROMPT_ASSET_ROLES,
  buildDeterministicImagePromptFallback,
  buildImagePromptPlanInstructions,
  resolveImagePromptResponse,
} from '../../../../lib/ai-image-prompt'
import { AiGenerationResultSchema } from '../../../../lib/ai-generation-schemas'
import {
  attachOpenRouterAttemptMetadata,
  extractFirstJsonObject,
  getConfiguredOpenRouterModels,
  mergeOpenRouterUsage,
  shouldRetryOpenRouterOperation,
} from '../../../../lib/ai-openrouter'
import { generateOpenRouterText } from '../../../../lib/ai-openrouter-sdk'
import { OPENROUTER_TEXT_MAX_TOKENS, OPENROUTER_TEXT_TIMEOUT_MS } from './constants'
import { buildPinnedGuidelinePromptPayload } from './guidelinePromptPayload'

export async function generateImagePromptsStep(input, textResult, guidelines) {
  'use step'

  if (!shouldGenerateImagePrompt(input.contentType, input, input.contentTypeDefinition)) {
    return { ok: true, skipped: true, result: textResult, usage: null }
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  const model = getConfiguredOpenRouterModels().textModel

  if (!apiKey) {
    const drafts = textResult.drafts.map((draft) => ({
      ...draft,
      missingInformation: [
        ...(Array.isArray(draft.missingInformation) ? draft.missingInformation : []),
        'No se pudo generar prompt de imagen: falta configuración del provider.',
      ],
    }))
    return {
      ok: false,
      skipped: false,
      result: AiGenerationResultSchema.parse({ ...textResult, drafts, humanReviewRequired: true }),
      usage: null,
      retryable: false,
      failureKind: 'configuration',
      failure: {
        code: 'image_provider_not_configured',
        stage: 'image_prompt',
        retryable: false,
        kind: 'configuration',
      },
    }
  }

  const imagePlatforms = resolveImagePlatforms(input)
  const isTemplateBackdrop =
    input.contentTypeDefinition?.visual?.mode === 'template' &&
    input.backgroundMode === 'ai_generated'
  const assetRole = isTemplateBackdrop
    ? IMAGE_PROMPT_ASSET_ROLES.TEMPLATE_BACKDROP
    : IMAGE_PROMPT_ASSET_ROLES.FULL_IMAGE

  const systemPrompt = buildAgentSystemPrompt({
    modeInstructions: buildImagePromptPlanInstructions({ assetRole }),
  })

  const userPayload = {
    assetRole,
    platforms: imagePlatforms,
    contentData: input.contentData,
    intent: input.intent,
    topic: input.topic,
    contentType: input.contentType,
    contentTypeLabel: input.contentTypeDefinition?.label,
    tone: input.tone,
    audience: input.audience,
    cta: input.cta,
    imageStyle: input.imageStyle,
    imageConstraints: input.imageConstraints,
    knownFacts: input.knownFacts,
    eventDetails: input.eventDetails,
    drafts: textResult.drafts.map((d) => ({
      platform: d.platform,
      draftText: d.draftText,
      assumptions: d.assumptions,
      missingInformation: d.missingInformation,
    })),
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `${formatUntrustedGuidelines(buildPinnedGuidelinePromptPayload(guidelines))}
Generar un imagePrompt compartido.
${formatUntrustedRequest(userPayload)}`,
    },
  ]

  const recoverWithDeterministicPrompt = (error, usage) => {
    if (error?.name === 'OpenRouterConfigurationError') return null
    try {
      const fallback = buildDeterministicImagePromptFallback(input, { assetRole })
      const imagePrompts = imagePlatforms.map((platform) => ({
        platform,
        imagePrompt: fallback.sharedPrompt,
        imageRationale: fallback.sharedRationale,
      }))
      return {
        ok: true,
        skipped: false,
        recovered: true,
        recoveryReason: 'structured_prompt_invalid',
        result: mergeImagePromptsIntoResult(textResult, imagePrompts, input),
        usage,
        retryable: false,
      }
    } catch {
      return null
    }
  }

  const attempt = async (retryFeedback) => {
    const response = await generateOpenRouterText({
      apiKey,
      fetchImpl: fetch,
      model,
      messages: retryFeedback
        ? [
            ...messages,
            {
              role: 'user',
              content: `La respuesta anterior no pasó la validación: ${retryFeedback}. Devuelve un brief nuevo que cumpla exactamente el contrato JSON y todos los criterios de calidad.`,
            },
          ]
        : messages,
      temperature: 0.4,
      forceJson: true,
      maxOutputTokens: OPENROUTER_TEXT_MAX_TOKENS,
      timeoutMs: OPENROUTER_TEXT_TIMEOUT_MS,
    })

    const usage = response.usage
    const assistantText = response.text
    if (!assistantText || typeof assistantText !== 'string') {
      throw attachOpenRouterAttemptMetadata(new Error('Respuesta del provider sin contenido'), {
        usage,
        retryable: true,
      })
    }

    const json = extractFirstJsonObject(assistantText)
    if (!json) {
      throw attachOpenRouterAttemptMetadata(new Error('No se pudo extraer JSON del contenido'), {
        usage,
        retryable: true,
      })
    }

    let resolvedPrompt
    try {
      resolvedPrompt = resolveImagePromptResponse(json, { assetRole })
    } catch (error) {
      throw attachOpenRouterAttemptMetadata(error, {
        usage,
        retryable: !(error instanceof TypeError),
      })
    }

    const imagePrompts = imagePlatforms.map((platform) => ({
      platform,
      imagePrompt: resolvedPrompt.sharedPrompt,
      imageRationale: resolvedPrompt.sharedRationale,
    }))

    let result
    try {
      result = mergeImagePromptsIntoResult(textResult, imagePrompts, input)
    } catch (error) {
      throw attachOpenRouterAttemptMetadata(error, {
        usage,
        retryable: false,
      })
    }

    return { result, usage }
  }

  let accumulatedUsage = null

  try {
    const first = await attempt()
    return {
      ok: true,
      skipped: false,
      result: first.result,
      usage: first.usage,
    }
  } catch (err1) {
    accumulatedUsage = mergeOpenRouterUsage(accumulatedUsage, err1?.usage || null)
    if (!shouldRetryOpenRouterOperation(err1)) {
      const recovered = recoverWithDeterministicPrompt(err1, accumulatedUsage)
      if (recovered) return recovered
      const drafts = textResult.drafts.map((draft) => ({
        ...draft,
        missingInformation: [
          ...(Array.isArray(draft.missingInformation) ? draft.missingInformation : []),
          'No se pudo generar prompt de imagen automáticamente; completar manualmente.',
        ],
      }))
      return {
        ok: false,
        skipped: false,
        result: AiGenerationResultSchema.parse({
          ...textResult,
          drafts,
          humanReviewRequired: true,
        }),
        usage: accumulatedUsage,
        retryable: false,
        failureKind: err1?.name === 'OpenRouterConfigurationError' ? 'configuration' : 'processing',
        failure:
          err1?.name === 'OpenRouterConfigurationError'
            ? {
                code: 'image_provider_not_configured',
                stage: 'image_prompt',
                retryable: false,
                kind: 'configuration',
              }
            : {
                code: 'image_prompt_processing_failed',
                stage: 'image_prompt',
                retryable: false,
                kind: 'processing',
              },
      }
    }
    try {
      const second = await attempt(err1?.message || 'respuesta inválida')
      return {
        ok: true,
        skipped: false,
        result: second.result,
        usage: mergeOpenRouterUsage(accumulatedUsage, second.usage),
      }
    } catch (err2) {
      accumulatedUsage = mergeOpenRouterUsage(accumulatedUsage, err2?.usage || null)
      const recovered = recoverWithDeterministicPrompt(err2, accumulatedUsage)
      if (recovered) return recovered
      const drafts = textResult.drafts.map((draft) => ({
        ...draft,
        missingInformation: [
          ...(Array.isArray(draft.missingInformation) ? draft.missingInformation : []),
          'No se pudo generar prompt de imagen automáticamente; completar manualmente.',
        ],
      }))
      return {
        ok: false,
        skipped: false,
        result: AiGenerationResultSchema.parse({
          ...textResult,
          drafts,
          humanReviewRequired: true,
        }),
        usage: accumulatedUsage,
        retryable: shouldRetryOpenRouterOperation(err2),
        failureKind:
          err2?.name === 'OpenRouterConfigurationError'
            ? 'configuration'
            : shouldRetryOpenRouterOperation(err2)
              ? 'model_or_provider'
              : 'processing',
        failure:
          err2?.name === 'OpenRouterConfigurationError'
            ? {
                code: 'image_provider_not_configured',
                stage: 'image_prompt',
                retryable: false,
                kind: 'configuration',
              }
            : shouldRetryOpenRouterOperation(err2)
              ? {
                  code: 'image_prompt_retry_exhausted',
                  stage: 'image_prompt',
                  retryable: true,
                  kind: 'model_or_provider',
                }
              : {
                  code: 'image_prompt_processing_failed',
                  stage: 'image_prompt',
                  retryable: false,
                  kind: 'processing',
                },
      }
    }
  }
}
