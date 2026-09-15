import {
  contentTypeAcceptsImages,
  contentTypeRequiresEventCta,
  isEventContentType,
} from './ai-constants'
import { AiGenerationResultSchema } from './ai-generation-schemas'

export function buildFallbackGenerationResult(input, reason) {
  const platforms = Array.isArray(input?.platforms) ? input.platforms : []
  const contentType = input?.contentType
  if (!platforms.length || !contentType) {
    throw new TypeError('El fallback requiere plataformas y tipo fijados por Guidelines.')
  }

  const sharedDraft = {
    contentType,
    draftText: 'Generación no disponible. Completa este borrador manualmente.',
    rationale: `No fue posible generar automáticamente: ${reason}.`,
    assumptions: [],
    missingInformation: [
      'La generación automática falló; completa el borrador manualmente y valida antes de publicar.',
    ],
  }

  return AiGenerationResultSchema.parse({
    drafts: platforms.map((platform) => ({ ...sharedDraft, platform })),
    recommendedNextStep:
      'Revisar la solicitud, completar datos faltantes y volver a intentar. Validar cualquier borrador antes de aprobar.',
    humanReviewRequired: true,
  })
}

// ---------- Deterministic output guardrails (Phase 2C) ----------

const HASHTAG_PATTERN = /(^|\s)#[\p{L}\p{N}_-]+/gu
const CAMPAIGN_PATTERN = /\b(?:campa(?:ñ|n)a|campaign)\b/i
const REQUIRED_HASHTAG_PATTERN =
  /(?:requier\w*|obligatori\w*|debe[n]?\s+incluir|incluir\s+obligatoriamente)[^\n.]{0,80}hashtags?|hashtags?[^\n.]{0,80}(?:requerid\w*|obligatori\w*)/i
const COST_FACT_PATTERN =
  /\b(?:costo|coste|precio|tarifa|donativo|entrada\s+libre|libre\s+de\s+costo|sin\s+costo|gratis|gratuit[oa]s?)\b/iu
const UNSUPPORTED_FREE_ADMISSION_PATTERNS = [
  /\b(?:este\s+|el\s+|un\s+)?(?:evento|actividad)\s+(?:es\s+|ser[aá]\s+)?(?:totalmente\s+|completamente\s+)?(?:libre\s+de\s+costo|sin\s+costo|gratuit[oa])(?:\s+para\s+(?:toda\s+)?(?:la\s+)?(?:familia|comunidad|p[uú]blico))?/giu,
  /\b(?:la\s+)?(?:entrada|admisi[oó]n)\s+(?:es\s+|ser[aá]\s+)?(?:totalmente\s+|completamente\s+)?(?:libre|libre\s+de\s+costo|sin\s+costo|gratuit[oa])(?:\s+para\s+(?:toda\s+)?(?:la\s+)?(?:familia|comunidad|p[uú]blico))?/giu,
  /\b(?:de\s+forma\s+)?gratuit[oa](?:mente)?\b/giu,
  /\b(?:libre\s+de\s+costo|sin\s+costo|gratis)\b/giu,
]

const APPROVAL_CLAIM_PATTERNS = [
  /aprobad[oa]s?\s+(?:oficialmente\s+)?por\s+(?:la\s+)?SAC/i,
  /avalad[oa]s?\s+(?:oficialmente\s+)?por\s+(?:la\s+)?SAC/i,
  /SAC\s+(?:aprueba|avala|certifica)/i,
  /oficialmente\s+aprobad[oa]/i,
  /list[oa]\s+para\s+publicar\s+sin\s+revisi[oó]n/i,
]

const EVENT_DETAIL_CHECKS = [
  { field: 'name', label: 'Nombre del evento', keyword: /nombre/i },
  { field: 'date', label: 'Fecha del evento', keyword: /fecha/i },
  { field: 'time', label: 'Hora del evento', keyword: /hora/i },
  { field: 'location', label: 'Lugar del evento', keyword: /lugar|ubicaci/i },
]

function hasApprovalClaim(text) {
  if (!text) return false
  return APPROVAL_CLAIM_PATTERNS.some((pattern) => pattern.test(text))
}

function hasIdentifiableCampaign(input) {
  const campaignContext = [
    input?.intent,
    input?.topic,
    input?.cta,
    ...(Array.isArray(input?.knownFacts) ? input.knownFacts : []),
  ]
    .filter(Boolean)
    .join(' ')

  return CAMPAIGN_PATTERN.test(campaignContext)
}

function activeGuidelinesRequireHashtags(guidelines) {
  if (!guidelines) return false

  const rules = Object.values(guidelines.platforms || {})
    .flatMap((platform) =>
      platform && typeof platform === 'object' ? Object.values(platform) : [platform]
    )
    .filter((rule) => typeof rule === 'string')
    .join('\n')

  return REQUIRED_HASHTAG_PATTERN.test(rules)
}

export function shouldIncludeHashtags(input, guidelines) {
  const explicitlyRequested =
    Array.isArray(input?.hashtags) && input.hashtags.some((hashtag) => String(hashtag).trim())

  return (
    explicitlyRequested ||
    hasIdentifiableCampaign(input) ||
    activeGuidelinesRequireHashtags(guidelines)
  )
}

function removeUnrequestedHashtags(text) {
  if (!text) return text

  return text
    .replace(HASHTAG_PATTERN, '$1')
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

function inputSuppliesCostInformation(input) {
  const supplied = [
    input?.intent,
    input?.topic,
    input?.cta,
    ...(Array.isArray(input?.knownFacts) ? input.knownFacts : []),
    ...(Array.isArray(input?.links) ? input.links : []),
    ...Object.values(input?.eventDetails || {}),
  ]
    .filter((value) => typeof value === 'string')
    .join(' ')

  return COST_FACT_PATTERN.test(supplied)
}

function removeUnsupportedFreeAdmissionClaims(text, input) {
  if (!text || inputSuppliesCostInformation(input)) return text

  return UNSUPPORTED_FREE_ADMISSION_PATTERNS.reduce(
    (caption, pattern) => caption.replace(pattern, ''),
    text
  )
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .replace(/([.!?])\s*[.!?]+/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/^\s*[,;:.!?]+\s*/g, '')
    .trim()
}

export function resolveSharedCaptionCharacterLimit(guidelines, platforms = []) {
  const limits = platforms
    .map((platform) => guidelines?.platforms?.[platform]?.captionMaxCharacters)
    .filter((value) => Number.isInteger(value) && value > 0)
  return limits.length ? Math.min(...limits) : null
}

export function buildProvidedPublicationResult(input, guidelines) {
  const captionCharacterLimit = resolveSharedCaptionCharacterLimit(guidelines, input.platforms)
  return AiGenerationResultSchema.parse({
    drafts: input.platforms.map((platform) => ({
      platform,
      contentType: input.contentType,
      draftText: input.publicationText,
      assumptions: [],
      missingInformation: [],
    })),
    ...(captionCharacterLimit ? { captionCharacterLimit } : null),
    recommendedNextStep: 'Revisar la imagen junto al texto provisto antes de publicar.',
    humanReviewRequired: true,
    publicationTextSource: 'provided',
  })
}

export function markPublicationTextSource(result, source) {
  return AiGenerationResultSchema.parse({
    ...result,
    publicationTextSource: source,
  })
}

/**
 * Deterministic post-processing of a model-produced generation result:
 * - one shared caption cloned across every requested platform for compatibility
 * - assumptions/missingInformation always arrays
 * - approval-claim phrases flagged for human review (never silently rewritten)
 * - event-oriented content: unprovided event details surfaced in missingInformation
 * - X drafts over the character limit flagged
 * - humanReviewRequired always true
 *
 * Pure function — returns a schema-valid AiGenerationResult.
 */
export function applyGenerationGuardrails(
  result,
  input,
  { allowHashtags = false, captionMaxCharacters = null } = {}
) {
  const legacyDrafts = Array.isArray(result?.drafts) ? result.drafts : []
  const sharedCaption = result?.caption || legacyDrafts[0]

  const definition = input.contentTypeDefinition
  const requiredEventFields = definition
    ? new Set(
        definition.fields
          .filter(({ required }) => required)
          .map(({ key }) => (key === 'event_name' ? 'name' : key))
      )
    : null
  const missingEventDetails = isEventContentType(input.contentType, definition)
    ? EVENT_DETAIL_CHECKS.filter((check) => {
        if (requiredEventFields && !requiredEventFields.has(check.field)) return false
        const value = input.eventDetails?.[check.field]
        return !(typeof value === 'string' && value.trim())
      })
    : []
  const missingCta =
    isEventContentType(input.contentType, definition) &&
    contentTypeRequiresEventCta(input.contentType, definition) &&
    !input.cta

  const existing = sharedCaption || {
    contentType: input.contentType,
    draftText: 'Generación no disponible. Completa este borrador manualmente.',
    rationale: 'No se generó el caption compartido.',
    assumptions: [],
    missingInformation: ['Caption ausente; completar manualmente.'],
  }
  const assumptions = Array.isArray(existing.assumptions) ? [...existing.assumptions] : []
  const missingInformation = Array.isArray(existing.missingInformation)
    ? [...existing.missingInformation]
    : []

  if (hasApprovalClaim(existing.draftText)) {
    missingInformation.push(
      'El borrador sugiere aprobación oficial de SAC; eliminar o reformular antes de publicar.'
    )
  }

  for (const check of missingEventDetails) {
    const alreadyListed = missingInformation.some((item) => check.keyword.test(item))
    if (!alreadyListed) {
      missingInformation.push(`${check.label}: no provisto; no se inventó.`)
    }
  }
  if (missingCta && !missingInformation.some((item) => /cta|registro|llamad/i.test(item))) {
    missingInformation.push('CTA del evento: no provista; no se inventó.')
  }

  if (
    Number.isInteger(captionMaxCharacters) &&
    captionMaxCharacters > 0 &&
    (existing.draftText?.length || 0) > captionMaxCharacters
  ) {
    missingInformation.push(
      `El caption compartido excede el límite aplicable de ${captionMaxCharacters} caracteres (${existing.draftText.length}); acortar antes de publicar.`
    )
  }

  const normalizedCaption = {
    ...existing,
    contentType: input.contentType,
    draftText: removeUnsupportedFreeAdmissionClaims(
      allowHashtags ? existing.draftText : removeUnrequestedHashtags(existing.draftText),
      input
    ),
    assumptions,
    missingInformation,
    imagePrompt: existing.imagePrompt,
    imageRationale: existing.imageRationale,
  }
  delete normalizedCaption.platform
  const drafts = input.platforms.map((platform) => ({ ...normalizedCaption, platform }))

  return AiGenerationResultSchema.parse({
    drafts,
    ...(Number.isInteger(captionMaxCharacters) && captionMaxCharacters > 0
      ? { captionCharacterLimit: captionMaxCharacters }
      : null),
    recommendedNextStep:
      result?.recommendedNextStep ||
      'Validar los borradores generados antes de aprobar o publicar.',
    humanReviewRequired: true,
  })
}

// ---------- Image prompt guardrails (Phase 2D) ----------

const CHILD_CONTEXT_SAFETY_SUFFIX =
  'Show any child non-identifiably, fully clothed, and only in an ordinary family-safe context.'
const CHILD_REFERENCE_PATTERN = /\b(?:child|children|minor|niñ[oa]s?|menor(?:es)?)\b/i

const IMAGE_PROMPT_REQUIRED_CLAUSES = [
  {
    pattern:
      /\b(?:no|without)\s+identifiable\s+(?:faces|people)|sin\s+(?:rostros|personas)\s+identificables\b/i,
    clause: 'No identifiable faces.',
  },
  {
    pattern:
      /\b(?:no|without)\s+private\s+(?:information|data)|sin\s+(?:informaci[oó]n|datos)\s+privad[oa]s\b/i,
    clause: 'No private information.',
  },
  {
    pattern: /\b(?:no|without)\s+official\s+logos?|sin\s+logos?\s+oficiales\b/i,
    clause: 'No official logos.',
  },
  {
    pattern:
      /\b(?:no|without)\s+copyrighted\s+(?:art\s+)?styles?|sin\s+(?:estilos?\s+)?(?:art[ií]sticos?\s+)?protegidos\b/i,
    clause: 'No copyrighted art styles.',
  },
  {
    pattern: /\b(?:vertical\s+)?3\s*:\s*4(?:\s+vertical)?\b/i,
    clause: 'Compose specifically for a vertical 3:4 canvas.',
  },
  {
    pattern: /fully\s+inside\s+the\s+frame|complet[oa]s?\s+dentro\s+del\s+encuadre/i,
    clause:
      'Keep every essential subject and its functional supports fully inside the frame with generous safe margins; no important element may touch or cross an image edge.',
  },
  {
    pattern: /side-by-side\s+product\s+lineup|productos?\s+sim[eé]tricos?\s+lado\s+a\s+lado/i,
    clause:
      'For comparison topics, do not default to a symmetrical side-by-side product lineup unless explicitly requested; prefer one coherent scene with depth and a clear primary-secondary visual hierarchy.',
  },
  {
    pattern: /physically\s+plausible|f[ií]sicamente\s+plausible/i,
    clause: 'Keep technical equipment physically plausible and do not merge separate objects.',
  },
]

const IMAGE_PROMPT_RISK_PATTERNS = [
  {
    pattern: /\b(?:portrait|retrato)\s+of\b/i,
    message: 'El prompt de imagen sugiere retrato identificable; revisar antes de generar.',
  },
  {
    pattern: /(?:SAC|Sociedad de Astronomía).{0,30}(?:logo|emblema|sello)/i,
    message: 'El prompt de imagen podría incluir logo oficial de SAC; revisar antes de generar.',
  },
  {
    pattern: /foto\s+(?:real|documental)|photorealistic\s+documentary/i,
    message:
      'El prompt sugiere foto documental real; usar estilo ilustrado o genérico para borradores de IA.',
  },
]

function collectProvidedFactStrings(input) {
  const facts = []
  if (Array.isArray(input.knownFacts)) {
    facts.push(...input.knownFacts.map((f) => String(f).toLowerCase()))
  }
  if (input.eventDetails && typeof input.eventDetails === 'object') {
    for (const value of Object.values(input.eventDetails)) {
      if (typeof value === 'string' && value.trim()) {
        facts.push(value.trim().toLowerCase())
      }
    }
  }
  if (input.cta) facts.push(String(input.cta).toLowerCase())
  return facts
}

function ensureImagePromptSafetySuffix(imagePrompt) {
  if (!imagePrompt?.trim()) return imagePrompt
  let normalizedPrompt = imagePrompt.trim()

  for (const { pattern, clause } of IMAGE_PROMPT_REQUIRED_CLAUSES) {
    if (!pattern.test(normalizedPrompt)) {
      normalizedPrompt = `${normalizedPrompt}; ${clause}`
    }
  }
  if (CHILD_REFERENCE_PATTERN.test(normalizedPrompt) && !/fully clothed/i.test(normalizedPrompt)) {
    normalizedPrompt = `${normalizedPrompt}; ${CHILD_CONTEXT_SAFETY_SUFFIX}`
  }

  return normalizedPrompt
}

/**
 * Apply deterministic guardrails to imagePrompt/imageRationale on a single draft.
 * Pure function — returns an updated draft object.
 */
export function applyImagePromptGuardrailsToDraft(draft, input) {
  if (!draft.imagePrompt?.trim()) return draft

  const missingInformation = Array.isArray(draft.missingInformation)
    ? [...draft.missingInformation]
    : []
  let imagePrompt = draft.imagePrompt.trim()

  if (hasApprovalClaim(imagePrompt)) {
    missingInformation.push(
      'El prompt de imagen sugiere aprobación oficial de SAC; reformular antes de generar.'
    )
  }

  for (const { pattern, message } of IMAGE_PROMPT_RISK_PATTERNS) {
    if (pattern.test(imagePrompt) && !missingInformation.includes(message)) {
      missingInformation.push(message)
    }
  }

  const providedFacts = collectProvidedFactStrings(input)
  const dateLike = imagePrompt.match(/\b\d{1,2}\s+de\s+\w+\b|\b\d{4}-\d{2}-\d{2}\b/gi) || []
  for (const fragment of dateLike) {
    const normalized = fragment.toLowerCase()
    const covered = providedFacts.some((fact) => fact.includes(normalized))
    if (!covered) {
      const msg = `El prompt de imagen incluye fecha "${fragment}" no provista en los datos; revisar.`
      if (!missingInformation.some((item) => item.includes(fragment))) {
        missingInformation.push(msg)
      }
    }
  }

  imagePrompt = ensureImagePromptSafetySuffix(imagePrompt)

  if (input.imageConstraints?.trim()) {
    const constraintLower = input.imageConstraints.trim().toLowerCase()
    if (!imagePrompt.toLowerCase().includes(constraintLower.slice(0, 20))) {
      missingInformation.push(
        'Verificar que el prompt de imagen refleje las restricciones indicadas por el usuario.'
      )
    }
  }

  return {
    ...draft,
    imagePrompt,
    missingInformation,
  }
}

export function applyPlatformImagePolicyToDraft(draft, input) {
  if (contentTypeAcceptsImages(draft.platform, input.contentType, input.contentTypeDefinition)) {
    return draft
  }
  const { imagePrompt: _imagePrompt, imageRationale: _imageRationale, ...textOnlyDraft } = draft
  return textOnlyDraft
}

/**
 * Merge image prompts into text drafts and apply image prompt guardrails.
 */
export function mergeImagePromptsIntoResult(textResult, imagePrompts, input) {
  const byPlatform = new Map(
    (Array.isArray(imagePrompts) ? imagePrompts : []).map((entry) => [entry.platform, entry])
  )

  const drafts = textResult.drafts.map((draft) => {
    const allowedDraft = applyPlatformImagePolicyToDraft(draft, input)
    if (allowedDraft !== draft) return allowedDraft
    const promptEntry = byPlatform.get(draft.platform)
    const merged = {
      ...draft,
      imagePrompt: promptEntry?.imagePrompt?.trim() || draft.imagePrompt,
      imageRationale: promptEntry?.imageRationale?.trim() || draft.imageRationale,
    }
    return applyImagePromptGuardrailsToDraft(merged, input)
  })

  return AiGenerationResultSchema.parse({
    ...textResult,
    drafts,
    humanReviewRequired: true,
  })
}

export function resolveImagePlatforms(input) {
  return input.platforms.filter((platform) =>
    contentTypeAcceptsImages(platform, input.contentType, input.contentTypeDefinition)
  )
}
