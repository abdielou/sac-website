'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { addPlatform, listPlatformEntries, removePlatform } from '@/lib/ai-guidelines-draft'
import {
  listContentTypeDefinitions,
  summarizeGuidelineDocumentChanges,
  validateGuidelineForActivation,
} from '@/lib/ai-guidelines-schema'
import { useGuidelinesDraft } from '@/lib/hooks/useGuidelinesDraft'
import GuidelinesActivationReview from '@/components/admin/ai/GuidelinesActivationReview'
import GuidelinesContentTypeCatalog from '@/components/admin/ai/GuidelinesContentTypeCatalog'
import GuidelinesGeneralRules from '@/components/admin/ai/GuidelinesGeneralRules'
import GuidelinesPlatforms from '@/components/admin/ai/GuidelinesPlatforms'
import GuidelinesPolicyNotice from '@/components/admin/ai/GuidelinesPolicyNotice'
import GuidelinesVersionHeader from '@/components/admin/ai/GuidelinesVersionHeader'
import GuidelinesVersionHistory from '@/components/admin/ai/GuidelinesVersionHistory'
import GuidelinesWorkspaceNav, {
  GUIDELINES_SECTIONS,
} from '@/components/admin/ai/GuidelinesWorkspaceNav'

function GuidelinesSkeleton() {
  return (
    <div aria-label="Cargando guías" className="animate-pulse space-y-5">
      <div className="h-7 w-72 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="h-4 w-full max-w-2xl rounded bg-gray-200 dark:bg-gray-700" />
      <div className="h-20 rounded-xl bg-gray-200 dark:bg-gray-800" />
      <div className="h-28 rounded-xl bg-blue-100 dark:bg-blue-950/40" />
      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="h-96 rounded-xl bg-gray-200 dark:bg-gray-800" />
        <div className="h-[520px] rounded-xl bg-gray-200 dark:bg-gray-800" />
      </div>
    </div>
  )
}

function LoadError({ message, loading, onRetry }) {
  return (
    <div
      role="alert"
      className="max-w-xl rounded-xl border border-red-200 bg-red-50 p-5 text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100"
    >
      <h2 className="font-semibold">No pudimos cargar las guías</h2>
      <p className="mt-1 text-sm text-red-800 dark:text-red-200">
        {message || 'Revisa tu conexión e inténtalo de nuevo.'}
      </p>
      <button
        type="button"
        onClick={onRetry}
        disabled={loading}
        className="mt-4 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-50 dark:focus-visible:ring-offset-gray-900"
      >
        {loading ? 'Intentando…' : 'Intentar de nuevo'}
      </button>
    </div>
  )
}

const CONTENT_TYPE_PANELS = new Set(['information', 'fields', 'validation', 'generation', 'image'])

function domId(value) {
  return String(value || 'new').replace(/[^a-zA-Z0-9_-]/g, '-')
}

function contentTypePanelForPath(path) {
  const value = String(path || '')
  if (/\.fields(?:\.|$)/.test(value)) return 'fields'
  if (/\.validation(?:\.|$)/.test(value)) return 'validation'
  if (/\.generation(?:\.|$)/.test(value)) return 'generation'
  if (/\.visual(?:\.|$)/.test(value)) return 'image'
  return 'information'
}

function platformForPath(path) {
  const match = String(path || '').match(
    /^(?:platforms|platformLabels|generation\.platforms|platformConstraints)\.([^.]+)(?:\..+)?$/
  )
  return match?.[1] || null
}

function focusTargetId(path, document, selectedTypeId) {
  const value = String(path || '')
  const generalTargets = {
    global: 'guidelines-brand-voice',
    'generation.global': 'guidelines-generation-global',
    prohibited: 'guidelines-prohibited',
    imageValidation: 'guidelines-image-validation',
    'generation.imagePrompt': 'guidelines-image-generation',
  }
  if (generalTargets[value]) return generalTargets[value]

  const platformId = platformForPath(value)
  if (platformId) {
    if (!Object.prototype.hasOwnProperty.call(document?.platforms || {}, platformId)) {
      return `platform-${domId(platformId)}-restore`
    }
    if (value.startsWith('platformLabels.')) return `platform-${domId(platformId)}-label`
    if (value.startsWith('platformConstraints.')) {
      return `platform-${domId(platformId)}-caption-limit`
    }
    return `platform-${domId(platformId)}-rules`
  }

  const typeMatch = value.match(/^contentTypeCatalog\.(\d+)(?:\.(.*))?$/)
  if (!typeMatch) return null
  const typeIndex = Number(typeMatch[1])
  const definition = document?.contentTypeCatalog?.[typeIndex]
  const typeId = definition?.id || selectedTypeId
  if (!typeId) return null
  const safeTypeId = domId(typeId)
  const suffix = typeMatch[2] || ''

  if (!suffix || suffix === 'label') return `content-type-${safeTypeId}-label`
  if (suffix === 'description') return `content-type-${safeTypeId}-description`
  if (suffix === 'titleSource') return `content-type-${safeTypeId}-title-source`
  if (suffix.startsWith('validation')) return `content-type-${safeTypeId}-validation-rules`
  if (suffix.startsWith('generation')) return `content-type-${safeTypeId}-generation-rules`
  if (suffix === 'visual.template') return `content-type-${safeTypeId}-template`
  const policyMatch = suffix.match(/^visual\.imagePolicyByPlatform\.([^.]+)$/)
  if (policyMatch) return `content-type-${safeTypeId}-policy-${domId(policyMatch[1])}`
  if (suffix.startsWith('visual')) return `content-type-${safeTypeId}-visual-mode`

  const fieldMatch = suffix.match(/^fields\.(\d+)(?:\.(label|placeholder|help))?$/)
  if (fieldMatch) {
    const fieldIndex = Number(fieldMatch[1])
    const field = definition?.fields?.[fieldIndex]
    if (!field) return `content-type-tab-fields`
    const part = fieldMatch[2] || 'label'
    return `field-${safeTypeId}-${domId(field.key)}-${fieldIndex}-${part}`
  }

  return `content-type-tab-${contentTypePanelForPath(value)}`
}

export default function GuidelinesClient() {
  const { data: session } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const accessibleActions = session?.user?.accessibleActions || []
  const canWrite = accessibleActions.includes('write_ai')

  const {
    hydrated,
    refreshing,
    operationLoading,
    error,
    active,
    draft,
    viewMode,
    setViewMode,
    displayDoc,
    versions,
    auditLog,
    autosaveStatus,
    autosaveError,
    createDraftFromActive,
    updateDraft,
    flushAutosave,
    retryAutosave,
    activateDraftVersion,
    discardDraft,
    rollbackVersion,
    retryRefresh,
  } = useGuidelinesDraft({ canWrite })

  const [platformError, setPlatformError] = useState(null)
  const [showDiscardConfirmation, setShowDiscardConfirmation] = useState(false)
  const [pendingRollbackVersion, setPendingRollbackVersion] = useState(null)
  const discardDialogRef = useRef(null)
  const discardCancelRef = useRef(null)
  const discardTriggerRef = useRef(null)
  const rollbackDialogRef = useRef(null)
  const rollbackCancelRef = useRef(null)
  const rollbackTriggerRef = useRef(null)

  const sectionParam = searchParams.get('section')
  const activeSection = GUIDELINES_SECTIONS.includes(sectionParam) ? sectionParam : 'types'
  const selectedTypeId = searchParams.get('type') || undefined
  const requestedPanel = searchParams.get('panel')
  const selectedPanel = CONTENT_TYPE_PANELS.has(requestedPanel) ? requestedPanel : 'information'
  const selectedPlatformId = searchParams.get('platform') || undefined
  const requestedFocusPath = searchParams.get('focus') || ''
  const reviewing = searchParams.get('review') === '1'

  const updateRoute = useCallback(
    (changes, { replace = false } = {}) => {
      const next = new URLSearchParams(searchParams.toString())
      Object.entries(changes).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') next.delete(key)
        else next.set(key, String(value))
      })
      const query = next.toString()
      const target = query ? `${pathname}?${query}` : pathname
      if (replace) router.replace(target, { scroll: false })
      else router.push(target, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  useEffect(() => {
    const requestedView = searchParams.get('view')
    if (requestedView === 'active' || requestedView === 'draft') setViewMode(requestedView)
  }, [draft, searchParams, setViewMode])

  const editable = canWrite && viewMode === 'draft' && Boolean(draft)
  const saving = autosaveStatus === 'saving'
  const actionLoading = operationLoading || saving
  const draftDoc = draft?.document
  const platformEntries = useMemo(() => listPlatformEntries(displayDoc), [displayDoc])
  const publishedIds = useMemo(
    () =>
      active
        ? listContentTypeDefinitions(active, { includeArchived: true }).map(({ id }) => id)
        : [],
    [active]
  )
  const defaultTypeId = useMemo(
    () =>
      displayDoc
        ? listContentTypeDefinitions(displayDoc).find(({ status }) => status !== 'archived')?.id
        : null,
    [displayDoc]
  )
  const activationValidation = useMemo(
    () =>
      draftDoc
        ? validateGuidelineForActivation(draftDoc, { baseDocument: active })
        : { ok: false, errors: [], issues: [] },
    [active, draftDoc]
  )
  const changeSummary = useMemo(
    () =>
      active && draftDoc
        ? summarizeGuidelineDocumentChanges(active, activationValidation.document || draftDoc)
        : null,
    [activationValidation.document, active, draftDoc]
  )

  useEffect(() => {
    if (!hydrated) return
    const changes = {}
    if (!searchParams.get('view')) changes.view = viewMode
    if (activeSection === 'types' && !selectedTypeId && defaultTypeId) {
      changes.type = defaultTypeId
    }
    if (Object.keys(changes).length) updateRoute(changes, { replace: true })
  }, [activeSection, defaultTypeId, hydrated, searchParams, selectedTypeId, updateRoute, viewMode])

  useEffect(() => {
    if (!requestedFocusPath || reviewing) return undefined
    const frame = window.requestAnimationFrame(() => {
      const targetId = focusTargetId(requestedFocusPath, displayDoc, selectedTypeId)
      const target = targetId ? document.getElementById(targetId) : null
      if (!target) return
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
      target.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [displayDoc, requestedFocusPath, reviewing, selectedPanel, selectedTypeId])

  useEffect(() => {
    const dialogKind = showDiscardConfirmation
      ? 'discard'
      : pendingRollbackVersion
        ? 'rollback'
        : null
    if (!dialogKind) return undefined

    const dialogRef = dialogKind === 'discard' ? discardDialogRef : rollbackDialogRef
    const cancelRef = dialogKind === 'discard' ? discardCancelRef : rollbackCancelRef
    const triggerRef = dialogKind === 'discard' ? discardTriggerRef : rollbackTriggerRef
    const closeDialog = () => {
      if (dialogKind === 'discard') setShowDiscardConfirmation(false)
      else setPendingRollbackVersion(null)
    }

    const previousFocus = triggerRef.current || document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => cancelRef.current?.focus())

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeDialog()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) || []
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [pendingRollbackVersion, showDiscardConfirmation])

  const handleSetViewMode = (nextMode) => {
    if (!setViewMode(nextMode)) return
    updateRoute({ view: nextMode, review: null })
  }

  const handleCreateDraft = async (basedOnVersion) => {
    const nextDraft = await createDraftFromActive(basedOnVersion)
    if (!nextDraft) return

    const section = basedOnVersion || activeSection === 'history' ? 'types' : activeSection
    updateRoute({ view: 'draft', section, review: null })
  }

  const handleStartEditingPlatform = async (platformId) => {
    const nextDraft = await createDraftFromActive()
    if (!nextDraft) return

    const draftHasPlatform = Object.prototype.hasOwnProperty.call(
      nextDraft.document?.platforms || {},
      platformId
    )
    updateRoute({
      view: 'draft',
      section: 'platforms',
      platform: draftHasPlatform ? platformId : null,
      review: null,
      focus: null,
    })
  }

  const handleRetrySave = () => retryAutosave().catch(() => {})

  const handleSectionChange = async (nextSection) => {
    if (editable) {
      try {
        await flushAutosave()
      } catch {
        return
      }
    }
    updateRoute({ section: nextSection, review: null })
  }

  const handleSelectType = (id) =>
    updateRoute({ type: id, section: 'types', review: null, focus: null })

  const handleSelectPanel = (panel) =>
    updateRoute({ panel, section: 'types', review: null, focus: null })

  const handleSelectPlatform = (platform) =>
    updateRoute({ platform, section: 'platforms', review: null, focus: null })

  const handleReview = async () => {
    try {
      await flushAutosave()
      updateRoute({ review: '1', view: 'draft' })
    } catch {
      // The sticky status exposes the save error and retry action without losing local changes.
    }
  }

  const handleReviewNavigate = (section, id, issuePath) => {
    let typeId = id
    let panel = null
    let platform = null
    if (!typeId && section === 'types' && issuePath) {
      const match = String(issuePath).match(/^contentTypeCatalog\.(\d+)/)
      const index = match ? Number(match[1]) : -1
      if (index >= 0) typeId = draftDoc?.contentTypeCatalog?.[index]?.id
    }
    if (section === 'types') panel = contentTypePanelForPath(issuePath)
    if (section === 'platforms') platform = id || platformForPath(issuePath)
    updateRoute({
      section,
      type: section === 'types' ? typeId : null,
      panel: section === 'types' ? panel : null,
      platform: section === 'platforms' ? platform : null,
      focus: issuePath || null,
      review: null,
    })
  }

  const handleActivate = async () => {
    const result = await activateDraftVersion()
    if (result) updateRoute({ view: 'active', review: null })
  }

  const handleDiscard = async () => {
    const result = await discardDraft()
    if (result) {
      setShowDiscardConfirmation(false)
      updateRoute({ view: 'active', review: null })
    }
  }

  const handleRequestRollback = (version) => {
    rollbackTriggerRef.current = document.activeElement
    setPendingRollbackVersion(version)
  }

  const handleConfirmRollback = async () => {
    if (!pendingRollbackVersion) return
    const result = await rollbackVersion(pendingRollbackVersion)
    if (result) {
      setPendingRollbackVersion(null)
      updateRoute({ view: 'active', review: null, section: 'history' })
    }
  }

  const handleAddPlatform = (label) => {
    if (!draftDoc) return null
    setPlatformError(null)
    try {
      const next = addPlatform(draftDoc, label)
      const addedId = Object.keys(next.platforms).find((id) => !(id in draftDoc.platforms))
      updateDraft({
        platforms: next.platforms,
        platformLabels: next.platformLabels,
        platformConstraints: next.platformConstraints,
        generation: next.generation,
        contentTypeCatalog: next.contentTypeCatalog,
      })
      if (addedId) handleSelectPlatform(addedId)
      return addedId || null
    } catch (err) {
      setPlatformError(err.message || 'No se pudo añadir esta red.')
      return null
    }
  }

  const handleUpdatePlatformLabel = (platformId, value) => {
    if (!draftDoc) return
    updateDraft({
      platformLabels: { ...(draftDoc.platformLabels || {}), [platformId]: value },
    })
  }

  const handleRemovePlatform = (platformId) => {
    if (!draftDoc) return
    setPlatformError(null)
    try {
      const next = removePlatform(draftDoc, platformId)
      updateDraft({
        platforms: next.platforms,
        platformLabels: next.platformLabels,
        platformConstraints: next.platformConstraints,
        generation: next.generation,
        contentTypeCatalog: next.contentTypeCatalog,
      })
      updateRoute({ platform: null, focus: null }, { replace: true })
    } catch (err) {
      setPlatformError(err.message || 'No se pudo dejar de usar esta red.')
    }
  }

  const handleUpdatePlatformRules = (platformId, value) => {
    if (!draftDoc) return
    updateDraft({
      platforms: { ...draftDoc.platforms, [platformId]: value },
    })
  }

  const handleUpdatePlatformCaptionLimit = (platformId, value) => {
    if (!draftDoc) return
    updateDraft({
      platformConstraints: {
        ...(draftDoc.platformConstraints || {}),
        [platformId]: {
          ...(draftDoc.platformConstraints?.[platformId] || {}),
          captionMaxCharacters: value,
        },
      },
    })
  }

  if (!hydrated) return <GuidelinesSkeleton />

  if (!active || !displayDoc) {
    return (
      <LoadError
        message={error}
        loading={refreshing}
        onRetry={() => retryRefresh().catch(() => {})}
      />
    )
  }

  return (
    <div>
      <header className="mb-5">
        <h2 className="text-2xl font-bold tracking-tight text-gray-950 dark:text-white">
          Configura la generación y validación
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-300">
          Define los tipos de contenido que el asistente puede generar y validar, y las reglas que
          debe seguir.
        </p>
      </header>

      <GuidelinesVersionHeader
        active={active}
        draft={draft}
        viewMode={viewMode}
        autosaveStatus={autosaveStatus}
        canWrite={canWrite}
        loading={actionLoading}
        onCreateDraft={() => handleCreateDraft()}
        onSetViewMode={handleSetViewMode}
        onReview={handleReview}
        onDiscard={() => {
          discardTriggerRef.current = document.activeElement
          setShowDiscardConfirmation(true)
        }}
        onRetrySave={handleRetrySave}
      />

      <GuidelinesPolicyNotice />

      {error && autosaveStatus !== 'error' && autosaveStatus !== 'conflict' && (
        <div
          role="alert"
          className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => retryRefresh().catch(() => {})}
            className="font-semibold underline"
          >
            Intentar de nuevo
          </button>
        </div>
      )}

      {(autosaveStatus === 'error' || autosaveStatus === 'conflict') && autosaveError && (
        <p className="mb-5 text-sm text-red-700 dark:text-red-300" role="alert">
          {autosaveError} Tus cambios siguen en esta pantalla.
        </p>
      )}

      {reviewing && draftDoc ? (
        <GuidelinesActivationReview
          validation={activationValidation}
          summary={changeSummary}
          canWrite={canWrite}
          loading={actionLoading}
          onBack={() => updateRoute({ review: null })}
          onActivate={handleActivate}
          onNavigate={handleReviewNavigate}
        />
      ) : (
        <>
          <GuidelinesWorkspaceNav activeSection={activeSection} onChange={handleSectionChange} />

          {activeSection === 'types' && (
            <GuidelinesContentTypeCatalog
              document={displayDoc}
              onChange={(nextDocument) => updateDraft(() => nextDocument)}
              editable={editable}
              loading={operationLoading}
              publishedIds={publishedIds}
              protectObservationNight
              selectedId={selectedTypeId}
              onSelectedIdChange={handleSelectType}
              panel={selectedPanel}
              onPanelChange={handleSelectPanel}
            />
          )}

          {activeSection === 'general' && (
            <GuidelinesGeneralRules
              document={displayDoc}
              editable={editable}
              onChange={updateDraft}
            />
          )}

          {activeSection === 'platforms' && (
            <GuidelinesPlatforms
              entries={platformEntries}
              document={displayDoc}
              editable={editable}
              canStartEditing={canWrite}
              selectedId={selectedPlatformId}
              onSelectedIdChange={handleSelectPlatform}
              onStartEditing={handleStartEditingPlatform}
              loading={operationLoading}
              draftActionLoading={actionLoading}
              autosaveStatus={autosaveStatus}
              error={platformError}
              onReview={handleReview}
              onRetrySave={handleRetrySave}
              onUpdateLabel={handleUpdatePlatformLabel}
              onUpdateRules={handleUpdatePlatformRules}
              onUpdateCaptionLimit={handleUpdatePlatformCaptionLimit}
              onRemove={handleRemovePlatform}
              onAdd={handleAddPlatform}
            />
          )}

          {activeSection === 'history' && (
            <GuidelinesVersionHistory
              versions={versions}
              events={auditLog}
              canWrite={canWrite}
              hasDraft={Boolean(draft)}
              loading={operationLoading}
              onUseVersion={handleCreateDraft}
              onRollbackVersion={handleRequestRollback}
            />
          )}
        </>
      )}

      {!canWrite && (
        <p className="mt-8 border-t border-gray-200 pt-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          Puedes consultar estas guías, pero necesitas permiso de edición para cambiarlas.
        </p>
      )}

      {showDiscardConfirmation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowDiscardConfirmation(false)
          }}
        >
          <div
            ref={discardDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="discard-guidelines-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-800"
          >
            <h3
              id="discard-guidelines-title"
              className="text-lg font-semibold text-gray-950 dark:text-white"
            >
              ¿Descartar todos los cambios?
            </h3>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
              Volverás a la versión en uso. Esta acción no se puede deshacer.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                ref={discardCancelRef}
                type="button"
                onClick={() => setShowDiscardConfirmation(false)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDiscard}
                disabled={operationLoading}
                className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
              >
                Descartar cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingRollbackVersion && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPendingRollbackVersion(null)
          }}
        >
          <div
            ref={rollbackDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rollback-guidelines-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-800"
          >
            <h3
              id="rollback-guidelines-title"
              className="text-lg font-semibold text-gray-950 dark:text-white"
            >
              ¿Usar la versión {pendingRollbackVersion}?
            </h3>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
              Las nuevas generaciones y validaciones aplicarán estas reglas de inmediato. La versión
              actual seguirá disponible en el historial.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                ref={rollbackCancelRef}
                type="button"
                onClick={() => setPendingRollbackVersion(null)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmRollback}
                disabled={operationLoading}
                className="rounded-lg bg-sac-primary-violet px-3 py-2 text-sm font-semibold text-white hover:bg-sac-primary-violet/90 disabled:opacity-50"
              >
                Usar esta versión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
