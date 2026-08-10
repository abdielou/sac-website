'use client'

import React, { useMemo } from 'react'
import {
  OUTCOME_LABELS,
  APPROVAL_LABELS,
  SEVERITY_LABELS,
  CATEGORY_LABELS,
} from '@/lib/ai-constants'
import { normalizeAiDiagnosticText } from '@/lib/ai-diagnostic-text'

const OUTCOME_STYLES = {
  pass: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  fail: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
}

const SEVERITY_ORDER = { critical: 0, major: 1, minor: 2 }

const RESULT_SOURCE_LABELS = {
  validator: 'Validador de Guidelines',
  base_policy: 'Política base',
  guidelines: 'Guidelines',
  system: 'Sistema',
}

async function copyToClipboard(text, onCopied) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    onCopied?.()
  } catch {
    // ignore
  }
}

function formatIssuesForCopy(issues) {
  if (!issues?.length) return 'Sin problemas reportados.'
  return issues
    .map((issue, i) => {
      const sev = SEVERITY_LABELS[issue.severity] || issue.severity
      const cat = CATEGORY_LABELS[issue.category] || issue.category
      let line = `${i + 1}. [${sev}] ${cat}: ${normalizeAiDiagnosticText(issue.message)}`
      if (issue.suggestedFix) {
        line += `\n   Sugerencia: ${normalizeAiDiagnosticText(issue.suggestedFix)}`
      }
      return line
    })
    .join('\n\n')
}

/**
 * @param {Object} props
 * @param {Object} props.result - AiValidationResult
 * @param {Object} [props.usage] - OpenRouter usage metadata for this run
 * @param {string} [props.guidelineVersion]
 * @param {string} [props.policyVersion]
 * @param {{ id: string, label: string }} [props.contentTypeIdentity]
 * @param {Record<string, string>} [props.platformLabels]
 * @param {Function} [props.onCopyFeedback]
 */
export default function ValidationResult({
  result,
  usage,
  guidelineVersion,
  policyVersion,
  contentTypeIdentity,
  platformLabels = {},
  onCopyFeedback,
}) {
  const sortedIssues = useMemo(() => {
    const issues = result?.issues || []
    return [...issues].sort(
      (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
    )
  }, [result?.issues])

  if (!result) return null

  const outcome = result.overallOutcome
  const isSystemFailure = result.resultSource === 'system'
  const outcomeStyle = isSystemFailure
    ? OUTCOME_STYLES.warning
    : OUTCOME_STYLES[outcome] || OUTCOME_STYLES.warning
  const costAmount = usage?.cost?.amount
  const hasCost = typeof costAmount === 'number'
  const hasTokens = typeof usage?.totalTokens === 'number'
  const summaryText = normalizeAiDiagnosticText(result.summary)

  const handleCopy = (text) => {
    copyToClipboard(text, onCopyFeedback)
  }

  return (
    <div className="mt-8 space-y-6" data-testid="validation-result">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${outcomeStyle}`}>
          {isSystemFailure ? 'Validación inconclusa' : OUTCOME_LABELS[outcome] || outcome}
        </span>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {isSystemFailure
            ? 'Revisión manual necesaria'
            : APPROVAL_LABELS[result.approvalRecommendation] || result.approvalRecommendation}
        </span>
      </div>

      {(hasCost ||
        hasTokens ||
        guidelineVersion ||
        policyVersion ||
        contentTypeIdentity?.label ||
        result.resultSource) && (
        <p className="text-sm text-gray-500 dark:text-gray-400" data-testid="validation-run-cost">
          {(hasCost || hasTokens) && (
            <>
              {hasCost
                ? `Costo estimado: $${costAmount.toFixed(4)}`
                : 'Costo estimado: no disponible'}
              {hasTokens ? ` · ${usage.totalTokens} tokens` : ''}
            </>
          )}
          {guidelineVersion
            ? `${hasCost || hasTokens ? ' · ' : ''}Guías aplicadas: ${guidelineVersion}`
            : ''}
          {policyVersion
            ? `${hasCost || hasTokens || guidelineVersion ? ' · ' : ''}Política: ${policyVersion}`
            : ''}
          {contentTypeIdentity?.label
            ? `${
                hasCost || hasTokens || guidelineVersion || policyVersion ? ' · ' : ''
              }Tipo: ${contentTypeIdentity.label}`
            : ''}
          {result.resultSource
            ? `${
                hasCost ||
                hasTokens ||
                guidelineVersion ||
                policyVersion ||
                contentTypeIdentity?.label
                  ? ' · '
                  : ''
              }Origen: ${RESULT_SOURCE_LABELS[result.resultSource] || result.resultSource}`
            : ''}
        </p>
      )}

      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Resumen</h2>
          <button
            type="button"
            onClick={() => handleCopy(summaryText)}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Copiar resumen
          </button>
        </div>
        <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{summaryText}</p>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Hallazgos ({sortedIssues.length})
          </h2>
          {sortedIssues.length > 0 && (
            <button
              type="button"
              onClick={() => handleCopy(formatIssuesForCopy(sortedIssues))}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Copiar hallazgos
            </button>
          )}
        </div>
        {sortedIssues.length > 0 ? (
          <ul className="space-y-3">
            {sortedIssues.map((issue, idx) => (
              <li
                key={`${issue.category}-${idx}`}
                className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800/50"
              >
                <div className="flex flex-wrap gap-2 mb-1">
                  <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                    {SEVERITY_LABELS[issue.severity] || issue.severity}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {CATEGORY_LABELS[issue.category] || issue.category}
                  </span>
                  {issue.affectedPlatform && (
                    <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                      {platformLabels[issue.affectedPlatform] || issue.affectedPlatform}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-800 dark:text-gray-200">
                  {normalizeAiDiagnosticText(issue.message)}
                </p>
                {issue.suggestedFix && (
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Sugerencia:</span>{' '}
                    {normalizeAiDiagnosticText(issue.suggestedFix)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div
            className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900 dark:border-green-900/60 dark:bg-green-900/20 dark:text-green-200"
            data-testid="validation-no-findings"
          >
            La validación automática no reportó incumplimientos. El contenido aún necesita revisión
            y aprobación humana antes de publicarse.
          </div>
        )}
      </div>

      {result.platformNotes && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
            Notas de plataforma
          </h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {normalizeAiDiagnosticText(result.platformNotes)}
          </p>
        </div>
      )}

      {result.platformNotesByPlatform && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
            Revisión por red
          </h3>
          <div className="divide-y divide-gray-200 rounded-xl border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
            {Object.entries(result.platformNotesByPlatform).map(([platform, notes]) => (
              <div key={platform} className="p-3">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {platformLabels[platform] || platform}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                  {normalizeAiDiagnosticText(notes)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.imageNotes && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
            Notas de imagen
          </h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {normalizeAiDiagnosticText(result.imageNotes)}
          </p>
        </div>
      )}

      {result.suggestedRevision && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Texto de la publicación corregido
            </h2>
            <button
              type="button"
              onClick={() => handleCopy(result.suggestedRevision)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Copiar texto
            </button>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800/50">
            <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {result.suggestedRevision}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
