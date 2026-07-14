'use client'

import { useMemo } from 'react'
import {
  OUTCOME_LABELS,
  APPROVAL_LABELS,
  SEVERITY_LABELS,
  CATEGORY_LABELS,
} from '@/lib/ai-constants'

const OUTCOME_STYLES = {
  pass: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  fail: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
}

const SEVERITY_ORDER = { critical: 0, major: 1, minor: 2 }

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
      let line = `${i + 1}. [${sev}] ${cat}: ${issue.message}`
      if (issue.suggestedFix) line += `\n   Sugerencia: ${issue.suggestedFix}`
      return line
    })
    .join('\n\n')
}

/**
 * @param {Object} props
 * @param {Object} props.result - AiValidationResult
 * @param {Object} [props.usage] - OpenRouter usage metadata for this run
 * @param {Function} [props.onCopyFeedback]
 */
export default function ValidationResult({ result, usage, onCopyFeedback }) {
  const sortedIssues = useMemo(() => {
    const issues = result?.issues || []
    return [...issues].sort(
      (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
    )
  }, [result?.issues])

  if (!result) return null

  const outcome = result.overallOutcome
  const outcomeStyle = OUTCOME_STYLES[outcome] || OUTCOME_STYLES.warning
  const costAmount = usage?.cost?.amount
  const hasCost = typeof costAmount === 'number'
  const hasTokens = typeof usage?.totalTokens === 'number'

  const handleCopy = (text) => {
    copyToClipboard(text, onCopyFeedback)
  }

  return (
    <div className="mt-8 space-y-6" data-testid="validation-result">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${outcomeStyle}`}>
          {OUTCOME_LABELS[outcome] || outcome}
        </span>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {APPROVAL_LABELS[result.approvalRecommendation] || result.approvalRecommendation}
        </span>
      </div>

      {(hasCost || hasTokens) && (
        <p className="text-sm text-gray-500 dark:text-gray-400" data-testid="validation-run-cost">
          {hasCost
            ? `Costo estimado: $${costAmount.toFixed(4)}`
            : 'Costo estimado: no disponible'}
          {hasTokens ? ` · ${usage.totalTokens} tokens` : ''}
        </p>
      )}

      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Resumen</h2>
          <button
            type="button"
            onClick={() => handleCopy(result.summary)}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Copiar resumen
          </button>
        </div>
        <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{result.summary}</p>
      </div>

      {sortedIssues.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Problemas ({sortedIssues.length})
            </h2>
            <button
              type="button"
              onClick={() => handleCopy(formatIssuesForCopy(sortedIssues))}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Copiar problemas
            </button>
          </div>
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
                </div>
                <p className="text-sm text-gray-800 dark:text-gray-200">{issue.message}</p>
                {issue.suggestedFix && (
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Sugerencia:</span> {issue.suggestedFix}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.platformNotes && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
            Notas de plataforma
          </h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {result.platformNotes}
          </p>
        </div>
      )}

      {result.imageNotes && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
            Notas de imagen
          </h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {result.imageNotes}
          </p>
        </div>
      )}

      {result.suggestedRevision && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Borrador sugerido
            </h2>
            <button
              type="button"
              onClick={() => handleCopy(result.suggestedRevision)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Copiar borrador sugerido
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
