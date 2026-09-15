import { fetch } from 'workflow'
import { BASE_POLICY_REQUEST_CATEGORIES } from '../../../../lib/ai-agent'
import { AiGenerationResultSchema } from '../../../../lib/ai-generation-schemas'
import { classifyAiPolicyRequest, reviewAiPolicyResult } from '../../../../lib/ai-policy-review'
import { buildAiRunFailure } from '../../../../lib/ai-run-failure'

const GUIDELINE_NONCOMPLIANCE_CATEGORY = 'guideline_noncompliance'
const RETRYABLE_POLICY_REVIEW_ERRORS = new Set([
  'network_error',
  'response_error',
  'provider_error',
  'empty_response',
  'wrong_modality',
  'invalid_model_output',
])

export function buildRequestPolicyFailure(policyDecision) {
  if (!policyDecision?.failClosed) {
    return buildAiRunFailure({
      code: 'policy_request_blocked',
      stage: 'request_policy',
      retryable: false,
      message:
        'La solicitud no puede generarse porque la revisión confirmó un problema de contenido. Revisa la solicitud antes de intentarlo nuevamente.',
    })
  }

  const errorCode = policyDecision.errorCode || 'policy_review_unavailable'
  if (errorCode === 'wrong_modality') {
    return buildAiRunFailure({
      code: 'policy_review_wrong_modality',
      stage: 'request_policy',
      retryable: true,
      message:
        'La revisión automática respondió con una imagen cuando debía responder con texto. No se confirmó una infracción y la generación no llegó a comenzar.',
    })
  }

  if (errorCode === 'model_uncertain') {
    return buildAiRunFailure({
      code: 'policy_review_inconclusive',
      stage: 'request_policy',
      retryable: false,
      message:
        'La revisión automática no pudo determinar con seguridad si la solicitud cumple las reglas. Añade más contexto o simplifica la solicitud.',
    })
  }

  const configurationError = ['missing_api_key', 'missing_fetch', 'provider_rejection'].includes(
    errorCode
  )
  const inputError = [
    'invalid_images',
    'invalid_result',
    'too_many_images',
    'invalid_image',
    'invalid_input',
  ].includes(errorCode)

  if (configurationError || inputError) {
    return buildAiRunFailure({
      code: configurationError ? 'policy_review_configuration_error' : 'policy_review_input_error',
      stage: 'request_policy',
      retryable: false,
      message: configurationError
        ? 'La revisión automática no está disponible por un problema de configuración. Contacta al administrador de SAC.'
        : 'La revisión automática no pudo procesar los datos de la solicitud. Revisa el formulario e inténtalo nuevamente.',
    })
  }

  return buildAiRunFailure({
    code:
      errorCode === 'empty_response'
        ? 'policy_review_empty_response'
        : errorCode === 'invalid_model_output'
          ? 'policy_review_invalid_response'
          : 'policy_review_unavailable',
    stage: 'request_policy',
    retryable: RETRYABLE_POLICY_REVIEW_ERRORS.has(errorCode),
    message:
      'No pudimos completar la revisión automática. No se confirmó una infracción y la generación no llegó a comenzar.',
  })
}

function buildPolicyRequest(input) {
  return {
    generationMode: input.generationMode,
    publicationText: input.generationMode === 'image_only' ? input.publicationText : undefined,
    contentType: input.contentType,
    contentData: input.contentData,
    platforms: input.platforms,
    intent: input.intent,
    topic: input.topic,
    tone: input.tone,
    audience: input.audience,
    cta: input.cta,
    knownFacts: input.knownFacts,
    eventDetails: input.eventDetails,
    hashtags: input.hashtags,
    links: input.links,
    imageStyle: input.imageStyle,
    imageConstraints: input.imageConstraints,
    backgroundMode: input.backgroundMode,
  }
}

function buildPolicyReviewMode(input) {
  return input.generationMode === 'image_only' ? 'image_only_generation' : undefined
}

function buildPolicyGuidelines(guidelines) {
  const first = guidelines.platforms?.[Object.keys(guidelines.platforms)[0]] || {}
  return {
    version: guidelines.version,
    global: first.global,
    platforms: Object.fromEntries(
      Object.entries(guidelines.platforms || {}).map(([platform, value]) => [
        platform,
        value.platform,
      ])
    ),
    contentType: first.contentType,
    prohibited: first.prohibited,
    imagePrompt: first.imagePrompt,
    imageValidation: first.imageValidation,
    contentTypeDefinition: guidelines.contentTypeDefinition,
  }
}

function buildPolicyReviewContext(input) {
  return {
    currentDate: new Date().toISOString().slice(0, 10),
    suppliedLogistics: {
      eventDetails: input.eventDetails,
      cta: input.cta,
      links: input.links,
      sponsorProvided: Boolean(input.sponsorLogo?.dataUrl),
    },
    posterCreativeText:
      'El subtítulo y cuerpo del afiche son redacción creativa, no datos logísticos. Solo son afirmaciones factuales si añaden fecha, hora, lugar, costo, enlace, auspiciador, instrucciones concretas o datos científicos.',
  }
}

export async function classifyPolicyRequestStep(input, guidelines) {
  'use step'
  const images = input.sponsorLogo?.dataUrl ? [input.sponsorLogo.dataUrl] : []
  return classifyAiPolicyRequest(
    {
      request: buildPolicyRequest(input),
      guidelines: buildPolicyGuidelines(guidelines),
      images,
      ...(buildPolicyReviewMode(input) ? { reviewMode: buildPolicyReviewMode(input) } : null),
    },
    { fetchImpl: fetch }
  )
}

export async function reviewPolicyResultStep(input, guidelines, result) {
  'use step'
  const images = []

  if (result.generatedImage?.dataUrl) {
    images.push(result.generatedImage.dataUrl)
  }

  return reviewAiPolicyResult(
    {
      request: buildPolicyRequest(input),
      result: { ...result, policyContext: buildPolicyReviewContext(input) },
      guidelines: buildPolicyGuidelines(guidelines),
      images,
      ...(buildPolicyReviewMode(input) ? { reviewMode: buildPolicyReviewMode(input) } : null),
    },
    { fetchImpl: fetch }
  )
}

export async function reviewCaptionPolicyStep(input, guidelines, textResult, posterText) {
  'use step'
  return reviewAiPolicyResult(
    {
      request: buildPolicyRequest(input),
      result: {
        ...textResult,
        ...(posterText ? { posterCreativeText: posterText } : null),
        policyContext: buildPolicyReviewContext(input),
      },
      guidelines: buildPolicyGuidelines(guidelines),
      images: [],
    },
    { fetchImpl: fetch }
  )
}

const HARD_POLICY_CATEGORIES = new Set([
  BASE_POLICY_REQUEST_CATEGORIES.MEDICAL_ADVICE,
  BASE_POLICY_REQUEST_CATEGORIES.LEGAL_ADVICE,
  BASE_POLICY_REQUEST_CATEGORIES.SEXUAL_CONTENT,
  BASE_POLICY_REQUEST_CATEGORIES.DOUBLE_ENTENDRE,
  BASE_POLICY_REQUEST_CATEGORIES.DECEPTIVE_CONTENT,
  BASE_POLICY_REQUEST_CATEGORIES.OUT_OF_SCOPE,
  BASE_POLICY_REQUEST_CATEGORIES.UNRELATED_IMAGE,
  BASE_POLICY_REQUEST_CATEGORIES.DIRECT_PUBLISHING,
  BASE_POLICY_REQUEST_CATEGORIES.BYPASS_HUMAN_REVIEW,
])

function resolvePolicyDisposition(decision) {
  if (decision.failClosed === true) return 'review'
  return decision.categories.some((category) => HARD_POLICY_CATEGORIES.has(category))
    ? 'block'
    : 'review'
}

export function attachPolicyReview(result, decision, stage) {
  const disposition = resolvePolicyDisposition(decision)
  const hasGuidelineNoncompliance = decision.categories.includes(GUIDELINE_NONCOMPLIANCE_CATEGORY)
  const removeVisual = stage === 'caption' || disposition === 'block'
  const safeResult = removeVisual
    ? (({
        generatedImage: _generatedImage,
        imagePlatforms: _imagePlatforms,
        templateRequest: _templateRequest,
        templateAssets: _templateAssets,
        ...textResult
      }) => textResult)(result)
    : result
  return AiGenerationResultSchema.parse({
    ...safeResult,
    drafts: removeVisual
      ? safeResult.drafts.map(
          ({ imagePrompt: _prompt, imageRationale: _rationale, ...draft }) => draft
        )
      : safeResult.drafts,
    policyReview: {
      stage,
      disposition,
      categories: decision.categories,
      reason: decision.reason,
      failClosed: decision.failClosed === true,
      ...(decision.errorCode ? { errorCode: decision.errorCode } : null),
    },
    recommendedNextStep:
      decision.failClosed === true
        ? 'Vuelve a generar para repetir la revisión de política; no se confirmó una infracción del contenido.'
        : disposition === 'block'
          ? 'Corrige la solicitud o los datos provistos antes de volver a generar.'
          : hasGuidelineNoncompliance
            ? 'Corrige el incumplimiento indicado o vuelve a generar; el borrador se conserva para revisión.'
            : 'Revisa el motivo, confirma los hechos con la información oficial y decide si conservas o corriges el borrador.',
    humanReviewRequired: true,
  })
}
