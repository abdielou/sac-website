'use client'

import { PLATFORM_LABELS, CONTENT_TYPE_LABELS } from '@/lib/ai-constants'

async function copyToClipboard(text, onCopied) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    onCopied?.()
  } catch {
    // ignore
  }
}

function downloadDataUrl(dataUrl, fileName) {
  if (!dataUrl || !fileName) return
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = fileName
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

/**
 * @param {Object} props
 * @param {Object} props.result - AiGenerationResult ({ drafts, recommendedNextStep, humanReviewRequired })
 * @param {Object} [props.usage] - OpenRouter usage metadata for this run
 * @param {string} [props.guidelineVersion] - Active guideline version applied to this run
 * @param {Function} [props.onCopyFeedback]
 */
export default function GenerationResult({ result, usage, guidelineVersion, onCopyFeedback }) {
  if (!result) return null

  const drafts = Array.isArray(result.drafts) ? result.drafts : []
  const costAmount = usage?.cost?.amount
  const hasCost = typeof costAmount === 'number'
  const hasTokens = typeof usage?.totalTokens === 'number'

  const handleCopy = (text) => {
    copyToClipboard(text, onCopyFeedback)
  }

  return (
    <div className="mt-8 space-y-6" data-testid="generation-result">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
        Borradores generados ({drafts.length})
      </h2>

      {(hasCost || hasTokens || guidelineVersion) && (
        <p className="text-sm text-gray-500 dark:text-gray-400" data-testid="generation-run-cost">
          {(hasCost || hasTokens) && (
            <>
              {hasCost
                ? `Costo estimado: $${costAmount.toFixed(4)}`
                : 'Costo estimado: no disponible'}
              {hasTokens ? ` · ${usage.totalTokens} tokens` : ''}
            </>
          )}
          {guidelineVersion && (
            <span data-testid="generation-guideline-version">
              {hasCost || hasTokens ? ' · ' : ''}Guías aplicadas: {guidelineVersion}
            </span>
          )}
        </p>
      )}

      {drafts.map((draft, idx) => {
        const platformLabel = PLATFORM_LABELS[draft.platform] || draft.platform
        const missing = Array.isArray(draft.missingInformation) ? draft.missingInformation : []
        const assumptions = Array.isArray(draft.assumptions) ? draft.assumptions : []
        const generatedImages = Array.isArray(draft.generatedImages) ? draft.generatedImages : []

        return (
          <div
            key={`${draft.platform}-${idx}`}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  {platformLabel}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {CONTENT_TYPE_LABELS[draft.contentType] || draft.contentType}
                </span>
              </div>
              {draft.draftText && (
                <button
                  type="button"
                  onClick={() => handleCopy(draft.draftText)}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Copiar borrador
                </button>
              )}
            </div>

            {draft.draftText ? (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800">
                <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                  {draft.draftText}
                </p>
              </div>
            ) : (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                No se generó borrador para esta plataforma.
              </p>
            )}

            {draft.rationale && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium">Justificación:</span> {draft.rationale}
              </p>
            )}

            {assumptions.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Supuestos
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-sm text-gray-600 dark:text-gray-400">
                  {assumptions.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {missing.length > 0 && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-200 mb-1">
                  Información faltante
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-sm text-amber-800 dark:text-amber-300/90">
                  {missing.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {generatedImages.length > 0 && (
              <div
                className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-3 space-y-3"
                data-testid={`generation-image-assets-${draft.platform}`}
              >
                <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
                  Imágenes generadas (borrador)
                </p>
                {generatedImages.map((asset) => (
                  <div key={asset.assetId} className="space-y-2">
                    {asset.dataUrl && (
                      <img
                        src={asset.dataUrl}
                        alt={`Borrador generado para ${platformLabel}`}
                        className="max-h-64 rounded-lg border border-emerald-200 dark:border-emerald-700 object-contain bg-white dark:bg-gray-900"
                      />
                    )}
                    {asset.rationale && (
                      <p className="text-sm text-emerald-800 dark:text-emerald-300/90">
                        <span className="font-medium">Justificación:</span> {asset.rationale}
                      </p>
                    )}
                    {asset.dataUrl && asset.downloadFileName && (
                      <button
                        type="button"
                        onClick={() => downloadDataUrl(asset.dataUrl, asset.downloadFileName)}
                        className="text-sm text-emerald-700 dark:text-emerald-300 hover:underline"
                      >
                        Descargar imagen
                      </button>
                    )}
                    <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
                      Borrador para revisión humana; no publicar sin validar.
                    </p>
                  </div>
                ))}
              </div>
            )}

            {draft.imagePrompt && (
              <div
                className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 px-3 py-3 space-y-2"
                data-testid={`generation-image-prompt-${draft.platform}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-purple-900 dark:text-purple-200">
                    Prompt de imagen (borrador)
                  </p>
                  <button
                    type="button"
                    onClick={() => handleCopy(draft.imagePrompt)}
                    className="text-sm text-purple-700 dark:text-purple-300 hover:underline"
                  >
                    Copiar prompt
                  </button>
                </div>
                <p className="text-sm text-purple-950 dark:text-purple-100 whitespace-pre-wrap font-mono">
                  {draft.imagePrompt}
                </p>
                {draft.imageRationale && (
                  <p className="text-sm text-purple-800 dark:text-purple-300/90">
                    <span className="font-medium">Justificación visual:</span> {draft.imageRationale}
                  </p>
                )}
                <p className="text-xs text-purple-700/80 dark:text-purple-400/80">
                  {generatedImages.length > 0
                    ? 'Prompt usado para generar la imagen de borrador; revisar restricciones de seguridad.'
                    : 'Borrador para generación de imagen; revisar restricciones de seguridad antes de usar.'}
                </p>
              </div>
            )}
          </div>
        )
      })}

      {result.recommendedNextStep && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            <span className="font-medium">Próximo paso recomendado:</span>{' '}
            {result.recommendedNextStep}
          </p>
        </div>
      )}
    </div>
  )
}
