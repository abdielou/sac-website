import { z } from 'zod'
import { normalizeAiDiagnosticText } from './ai-diagnostic-text'

const DiagnosticTextSchema = z.string().transform(normalizeAiDiagnosticText)

const TextCorrectionSchema = z
  .object({
    before: z.string().min(1).max(2_000),
    after: z.string().max(2_000),
    occurrence: z.number().int().min(1).max(100).optional(),
  })
  .strict()

export const AiValidationIssueSchema = z.object({
  severity: z.enum(['suggestion', 'minor', 'major', 'critical']),
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
  textCorrections: z.array(TextCorrectionSchema).min(1).max(20).optional(),
})

const AiValidationImageNoteSchema = z
  .object({
    imageIndex: z.number().int().min(1).max(4),
    fileName: z.string().trim().min(1).max(255).optional(),
    notes: DiagnosticTextSchema,
  })
  .strict()

export const AiValidationResultSchema = z.object({
  overallOutcome: z.enum(['pass', 'warning', 'fail']),
  approvalRecommendation: z.enum(['ready_for_review', 'needs_edits', 'do_not_publish']),
  summary: DiagnosticTextSchema,
  issues: z.array(AiValidationIssueSchema),
  platformNotes: DiagnosticTextSchema.optional(),
  platformNotesByPlatform: z.record(DiagnosticTextSchema).optional(),
  imageNotes: DiagnosticTextSchema.optional(),
  imageNotesByImage: z.array(AiValidationImageNoteSchema).max(4).optional(),
  suggestedRevision: z.string().optional(),
  resultSource: z.enum(['validator', 'base_policy', 'guidelines', 'system']).optional(),
  errorCode: z.string().trim().min(1).max(100).optional(),
  humanReviewRequired: z.literal(true),
})

export const AiValidationModelResultSchema = z.object({
  summary: DiagnosticTextSchema,
  issues: z.array(AiValidationIssueSchema),
  platformNotes: DiagnosticTextSchema.optional(),
  platformNotesByPlatform: z.record(DiagnosticTextSchema).optional(),
  imageNotes: DiagnosticTextSchema.optional(),
  imageNotesByImage: z.array(AiValidationImageNoteSchema).max(4).optional(),
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

function normalizeCorrectionFragment(value) {
  if (typeof value !== 'string') return ''
  return normalizeValidationDraftText(value)
    .normalize('NFC')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, '')
}

function revisionContractError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function findCorrectionOccurrences(text, fragment) {
  const matches = []
  let cursor = 0

  while (cursor <= text.length - fragment.length) {
    const index = text.indexOf(fragment, cursor)
    if (index === -1) break
    matches.push(index)
    cursor = index + fragment.length
  }

  return matches
}

function resolveTextCorrection(correction, original) {
  const before = normalizeCorrectionFragment(correction.before)
  const after = normalizeCorrectionFragment(correction.after)

  if (!before.trim()) {
    throw revisionContractError(
      'INVALID_TEXT_CORRECTION',
      'Una corrección textual necesita un fragmento original con contexto'
    )
  }
  if (before === after) {
    throw revisionContractError(
      'INVALID_TEXT_CORRECTION',
      'Una corrección textual no puede reemplazar un fragmento por el mismo texto'
    )
  }

  const occurrences = findCorrectionOccurrences(original, before)
  if (occurrences.length === 0) {
    throw revisionContractError(
      'INVALID_TEXT_CORRECTION',
      `La corrección no encuentra el fragmento original: “${before}”`
    )
  }
  if (correction.occurrence === undefined && occurrences.length > 1) {
    throw revisionContractError(
      'AMBIGUOUS_TEXT_CORRECTION',
      `La corrección es ambigua; “${before}” aparece más de una vez`
    )
  }

  const occurrence = correction.occurrence || 1
  const start = occurrences[occurrence - 1]
  if (start === undefined) {
    throw revisionContractError(
      'INVALID_TEXT_CORRECTION',
      `La ocurrencia ${occurrence} de “${before}” no existe en el borrador`
    )
  }

  return {
    before,
    after,
    ...(occurrences.length > 1 || correction.occurrence !== undefined ? { occurrence } : null),
    start,
    end: start + before.length,
    fingerprint: JSON.stringify([start, start + before.length, after]),
  }
}

function correctionSuggestion(corrections) {
  return corrections
    .map(({ before, after }) =>
      after ? `Cambiar “${before}” por “${after}”.` : `Eliminar “${before}”.`
    )
    .join(' ')
}

function correctionMessage(issue, corrections) {
  if (corrections.length === 1) {
    const { before, after } = corrections[0]
    if (!after) return `El texto “${before}” debe eliminarse.`

    if (/nombre|instituci[oó]n|oficial/i.test(issue.message || '')) {
      return `El nombre de la institución no coincide con el nombre oficial: “${before}” debe decir “${after}”.`
    }
    if (/ortogr[aá]f|errata/i.test(issue.message || '')) {
      return `Hay un error ortográfico: “${before}” debe decir “${after}”.`
    }
    return `El texto no coincide con la forma requerida: “${before}” debe decir “${after}”.`
  }

  const changes = corrections
    .map(({ before, after }) => (after ? `“${before}” → “${after}”` : `eliminar “${before}”`))
    .join('; ')
  return `La corrección propuesta requiere estos cambios exactos: ${changes}.`
}

const SEVERITY_RANK = { suggestion: -1, minor: 0, major: 1, critical: 2 }

function mergeDuplicateCorrectionIssues(current, candidate) {
  const candidateIsMoreSevere =
    (SEVERITY_RANK[candidate.severity] ?? -1) > (SEVERITY_RANK[current.severity] ?? -1)
  const preferred = candidateIsMoreSevere ? candidate : current
  const category =
    current.category === 'guideline_compliance' || candidate.category === 'guideline_compliance'
      ? 'guideline_compliance'
      : preferred.category

  return {
    ...preferred,
    severity: candidateIsMoreSevere ? candidate.severity : current.severity,
    category,
  }
}

function reconcileIssueCorrections(issues, original) {
  const resolvedIssues = []
  const uniqueEdits = new Map()
  const correctionClaims = new Map()
  const duplicateIssues = new Map()

  for (const issue of issues) {
    const declared = Array.isArray(issue.textCorrections) ? issue.textCorrections : []
    if (declared.length === 0) {
      resolvedIssues.push(issue)
      continue
    }

    const resolved = declared.map((correction) => resolveTextCorrection(correction, original))
    const uniqueResolved = [...new Map(resolved.map((edit) => [edit.fingerprint, edit])).values()]
    const signature = uniqueResolved
      .map(({ fingerprint }) => fingerprint)
      .sort()
      .join('|')
    const platformScope = issue.affectedPlatform || '*'

    for (const edit of uniqueResolved) {
      const claimKey = `${platformScope}:${edit.fingerprint}`
      const previousSignature = correctionClaims.get(claimKey)
      if (previousSignature && previousSignature !== signature) {
        throw revisionContractError(
          'CONFLICTING_TEXT_CORRECTIONS',
          'Una misma corrección textual fue repartida entre hallazgos distintos'
        )
      }
      correctionClaims.set(claimKey, signature)
      uniqueEdits.set(edit.fingerprint, edit)
    }

    const publicCorrections = uniqueResolved.map(({ before, after, occurrence }) => ({
      before,
      after,
      ...(occurrence !== undefined ? { occurrence } : null),
    }))
    const normalizedIssue = {
      ...issue,
      message: correctionMessage(issue, publicCorrections),
      suggestedFix: correctionSuggestion(publicCorrections),
      textCorrections: publicCorrections,
    }
    const duplicateKey = `${platformScope}:${signature}`
    const existingIndex = duplicateIssues.get(duplicateKey)

    if (existingIndex === undefined) {
      duplicateIssues.set(duplicateKey, resolvedIssues.length)
      resolvedIssues.push(normalizedIssue)
    } else {
      resolvedIssues[existingIndex] = mergeDuplicateCorrectionIssues(
        resolvedIssues[existingIndex],
        normalizedIssue
      )
    }
  }

  const edits = [...uniqueEdits.values()].sort((a, b) => a.start - b.start || a.end - b.end)
  for (let index = 1; index < edits.length; index += 1) {
    if (edits[index].start < edits[index - 1].end) {
      throw revisionContractError(
        'OVERLAPPING_TEXT_CORRECTIONS',
        'Las correcciones textuales se solapan y no se pueden aplicar de forma segura'
      )
    }
  }

  let revised = original
  for (const edit of [...edits].reverse()) {
    revised = `${revised.slice(0, edit.start)}${edit.after}${revised.slice(edit.end)}`
  }

  return { issues: resolvedIssues, revised, hasCorrections: edits.length > 0 }
}

export function reconcileModelSuggestedRevision(result, input) {
  const original = normalizeDraftForComparison(input?.draftText)
  const revision = normalizeDraftForComparison(result?.suggestedRevision)
  const issues = Array.isArray(result?.issues) ? result.issues : []
  const reconciled = reconcileIssueCorrections(issues, original)

  if (!reconciled.hasCorrections && (!revision || revision === original)) {
    if (!Object.prototype.hasOwnProperty.call(result || {}, 'suggestedRevision')) return result
    const { suggestedRevision: _suggestedRevision, ...withoutRedundantRevision } = result
    return withoutRedundantRevision
  }

  if (!reconciled.hasCorrections) {
    throw revisionContractError(
      'UNEXPLAINED_SUGGESTED_REVISION',
      'El validador propuso cambios al borrador sin asociarlos a correcciones verificables'
    )
  }

  if (reconciled.revised === original) {
    throw revisionContractError(
      'INVALID_TEXT_CORRECTION',
      'Las correcciones declaradas no producen un cambio material'
    )
  }

  if (revision && revision !== reconciled.revised) {
    throw revisionContractError(
      'SUGGESTED_REVISION_MISMATCH',
      'Las correcciones de los hallazgos no reconstruyen el texto corregido'
    )
  }

  return {
    ...result,
    summary:
      reconciled.issues.length === issues.length
        ? result.summary
        : 'Se encontraron hallazgos que requieren corrección.',
    issues: reconciled.issues,
    suggestedRevision: reconciled.revised,
  }
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
    errorCode: unavailable ? decision.errorCode || 'policy_review_unavailable' : undefined,
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
