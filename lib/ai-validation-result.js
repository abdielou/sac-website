import { z } from 'zod'
import { normalizeAiDiagnosticText } from './ai-diagnostic-text'

const DiagnosticTextSchema = z.string().transform(normalizeAiDiagnosticText)

const IssueSchema = z.object({
  severity: z.enum(['minor', 'major', 'critical']),
  category: z.enum([
    'brand_voice',
    'guideline_compliance',
    'platform_fit',
    'clarity',
    'completeness',
    'uncertainty_factual_risk',
    'accessibility',
    'safety',
    'formatting',
    'privacy',
    'image_text_alignment',
    'image_suitability',
  ]),
  message: DiagnosticTextSchema,
  suggestedFix: DiagnosticTextSchema.optional(),
  affectedPlatform: z.string().optional(),
})

export const AiValidationResultSchema = z.object({
  overallOutcome: z.enum(['pass', 'warning', 'fail']),
  approvalRecommendation: z.enum(['ready_for_review', 'needs_edits', 'do_not_publish']),
  summary: DiagnosticTextSchema,
  issues: z.array(IssueSchema),
  platformNotes: DiagnosticTextSchema.optional(),
  platformNotesByPlatform: z.record(DiagnosticTextSchema).optional(),
  imageNotes: DiagnosticTextSchema.optional(),
  suggestedRevision: z.string().optional(),
  resultSource: z.enum(['validator', 'base_policy', 'guidelines', 'system']).optional(),
  humanReviewRequired: z.literal(true),
})

export const AiValidationModelResultSchema = z.object({
  summary: DiagnosticTextSchema,
  issues: z.array(IssueSchema),
  platformNotes: DiagnosticTextSchema.optional(),
  platformNotesByPlatform: z.record(DiagnosticTextSchema).optional(),
  imageNotes: DiagnosticTextSchema.optional(),
  suggestedRevision: z.string().optional(),
})

export function resolveValidationPlatforms(input) {
  const platforms =
    Array.isArray(input?.platforms) && input.platforms.length
      ? input.platforms
      : [input?.platform].filter(Boolean)
  return [...new Set(platforms)]
}

export function buildFallbackResult(input, reason) {
  const platforms = resolveValidationPlatforms(input)
  return AiValidationResultSchema.parse({
    overallOutcome: 'fail',
    approvalRecommendation: 'do_not_publish',
    summary: `No fue posible validar automáticamente: ${reason}. Se requiere revisión humana.`,
    issues: [
      {
        severity: 'major',
        category: 'uncertainty_factual_risk',
        message: `Validación fallida: ${reason}`,
        suggestedFix: 'Revisar el borrador y, si aplica, contrastar detalles con fuentes internas.',
        affectedPlatform: platforms.length === 1 ? platforms[0] : undefined,
      },
    ],
    platformNotes: 'La validación automática falló; no bloquea el flujo manual.',
    imageNotes:
      input.images && input.images.length > 0
        ? 'Incluiste imágenes, pero la validación automática no pudo completarse.'
        : undefined,
    resultSource: 'system',
    humanReviewRequired: true,
  })
}

export function applyConfiguredCaptionLimit(result, input, guidelines) {
  const issues = Array.isArray(result.issues) ? [...result.issues] : []
  const configured = guidelines?.platforms
    ? resolveValidationPlatforms(input).map((platform) => ({
        platform,
        limit: guidelines.platforms?.[platform]?.captionMaxCharacters,
      }))
    : [{ platform: input.platform, limit: guidelines?.captionMaxCharacters }]
  let hasViolation = false

  for (const { platform, limit } of configured) {
    if (!Number.isInteger(limit) || limit < 1 || input.draftText.length <= limit) continue
    hasViolation = true
    const alreadyReported = issues.some(
      (issue) =>
        issue.category === 'platform_fit' &&
        /caracter/i.test(issue.message || '') &&
        (!issue.affectedPlatform || issue.affectedPlatform === platform)
    )
    if (!alreadyReported) {
      issues.push({
        severity: 'major',
        category: 'platform_fit',
        message: `El caption tiene ${input.draftText.length} caracteres y el máximo configurado para ${platform} es ${limit}.`,
        suggestedFix: `Acortar el caption a ${limit} caracteres o menos.`,
        affectedPlatform: platform,
      })
    }
  }

  if (!hasViolation) return result

  return AiValidationResultSchema.parse({
    ...result,
    overallOutcome: result.overallOutcome === 'fail' ? 'fail' : 'warning',
    approvalRecommendation:
      result.approvalRecommendation === 'do_not_publish' ? 'do_not_publish' : 'needs_edits',
    issues,
    humanReviewRequired: true,
  })
}

export function normalizeValidationDraftText(value) {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n') : value
}

function normalizeDraftForComparison(value) {
  if (typeof value !== 'string') return ''
  return normalizeValidationDraftText(value)
    .normalize('NFC')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/[\t ]+$/gm, '')
    .trim()
}

export function reconcileModelSuggestedRevision(result, input) {
  const original = normalizeDraftForComparison(input?.draftText)
  const revision = normalizeDraftForComparison(result?.suggestedRevision)

  if (!revision || revision === original) {
    if (!Object.prototype.hasOwnProperty.call(result || {}, 'suggestedRevision')) return result
    const { suggestedRevision: _suggestedRevision, ...withoutRedundantRevision } = result
    return withoutRedundantRevision
  }

  if (!Array.isArray(result?.issues) || result.issues.length === 0) {
    const error = new Error('El validador propuso cambios al borrador sin asociarlos a un hallazgo')
    error.code = 'UNEXPLAINED_SUGGESTED_REVISION'
    throw error
  }

  return result
}

export function applySuggestedRevisionConsistency(result, input) {
  try {
    const reconciled = reconcileModelSuggestedRevision(result, input)
    return reconciled === result ? result : AiValidationResultSchema.parse(reconciled)
  } catch (error) {
    return buildFallbackResult(input, error.message)
  }
}

export function buildPolicyValidationResult(input, decision) {
  const unavailable = decision.failClosed === true
  const categoryList = Array.isArray(decision.categories) ? decision.categories : []
  const guidelineOnly =
    categoryList.length > 0 &&
    categoryList.every((category) => category === 'guideline_noncompliance')
  const categories = categoryList.join(', ')
  const platforms = resolveValidationPlatforms(input)

  if (guidelineOnly && !unavailable) {
    return AiValidationResultSchema.parse({
      overallOutcome: 'fail',
      approvalRecommendation: 'needs_edits',
      summary: 'El contenido necesita cambios para cumplir las Guías antes de publicarse.',
      issues: [
        {
          severity: 'major',
          category: 'guideline_compliance',
          message: decision.reason || 'El contenido no cumple una regla de Guías.',
          suggestedFix: 'Corrige el requisito indicado y vuelve a validar el contenido.',
          affectedPlatform: platforms.length === 1 ? platforms[0] : undefined,
        },
      ],
      platformNotes: 'Categoría de revisión: guideline_noncompliance.',
      imageNotes:
        input.images?.length > 0
          ? 'La imagen se conserva como borrador, pero debe corregirse antes de publicarse.'
          : undefined,
      resultSource: 'guidelines',
      humanReviewRequired: true,
    })
  }

  return AiValidationResultSchema.parse({
    overallOutcome: 'fail',
    approvalRecommendation: 'do_not_publish',
    summary: unavailable
      ? 'No fue posible confirmar el cumplimiento de la política base. No publiques este contenido.'
      : 'El contenido no cumple la política base de SAC y no debe publicarse.',
    issues: [
      {
        severity: unavailable ? 'major' : 'critical',
        category: unavailable ? 'uncertainty_factual_risk' : 'safety',
        message: decision.reason || 'La revisión de política no pudo aprobar el contenido.',
        suggestedFix: unavailable
          ? 'Solicita una revisión humana antes de continuar.'
          : 'Ajusta el contenido al alcance social y a las restricciones de SAC.',
        affectedPlatform: platforms.length === 1 ? platforms[0] : undefined,
      },
    ],
    platformNotes: categories ? `Categorías de política: ${categories}.` : undefined,
    imageNotes:
      input.images?.length > 0
        ? 'Las imágenes tampoco deben usarse hasta completar una revisión segura.'
        : undefined,
    resultSource: unavailable ? 'system' : 'base_policy',
    humanReviewRequired: true,
  })
}

export function shouldApplyValidationPolicyBlock(decision) {
  if (!decision || decision.decision === 'allow') return false
  if (decision.failClosed === true) return true

  const categories = Array.isArray(decision.categories) ? decision.categories : []
  return !(
    categories.length > 0 && categories.every((category) => category === 'guideline_noncompliance')
  )
}

export const shouldApplyPostValidationPolicyBlock = shouldApplyValidationPolicyBlock

export function normalizeModelValidationVerdict(result) {
  const issues = Array.isArray(result?.issues) ? result.issues : []
  const hasCriticalIssue = issues.some((issue) => issue?.severity === 'critical')
  const overallOutcome = hasCriticalIssue ? 'fail' : issues.length > 0 ? 'warning' : 'pass'
  const approvalRecommendation = hasCriticalIssue
    ? 'do_not_publish'
    : issues.length > 0
      ? 'needs_edits'
      : 'ready_for_review'

  return AiValidationResultSchema.parse({
    ...result,
    overallOutcome,
    approvalRecommendation,
    summary: result.summary,
    resultSource: 'validator',
    humanReviewRequired: true,
  })
}

export function finalizeValidationResult({
  result,
  input,
  guidelines,
  modelSucceeded,
  policyDecision,
}) {
  if (shouldApplyValidationPolicyBlock(policyDecision)) {
    return buildPolicyValidationResult(input, policyDecision)
  }

  let finalized = modelSucceeded ? normalizeModelValidationVerdict(result) : result
  finalized = applySuggestedRevisionConsistency(finalized, input)
  return applyConfiguredCaptionLimit(finalized, input, guidelines)
}
