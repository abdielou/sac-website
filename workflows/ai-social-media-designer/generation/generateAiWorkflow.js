import { getWorkflowMetadata } from 'workflow'
import { AI_BASE_POLICY_VERSION } from '../../../lib/ai-agent'
import { contentTypeRequiresImages, shouldGenerateImagePrompt } from '../../../lib/ai-constants'
import {
  buildProvidedPublicationResult,
  markPublicationTextSource,
} from '../../../lib/ai-generation-guardrails'
import { AiGenerationResultSchema } from '../../../lib/ai-generation-schemas'
import { buildAiRunFailure } from '../../../lib/ai-run-failure'
import { mergeOpenRouterUsage } from '../../../lib/ai-openrouter'
import { getBackgroundById } from '../../../lib/social-template/backgroundCatalog'
import { attachTemplateRequestsToResult } from '../../../lib/social-template/buildTemplateTextFields'
import { resolveTemplateLayoutId } from '../../../lib/social-template/templateLayouts'
import { confirmRunClaimStep } from '../shared/confirmRunClaim'
import { persistGenerationHistoryStep } from './steps/history'
import {
  generateImageAssetsStep,
  generateSharedBackdropStep,
  prepareFinalImageStep,
} from './steps/imageAssets'
import { generateImagePromptsStep } from './steps/imagePrompts'
import {
  attachPolicyReview,
  buildRequestPolicyFailure,
  classifyPolicyRequestStep,
  reviewCaptionPolicyStep,
  reviewPolicyResultStep,
} from './steps/policy'
import { loadGuidelinesStep, validatePayloadStep } from './steps/prepare'
import { generateEventPosterTextStep, generateTextStep } from './steps/text'

const GUIDELINE_NONCOMPLIANCE_CATEGORY = 'guideline_noncompliance'

function isConfirmedGuidelineNoncomplianceOnly(decision) {
  const categories = new Set(Array.isArray(decision?.categories) ? decision.categories : [])
  return (
    decision?.decision === 'block' &&
    decision.failClosed !== true &&
    categories.size === 1 &&
    categories.has(GUIDELINE_NONCOMPLIANCE_CATEGORY)
  )
}

function findSharedImagePrompt(result) {
  return result?.drafts?.find((draft) => draft.imagePrompt?.trim())?.imagePrompt?.trim() || null
}

function stepImageFailure(result, fallback = {}) {
  if (result?.failure) return result.failure
  return {
    code: fallback.code || 'image_generation_failed',
    stage: fallback.stage || 'image_generation',
    retryable: result?.retryable === true,
    kind: result?.failureKind || fallback.kind || 'processing',
  }
}

function requiredImageFailureMessage(failure) {
  switch (failure?.code) {
    case 'image_provider_not_configured':
      return 'El proveedor de imágenes no está configurado. Un administrador debe añadir la credencial de OpenRouter antes de generar.'
    case 'image_provider_configuration_error':
      return 'OpenRouter rechazó la configuración del modelo de imágenes. Un administrador debe revisar OPENROUTER_MODEL y la cuenta del proveedor.'
    case 'image_provider_rejected':
      return 'OpenRouter rechazó esta solicitud de imagen y repetirla sin cambios no la resolvería. Revisa las restricciones visuales antes de volver a enviarla.'
    case 'image_provider_retry_exhausted':
      return 'OpenRouter no devolvió una imagen utilizable después de los intentos automáticos. Puedes reintentar cuando el proveedor se recupere.'
    case 'image_post_processing_failed':
      return 'El proveedor generó un archivo, pero no pudo convertirse en una imagen segura para mostrar. Cuando fue posible, el asistente intentó regenerarla automáticamente.'
    case 'image_asset_processing_failed':
      return 'El proveedor respondió, pero ocurrió un fallo interno al preparar el asset. Repetir la misma solicitud no resolvería ese error.'
    case 'image_prompt_retry_exhausted':
    case 'image_prompt_processing_failed':
      return 'El asistente no pudo construir un brief visual utilizable, incluso después de intentar repararlo automáticamente.'
    case 'template_background_invalid':
      return 'El fondo seleccionado ya no está disponible en las Guidelines activas. Elige otro fondo antes de generar.'
    default:
      return 'La imagen no pudo completarse. La causa quedó registrada para evitar un reintento sin contexto.'
  }
}

export async function generateAiWorkflow(input) {
  'use workflow'

  const meta = getWorkflowMetadata()
  const runId = meta?.workflowRunId
  const startedAt =
    meta?.workflowStartedAt instanceof Date
      ? meta.workflowStartedAt.toISOString()
      : new Date().toISOString()

  const claimConfirmation = await confirmRunClaimStep(input, runId, 'generate')
  if (!claimConfirmation?.ok) throw new Error('AI_RUN_CLAIM_LOST')

  const validatedInputResult = await validatePayloadStep(input)
  if (!validatedInputResult.ok) {
    const failure = buildAiRunFailure({
      code: 'generation_payload_invalid',
      stage: 'input',
      retryable: false,
      message:
        'No pudimos leer algunos datos del formulario. Revisa la solicitud e inténtalo nuevamente.',
    })
    if (runId) {
      await persistGenerationHistoryStep({
        input,
        runId,
        status: 'failed',
        failure,
        startedAt,
        completedAt: new Date().toISOString(),
        guidelineVersion: null,
        policyVersion: AI_BASE_POLICY_VERSION,
        contentTypeIdentity: input?.contentTypeIdentity,
      })
    }
    throw new Error(failure.message)
  }

  const pinnedInput = validatedInputResult.value
  const guidelines = await loadGuidelinesStep(pinnedInput)
  if (!guidelines.ok) {
    const failure = buildAiRunFailure({
      code: 'guidelines_version_unavailable',
      stage: 'guidelines',
      retryable: false,
      message:
        'Las guías seleccionadas para esta generación ya no están disponibles. Recarga el formulario antes de intentarlo nuevamente.',
    })
    if (runId) {
      await persistGenerationHistoryStep({
        input: pinnedInput,
        runId,
        status: 'failed',
        failure,
        startedAt,
        completedAt: new Date().toISOString(),
        guidelineVersion: pinnedInput.guidelineVersion,
        policyVersion: AI_BASE_POLICY_VERSION,
        contentTypeIdentity: pinnedInput.contentTypeIdentity,
      })
    }
    throw new Error(failure.message)
  }

  const validatedInput = guidelines.input
  const requestPolicy = await classifyPolicyRequestStep(validatedInput, guidelines)
  if (requestPolicy.decision !== 'allow') {
    const completedAt = new Date().toISOString()
    const failure = buildRequestPolicyFailure(requestPolicy)
    if (runId) {
      await persistGenerationHistoryStep({
        input: validatedInput,
        runId,
        status: 'failed',
        failure,
        startedAt,
        completedAt,
        guidelineVersion: guidelines.version,
        policyVersion: AI_BASE_POLICY_VERSION,
        contentTypeIdentity: guidelines.contentTypeIdentity,
        model: requestPolicy.model,
        usage: requestPolicy.usage,
      })
    }
    throw new Error(failure.message)
  }

  // generationMode is an editorial-output contract. It decides whether SAC
  // writes a new publication caption; it must not suppress internal text work
  // such as policy review, poster microcopy, or visual-prompt generation.
  const preserveProvidedPublicationText = validatedInput.generationMode === 'image_only'
  const shouldGeneratePublicationCaption = !preserveProvidedPublicationText
  const requiresGeneratedImage = preserveProvidedPublicationText
  let textResult
  let usage = null

  if (!shouldGeneratePublicationCaption) {
    textResult = {
      ok: true,
      result: buildProvidedPublicationResult(validatedInput, guidelines),
      usage: null,
      posterText: undefined,
    }
  } else {
    textResult = await generateTextStep(validatedInput, guidelines)
    if (!textResult.ok) {
      console.error('generateAiWorkflow: text provider failed', textResult.reason)
      const retryable = textResult.retryable === true
      const failure = buildAiRunFailure({
        code: 'publication_text_generation_failed',
        stage: 'publication_text',
        retryable,
        message: retryable
          ? 'El servicio no pudo generar el caption de la publicación. Intenta nuevamente.'
          : 'El servicio no puede generar captions por un problema de configuración. Contacta al administrador de SAC.',
      })
      if (runId) {
        await persistGenerationHistoryStep({
          input: validatedInput,
          runId,
          status: 'failed',
          failure,
          startedAt,
          completedAt: new Date().toISOString(),
          guidelineVersion: guidelines.version,
          policyVersion: AI_BASE_POLICY_VERSION,
          contentTypeIdentity: guidelines.contentTypeIdentity,
          usage: mergeOpenRouterUsage(requestPolicy.usage, textResult.usage),
        })
      }
      throw new Error(failure.message)
    }
    textResult = {
      ...textResult,
      result: markPublicationTextSource(textResult.result, 'generated'),
    }

    const captionPolicy = await reviewCaptionPolicyStep(
      validatedInput,
      guidelines,
      textResult.result,
      textResult.posterText
    )
    usage = mergeOpenRouterUsage(textResult.usage, captionPolicy.usage)
    if (captionPolicy.decision !== 'allow') {
      const blockedResult = attachPolicyReview(textResult.result, captionPolicy, 'caption')
      usage = mergeOpenRouterUsage(requestPolicy.usage, usage)
      const completedAt = new Date().toISOString()
      if (runId) {
        await persistGenerationHistoryStep({
          input: validatedInput,
          runId,
          status: 'completed',
          result: blockedResult,
          startedAt,
          completedAt,
          guidelineVersion: guidelines.version,
          policyVersion: AI_BASE_POLICY_VERSION,
          contentTypeIdentity: guidelines.contentTypeIdentity,
          model: captionPolicy.model,
          usage,
        })
      }
      return {
        result: blockedResult,
        usage,
        guidelineVersion: guidelines.version,
        policyVersion: AI_BASE_POLICY_VERSION,
        contentTypeIdentity: guidelines.contentTypeIdentity,
      }
    }
  }

  const usesTemplate =
    shouldGenerateImagePrompt(
      validatedInput.contentType,
      validatedInput,
      validatedInput.contentTypeDefinition
    ) &&
    (validatedInput.backgroundMode === 'stock' ||
      validatedInput.backgroundMode === 'ai_generated') &&
    Boolean(
      resolveTemplateLayoutId(validatedInput.contentType, validatedInput.contentTypeDefinition)
    )

  let posterText = textResult.posterText
  if (
    preserveProvidedPublicationText &&
    usesTemplate &&
    resolveTemplateLayoutId(validatedInput.contentType, validatedInput.contentTypeDefinition) ===
      'event'
  ) {
    const posterTextResult = await generateEventPosterTextStep(validatedInput, guidelines)
    posterText = posterTextResult.posterText
    usage = mergeOpenRouterUsage(usage, posterTextResult.usage)
  }

  let finalResult
  let aiImagePromptResult = null
  let aiTemplateBackdropPromptResult = null
  let originalAiImagePrompt = null
  let imageFailure = null
  let imageProviderRecoveryUsed = false
  let imagePreparationRecoveryUsed = false
  if (usesTemplate && validatedInput.backgroundMode === 'stock') {
    if (!getBackgroundById(validatedInput.backgroundId)) {
      imageFailure = {
        code: 'template_background_invalid',
        stage: 'image_preparation',
        retryable: false,
        kind: 'processing',
      }
      const drafts = textResult.result.drafts.map((draft) => ({
        ...draft,
        missingInformation: [
          ...(Array.isArray(draft.missingInformation) ? draft.missingInformation : []),
          'Fondo de plantilla inválido o no seleccionado.',
        ],
      }))
      finalResult = AiGenerationResultSchema.parse({
        ...textResult.result,
        drafts,
        humanReviewRequired: true,
      })
    } else {
      finalResult = AiGenerationResultSchema.parse(
        attachTemplateRequestsToResult(textResult.result, validatedInput, {
          posterText,
        })
      )
    }
  } else if (usesTemplate && validatedInput.backgroundMode === 'ai_generated') {
    const imagePromptResult = await generateImagePromptsStep(
      validatedInput,
      textResult.result,
      guidelines
    )
    if (!imagePromptResult.ok) imageFailure = stepImageFailure(imagePromptResult)
    aiTemplateBackdropPromptResult = imagePromptResult.result
    const usageAfterPrompts = mergeOpenRouterUsage(usage, imagePromptResult.usage)
    let backdropResult = await generateSharedBackdropStep(
      validatedInput,
      imagePromptResult.result,
      guidelines
    )
    usage = mergeOpenRouterUsage(usageAfterPrompts, backdropResult.usage)
    if (!backdropResult.backdropDataUrl) {
      imageFailure = backdropResult.failure
        ? stepImageFailure(backdropResult)
        : imageFailure || stepImageFailure(backdropResult)
      if (
        !imageProviderRecoveryUsed &&
        backdropResult.retryable === true &&
        findSharedImagePrompt(imagePromptResult.result)
      ) {
        imageProviderRecoveryUsed = true
        const recoveredBackdrop = await generateSharedBackdropStep(
          validatedInput,
          imagePromptResult.result,
          guidelines,
          { maxProviderAttempts: 1 }
        )
        backdropResult = recoveredBackdrop
        usage = mergeOpenRouterUsage(usage, recoveredBackdrop.usage)
        imageFailure = recoveredBackdrop.backdropDataUrl
          ? null
          : stepImageFailure(recoveredBackdrop)
      }
    }

    if (backdropResult.backdropDataUrl) {
      finalResult = AiGenerationResultSchema.parse(
        attachTemplateRequestsToResult(backdropResult.result, validatedInput, {
          backdropDataUrl: backdropResult.backdropDataUrl,
          posterText,
        })
      )
    } else {
      finalResult = backdropResult.result
    }
  } else {
    const imagePromptResult = await generateImagePromptsStep(
      validatedInput,
      textResult.result,
      guidelines
    )
    if (!imagePromptResult.ok) imageFailure = stepImageFailure(imagePromptResult)
    aiImagePromptResult = imagePromptResult.result
    originalAiImagePrompt = findSharedImagePrompt(aiImagePromptResult)
    const usageAfterPrompts = mergeOpenRouterUsage(usage, imagePromptResult.usage)
    let imageAssetResult = await generateImageAssetsStep(
      validatedInput,
      aiImagePromptResult,
      guidelines
    )
    usage = mergeOpenRouterUsage(usageAfterPrompts, imageAssetResult.usage)
    if (!imageAssetResult.result.generatedImage?.dataUrl) {
      imageFailure = imageAssetResult.failure
        ? stepImageFailure(imageAssetResult)
        : imageFailure || stepImageFailure(imageAssetResult)
      if (
        !imageProviderRecoveryUsed &&
        imageAssetResult.retryable === true &&
        originalAiImagePrompt
      ) {
        imageProviderRecoveryUsed = true
        const recoveredAsset = await generateImageAssetsStep(
          validatedInput,
          aiImagePromptResult,
          guidelines,
          { maxProviderAttempts: 1 }
        )
        imageAssetResult = recoveredAsset
        usage = mergeOpenRouterUsage(usage, recoveredAsset.usage)
        imageFailure = recoveredAsset.result.generatedImage?.dataUrl
          ? null
          : stepImageFailure(recoveredAsset)
      }
    }
    finalResult = imageAssetResult.result
  }

  let preparedImageResult = await prepareFinalImageStep(validatedInput, finalResult)
  if (!preparedImageResult.ok) {
    imageFailure = stepImageFailure(preparedImageResult, {
      code: 'image_post_processing_failed',
      stage: 'image_preparation',
      kind: 'post_processing',
    })
    const canRecoverDirectImage = Boolean(aiImagePromptResult && originalAiImagePrompt)
    const canRecoverTemplateBackdrop = Boolean(
      usesTemplate &&
      validatedInput.backgroundMode === 'ai_generated' &&
      aiTemplateBackdropPromptResult &&
      findSharedImagePrompt(aiTemplateBackdropPromptResult)
    )

    if (
      !imagePreparationRecoveryUsed &&
      preparedImageResult.retryable === true &&
      (canRecoverDirectImage || canRecoverTemplateBackdrop)
    ) {
      imagePreparationRecoveryUsed = true

      if (canRecoverDirectImage) {
        const recoveredAsset = await generateImageAssetsStep(
          validatedInput,
          aiImagePromptResult,
          guidelines,
          { maxProviderAttempts: 1 }
        )
        usage = mergeOpenRouterUsage(usage, recoveredAsset.usage)
        if (recoveredAsset.result.generatedImage?.dataUrl) {
          preparedImageResult = await prepareFinalImageStep(validatedInput, recoveredAsset.result)
          imageFailure = preparedImageResult.ok
            ? null
            : stepImageFailure(preparedImageResult, {
                code: 'image_post_processing_failed',
                stage: 'image_preparation',
                kind: 'post_processing',
              })
        } else {
          preparedImageResult = { ...recoveredAsset, ok: false }
          imageFailure = stepImageFailure(recoveredAsset)
        }
      } else {
        const recoveredBackdrop = await generateSharedBackdropStep(
          validatedInput,
          aiTemplateBackdropPromptResult,
          guidelines,
          { maxProviderAttempts: 1 }
        )
        usage = mergeOpenRouterUsage(usage, recoveredBackdrop.usage)
        if (recoveredBackdrop.backdropDataUrl) {
          try {
            const recoveredTemplateResult = AiGenerationResultSchema.parse(
              attachTemplateRequestsToResult(recoveredBackdrop.result, validatedInput, {
                backdropDataUrl: recoveredBackdrop.backdropDataUrl,
                posterText,
              })
            )
            preparedImageResult = await prepareFinalImageStep(
              validatedInput,
              recoveredTemplateResult
            )
            imageFailure = preparedImageResult.ok
              ? null
              : stepImageFailure(preparedImageResult, {
                  code: 'image_post_processing_failed',
                  stage: 'image_preparation',
                  kind: 'post_processing',
                })
          } catch {
            preparedImageResult = {
              ok: false,
              retryable: false,
              failureKind: 'post_processing',
              failure: {
                code: 'image_post_processing_failed',
                stage: 'image_preparation',
                retryable: false,
                kind: 'post_processing',
              },
              result: recoveredBackdrop.result,
            }
            imageFailure = stepImageFailure(preparedImageResult)
          }
        } else {
          preparedImageResult = { ...recoveredBackdrop, ok: false }
          imageFailure = stepImageFailure(recoveredBackdrop)
        }
      }
    }
  }
  finalResult = preparedImageResult.result

  usage = mergeOpenRouterUsage(requestPolicy.usage, usage)
  const requiredImagePlatforms = validatedInput.platforms.filter((platform) =>
    contentTypeRequiresImages(
      platform,
      validatedInput.contentType,
      validatedInput.contentTypeDefinition
    )
  )
  const sponsorMustAppear = Boolean(validatedInput.sponsorLogo?.dataUrl)
  if (
    (requiresGeneratedImage || requiredImagePlatforms.length > 0 || sponsorMustAppear) &&
    !finalResult.generatedImage?.preparedForDisplay
  ) {
    const diagnostic = imageFailure || {
      code: 'image_generation_failed',
      stage: 'image_generation',
      retryable: false,
      kind: 'processing',
    }
    const failure = buildAiRunFailure({
      code: diagnostic.code,
      stage: diagnostic.stage,
      retryable: diagnostic.retryable,
      message: requiredImageFailureMessage(diagnostic),
    })
    if (runId) {
      await persistGenerationHistoryStep({
        input: validatedInput,
        runId,
        status: 'failed',
        failure,
        startedAt,
        completedAt: new Date().toISOString(),
        guidelineVersion: guidelines.version,
        policyVersion: AI_BASE_POLICY_VERSION,
        contentTypeIdentity: guidelines.contentTypeIdentity,
        usage,
      })
    }
    throw new Error(failure.message)
  }
  if (finalResult.generatedImage?.dataUrl) {
    const resultPolicy = await reviewPolicyResultStep(validatedInput, guidelines, finalResult)
    usage = mergeOpenRouterUsage(usage, resultPolicy.usage)
    if (resultPolicy.decision !== 'allow') {
      const canRetryGuidelineNoncompliance =
        validatedInput.contentTypeDefinition?.visual?.mode === 'ai_image' &&
        Boolean(aiImagePromptResult && originalAiImagePrompt) &&
        isConfirmedGuidelineNoncomplianceOnly(resultPolicy)

      if (canRetryGuidelineNoncompliance) {
        const firstPreparedResult = finalResult
        const retryAssetResult = await generateImageAssetsStep(
          validatedInput,
          aiImagePromptResult,
          guidelines,
          {
            correction: {
              originalPrompt: originalAiImagePrompt,
              reviewerReason: resultPolicy.reason,
            },
          }
        )
        usage = mergeOpenRouterUsage(usage, retryAssetResult.usage)

        if (retryAssetResult.result.generatedImage?.dataUrl) {
          const preparedRetryResult = await prepareFinalImageStep(
            validatedInput,
            retryAssetResult.result
          )

          if (preparedRetryResult.result.generatedImage?.preparedForDisplay) {
            const retryPolicy = await reviewPolicyResultStep(
              validatedInput,
              guidelines,
              preparedRetryResult.result
            )
            usage = mergeOpenRouterUsage(usage, retryPolicy.usage)
            finalResult =
              retryPolicy.decision === 'allow'
                ? preparedRetryResult.result
                : attachPolicyReview(preparedRetryResult.result, retryPolicy, 'result')
          } else {
            finalResult = attachPolicyReview(firstPreparedResult, resultPolicy, 'result')
          }
        } else {
          finalResult = attachPolicyReview(firstPreparedResult, resultPolicy, 'result')
        }
      } else {
        finalResult = attachPolicyReview(finalResult, resultPolicy, 'result')
      }
    }
  }

  const completedAt = new Date().toISOString()

  if (runId) {
    await persistGenerationHistoryStep({
      input: validatedInput,
      runId,
      status: 'completed',
      result: finalResult,
      startedAt,
      completedAt,
      guidelineVersion: guidelines.version,
      policyVersion: AI_BASE_POLICY_VERSION,
      contentTypeIdentity: guidelines.contentTypeIdentity,
      usage,
    })
  }

  return {
    result: finalResult,
    usage,
    guidelineVersion: guidelines.version,
    policyVersion: AI_BASE_POLICY_VERSION,
    contentTypeIdentity: guidelines.contentTypeIdentity,
  }
}
