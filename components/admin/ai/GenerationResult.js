'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_SEED_PLATFORM_LABELS } from '@/lib/ai-constants'
import GeneratedImageLightbox from './GeneratedImageLightbox'

const POLICY_CATEGORY_LABELS = {
  invalid_request: 'No se pudo confirmar la solicitud',
  medical_advice: 'Asesoría médica',
  legal_advice: 'Asesoría legal',
  sexual_content: 'Contenido sexual',
  double_entendre: 'Doble sentido',
  deceptive_content: 'Contenido engañoso',
  out_of_scope: 'Fuera del alcance del SAC',
  unrelated_image: 'Imagen no relacionada',
  guideline_noncompliance: 'No cumple una guía',
  fabricated_facts: 'Hechos no provistos',
  direct_publishing: 'Publicación directa',
  bypass_human_review: 'Omisión de revisión humana',
}

async function copyToClipboard(text) {
  if (!text) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function downloadDataUrl(dataUrl, fileName) {
  if (!dataUrl || !fileName) return false
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = fileName
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  return true
}

function DownloadIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="14" height="14" x="8" y="8" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  )
}

function extractSharedImage(result, drafts) {
  if (result?.generatedImage?.dataUrl) return result.generatedImage
  for (const draft of drafts) {
    const images = Array.isArray(draft.generatedImages) ? draft.generatedImages : []
    if (images.length > 0 && images[0].dataUrl) return images[0]
  }
  return null
}

/**
 * @param {Object} props
 * @param {Object} props.result - AiGenerationResult ({ drafts, recommendedNextStep, humanReviewRequired })
 * @param {Object} [props.usage] - OpenRouter usage metadata for this run
 * @param {string} [props.guidelineVersion] - Active guideline version applied to this run
 * @param {string} [props.policyVersion] - Immutable base policy applied to this run
 * @param {Record<string, string>} [props.platformLabels] - Labels from active Guidelines
 */
export default function GenerationResult({
  result,
  usage,
  guidelineVersion,
  policyVersion,
  contentTypeIdentity,
  platformLabels = {},
}) {
  const [actionFeedback, setActionFeedback] = useState(null)
  const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false)
  const [policyReviewConfirmed, setPolicyReviewConfirmed] = useState(false)
  const [editedCaptions, setEditedCaptions] = useState(() =>
    Array.isArray(result?.drafts) ? result.drafts.map((draft) => draft?.draftText || '') : []
  )
  const imagePreviewTriggerRef = useRef(null)
  const feedbackTimerRef = useRef(null)
  const closeImagePreview = useCallback(() => setIsImagePreviewOpen(false), [])

  useEffect(() => {
    setEditedCaptions(
      Array.isArray(result?.drafts) ? result.drafts.map((draft) => draft?.draftText || '') : []
    )
    setPolicyReviewConfirmed(false)
  }, [result])

  useEffect(
    () => () => {
      if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current)
    },
    []
  )

  if (!result) return null

  const drafts = Array.isArray(result.drafts) ? result.drafts : []
  const costAmount = usage?.cost?.amount
  const hasCost = typeof costAmount === 'number'
  const hasTokens = typeof usage?.totalTokens === 'number'
  const sharedImage = extractSharedImage(result, drafts)
  const captionTexts = drafts.map((draft) => draft?.draftText?.trim()).filter(Boolean)
  const hasSharedCaption = captionTexts.length > 1 && new Set(captionTexts).size === 1
  const displayDrafts = hasSharedCaption ? drafts.slice(0, 1) : drafts
  const generatedDraftCount = displayDrafts.filter((draft) => draft?.draftText?.trim()).length
  const imagePlatforms = Array.isArray(result.imagePlatforms) ? result.imagePlatforms : []
  const captionCharacterLimit = Number.isInteger(result.captionCharacterLimit)
    ? result.captionCharacterLimit
    : null
  const isProvidedPublicationText = result.publicationTextSource === 'provided'
  const sharedPlatformLabel = drafts
    .map(
      ({ platform }) =>
        platformLabels[platform] || DEFAULT_SEED_PLATFORM_LABELS[platform] || platform
    )
    .filter(Boolean)
    .join(' · ')
  const sharedImageAudience = imagePlatforms.length
    ? imagePlatforms
        .map(
          (platform) =>
            platformLabels[platform] || DEFAULT_SEED_PLATFORM_LABELS[platform] || platform
        )
        .join(', ')
    : 'las redes permitidas por Guidelines'
  const policyReview =
    result.policyReview ||
    (result.policyBlock ? { ...result.policyBlock, disposition: 'block' } : null)
  const policyNeedsConfirmation = policyReview?.disposition === 'review'
  const policyReviewUnavailable = policyReview?.failClosed === true
  const hasGuidelineNoncompliance = policyReview?.categories?.includes('guideline_noncompliance')
  const actionsLocked = Boolean(
    policyReview && (policyReview.disposition === 'block' || !policyReviewConfirmed)
  )

  const showActionFeedback = (id, message, succeeded) => {
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current)
    setActionFeedback({ id, message, succeeded })
    feedbackTimerRef.current = window.setTimeout(() => setActionFeedback(null), 2000)
  }

  const handleCopy = async (text, id, successMessage = 'Copiado') => {
    if (actionsLocked) return
    const copied = await copyToClipboard(text)
    showActionFeedback(id, copied ? successMessage : 'No se pudo copiar', copied)
  }

  const handleDownload = () => {
    if (actionsLocked) return
    const downloaded = downloadDataUrl(sharedImage?.dataUrl, sharedImage?.downloadFileName)
    showActionFeedback(
      'download-image',
      downloaded ? 'Imagen descargada' : 'No se pudo descargar',
      downloaded
    )
  }

  return (
    <div className="mt-8 space-y-6" data-testid="generation-result">
      {policyReview && (
        <div
          className={`rounded-lg border px-4 py-4 ${
            policyReview.disposition === 'block'
              ? 'border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100'
              : 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100'
          }`}
          data-testid="generation-policy-review"
          role="alert"
        >
          <p className="font-semibold">
            {policyReview.disposition === 'block'
              ? 'Borrador bloqueado — revisa esto'
              : policyReviewUnavailable
                ? 'Revisión de política no disponible'
                : hasGuidelineNoncompliance
                  ? 'Borrador para corregir'
                  : 'Política: revisar'}
          </p>
          <p className="mt-1 text-sm opacity-90">
            {policyReview.disposition === 'review'
              ? policyReviewUnavailable
                ? policyReview.stage === 'caption'
                  ? 'No se pudo completar la revisión automática. La imagen no se generó; revisa el texto de la publicación o vuelve a generar.'
                  : 'No se pudo completar la revisión automática. No se confirmó una infracción; revisa el contenido o vuelve a generar.'
                : hasGuidelineNoncompliance
                  ? 'El borrador no cumple por completo una regla de Guías. Se conserva para que puedas corregirlo o volver a generar.'
                  : policyReview.stage === 'caption'
                    ? 'El reviewer detectó una duda factual. La imagen no se generó; confirma o corrige el texto de la publicación.'
                    : 'El reviewer detectó una duda factual. Confirma los datos antes de usar el texto de la publicación o la imagen.'
              : policyReview.stage === 'caption'
                ? 'El texto de la publicación viola una política de bloqueo duro. La imagen no se generó.'
                : 'El resultado viola una política de bloqueo duro. La imagen fue descartada.'}
          </p>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold underline underline-offset-2">
              Mostrar el motivo
            </summary>
            <div className="mt-3 space-y-2 text-sm">
              <p>
                <span className="font-semibold">Motivo:</span> {policyReview.reason}
              </p>
              {policyReviewUnavailable ? (
                policyReview.errorCode && (
                  <p>
                    <span className="font-semibold">Código técnico:</span> {policyReview.errorCode}
                  </p>
                )
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">Categorías:</span>
                  {policyReview.categories.map((category) => (
                    <span
                      key={category}
                      className="rounded-full border border-current/30 bg-white/60 px-2 py-0.5 text-xs dark:bg-gray-950/30"
                    >
                      {POLICY_CATEGORY_LABELS[category] || category} ({category})
                    </span>
                  ))}
                </div>
              )}
            </div>
          </details>
          {policyNeedsConfirmation && (
            <label className="mt-4 flex items-start gap-3 rounded-md border border-amber-300 bg-white/60 px-3 py-3 text-sm dark:border-amber-700 dark:bg-gray-950/20">
              <input
                type="checkbox"
                checked={policyReviewConfirmed}
                onChange={(event) => setPolicyReviewConfirmed(event.target.checked)}
                className="mt-0.5 rounded border-amber-400 text-amber-700 focus:ring-amber-600"
              />
              <span>
                {policyReviewUnavailable
                  ? 'Entiendo que la revisión automática no se completó y revisaré el contenido antes de usarlo.'
                  : hasGuidelineNoncompliance
                    ? 'Revisé el incumplimiento indicado y quiero habilitar copiar y descargar este borrador.'
                    : 'Confirmo que comparé el borrador con la información oficial. Habilitar copiar y descargar.'}
              </span>
            </label>
          )}
        </div>
      )}
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
        {policyReview
          ? 'Contenido para corregir'
          : hasSharedCaption
            ? 'Texto compartido'
            : `Textos de la publicación (${generatedDraftCount})`}
      </h2>
      {isProvidedPublicationText && (
        <p
          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100"
          data-testid="generation-publication-text-source"
        >
          Texto proporcionado — no modificado por IA
        </p>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {actionFeedback?.message || ''}
      </p>

      {(hasCost || hasTokens || guidelineVersion || policyVersion) && (
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
          {policyVersion && (
            <span data-testid="generation-policy-version">
              {hasCost || hasTokens || guidelineVersion ? ' · ' : ''}Política: {policyVersion}
            </span>
          )}
        </p>
      )}

      {sharedImage && (
        <div
          className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-3 space-y-3"
          data-testid="generation-shared-image"
        >
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
            Imagen compartida para {sharedImageAudience}
          </p>
          <button
            ref={imagePreviewTriggerRef}
            type="button"
            onClick={() => setIsImagePreviewOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={isImagePreviewOpen}
            aria-label="Ampliar imagen generada"
            className="group relative block w-full max-w-md cursor-zoom-in overflow-hidden rounded-lg border border-emerald-200 bg-white text-left shadow-sm transition hover:border-emerald-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:border-emerald-700 dark:bg-gray-900 dark:focus-visible:ring-emerald-400 dark:focus-visible:ring-offset-gray-900"
          >
            {/* Data URLs are ephemeral workflow output and cannot use the Next image optimizer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sharedImage.dataUrl}
              alt="Arte compartido para redes sociales"
              className="aspect-[3/4] w-full object-contain"
            />
            <span className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-black/75 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-sm transition group-hover:bg-black/90">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4M11 8v6M8 11h6" />
              </svg>
              Ampliar
            </span>
          </button>
          {sharedImage.rationale && (
            <p className="text-sm text-emerald-800 dark:text-emerald-300/90">
              <span className="font-medium">Justificación:</span> {sharedImage.rationale}
            </p>
          )}
          {sharedImage.downloadFileName && (
            <button
              type="button"
              onClick={handleDownload}
              disabled={actionsLocked}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:focus-visible:ring-emerald-400 dark:focus-visible:ring-offset-gray-900"
            >
              {actionFeedback?.id === 'download-image' && actionFeedback.succeeded ? (
                <CheckIcon />
              ) : (
                <DownloadIcon />
              )}
              {actionFeedback?.id === 'download-image'
                ? actionFeedback.message
                : 'Descargar imagen'}
            </button>
          )}
          <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
            Borrador para revisión humana; no publicar sin validar.
          </p>
        </div>
      )}

      <GeneratedImageLightbox
        image={isImagePreviewOpen ? sharedImage : null}
        onClose={closeImagePreview}
        returnFocusRef={imagePreviewTriggerRef}
      />

      {displayDrafts.map((draft, idx) => {
        const platformLabel =
          platformLabels[draft.platform] ||
          DEFAULT_SEED_PLATFORM_LABELS[draft.platform] ||
          draft.platform
        const contentTypeLabel =
          contentTypeIdentity?.id === draft.contentType && contentTypeIdentity?.label
            ? contentTypeIdentity.label
            : draft.contentType
        const missing = Array.isArray(draft.missingInformation) ? draft.missingInformation : []
        const assumptions = Array.isArray(draft.assumptions) ? draft.assumptions : []
        const originalCaption = draft.draftText || ''
        const editedCaption = editedCaptions[idx] ?? originalCaption
        const captionChanged = editedCaption !== originalCaption
        const exceedsCharacterLimit =
          Boolean(captionCharacterLimit) && editedCaption.length > captionCharacterLimit

        return (
          <div
            key={hasSharedCaption ? 'shared-caption' : `${draft.platform}-${idx}`}
            data-testid={hasSharedCaption ? 'generation-shared-caption' : undefined}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  {hasSharedCaption ? sharedPlatformLabel : platformLabel}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{contentTypeLabel}</span>
              </div>
            </div>

            {draft.draftText ? (
              <>
                <div className="space-y-1.5">
                  <label
                    htmlFor={`generated-caption-${idx}`}
                    className="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Editar texto
                  </label>
                  <textarea
                    id={`generated-caption-${idx}`}
                    value={editedCaption}
                    maxLength={
                      isProvidedPublicationText ? undefined : captionCharacterLimit || undefined
                    }
                    rows={5}
                    onChange={(event) => {
                      const nextCaption = event.target.value
                      setEditedCaptions((current) => {
                        const next = [...current]
                        next[idx] = nextCaption
                        return next
                      })
                    }}
                    className="block w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-blue-400 dark:focus:ring-blue-400"
                  />
                  <div className="flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span>
                      {actionsLocked
                        ? 'Confirma la revisión de política para copiar.'
                        : 'Se copiará esta versión.'}
                    </span>
                    <span aria-live="polite">
                      {captionCharacterLimit
                        ? `${editedCaption.length}/${captionCharacterLimit}`
                        : `${editedCaption.length} caracteres`}
                    </span>
                  </div>
                  {isProvidedPublicationText && exceedsCharacterLimit && (
                    <p
                      className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100"
                      data-testid="generation-publication-text-limit-warning"
                      role="alert"
                    >
                      El texto tiene {editedCaption.length} caracteres y supera el límite
                      configurado de {captionCharacterLimit}. No se recortó automáticamente.
                    </p>
                  )}
                  {isProvidedPublicationText && (
                    <p
                      className="text-xs text-gray-600 dark:text-gray-400"
                      data-testid="generation-publication-text-image-notice"
                    >
                      Editar este texto no vuelve a generar, realinear ni revisar la imagen
                      automáticamente.
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(editedCaption, `copy-caption-${idx}`, 'Texto copiado')
                    }
                    disabled={actionsLocked}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto dark:bg-blue-600 dark:hover:bg-blue-500 dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-gray-900"
                  >
                    {actionFeedback?.id === `copy-caption-${idx}` && actionFeedback.succeeded ? (
                      <CheckIcon />
                    ) : (
                      <CopyIcon />
                    )}
                    {actionFeedback?.id === `copy-caption-${idx}`
                      ? actionFeedback.message
                      : 'Copiar texto'}
                  </button>
                  {captionChanged && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditedCaptions((current) => {
                          const next = [...current]
                          next[idx] = originalCaption
                          return next
                        })
                      }}
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 sm:w-auto dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-gray-900"
                    >
                      Restaurar original
                    </button>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                {hasSharedCaption
                  ? 'No se generó el texto de la publicación.'
                  : 'No se generó texto para esta plataforma.'}
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

            {draft.imagePrompt && !result.templateRequest && (
              <div
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-3 space-y-2"
                data-testid={`generation-image-prompt-${draft.platform}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Prompt de imagen (borrador)
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(draft.imagePrompt, `copy-prompt-${draft.platform}-${idx}`)
                    }
                    disabled={actionsLocked}
                    className="text-sm text-blue-600 hover:underline disabled:cursor-not-allowed disabled:opacity-45 dark:text-blue-400"
                  >
                    {actionFeedback?.id === `copy-prompt-${draft.platform}-${idx}`
                      ? actionFeedback.message
                      : 'Copiar prompt'}
                  </button>
                </div>
                <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap font-mono">
                  {draft.imagePrompt}
                </p>
                {draft.imageRationale && (
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-medium">Justificación visual:</span>{' '}
                    {draft.imageRationale}
                  </p>
                )}
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {sharedImage
                    ? 'Prompt usado para generar la imagen compartida; revisar restricciones de seguridad.'
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
