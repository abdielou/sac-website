'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GuidelinesContentTypePreview from '@/components/admin/ai/GuidelinesContentTypePreview'
import { listPlatformEntries } from '@/lib/ai-guidelines-draft'
import {
  BACKGROUND_SOURCES,
  FIELD_LIBRARY,
  IMAGE_POLICIES,
  SUPPORTED_TEMPLATE_IDS,
  TITLE_SOURCES,
  VISUAL_MODES,
  createContentType,
  duplicateContentType,
  listContentTypeDefinitions,
  moveContentType,
  normalizeGuidelineDocumentV3,
  setContentTypeStatus,
} from '@/lib/ai-guidelines-schema'

const TITLE_SOURCE_LABELS = {
  type_label: 'El nombre de este tipo',
  event_name: 'El nombre del evento',
  topic: 'El tema de la publicación',
}

const VISUAL_MODE_LABELS = {
  none: 'No usar imagen',
  ai_image: 'Crear una imagen completa',
  template: 'Usar un diseño del SAC',
}

const VISUAL_MODE_HELP = {
  none: 'El formulario se concentra únicamente en el texto.',
  ai_image: 'El asistente puede crear una imagen desde cero para acompañar el contenido.',
  template: 'El contenido usa uno de los diseños visuales aprobados por el SAC.',
}

const TEMPLATE_LABELS = {
  event: 'Diseño para eventos',
  simple: 'Diseño sencillo',
}

const IMAGE_POLICY_LABELS = {
  prohibited: 'No permitir',
  optional: 'Permitir',
  required: 'Pedir siempre',
}

const BACKGROUND_LABELS = {
  stock: 'Usar fondos del SAC',
  ai_generated: 'Permitir fondos creados por IA',
}

const TABS = [
  { id: 'information', label: 'Información' },
  { id: 'fields', label: 'Campos' },
  { id: 'validation', label: 'Al validar' },
  { id: 'generation', label: 'Al generar' },
  { id: 'image', label: 'Imagen' },
]

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-950 shadow-sm outline-none transition focus:border-[#560647] focus:ring-2 focus:ring-[#C8ABDB] disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-[#d7add0] dark:focus:ring-[#560647] dark:disabled:bg-gray-800 dark:disabled:text-gray-500'
const textareaClass = `${inputClass} min-h-[132px] resize-y leading-6`
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-800 dark:text-gray-200'
const hintClass = 'mt-1.5 text-xs leading-5 text-gray-500 dark:text-gray-400'
const quietButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#560647] disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-gray-500 dark:hover:bg-gray-800'
const iconButtonClass =
  'inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#560647] disabled:cursor-not-allowed disabled:opacity-35 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'
const previewFocusableSelector = [
  'a[href]',
  'button:not([disabled]):not([type="submit"])',
  'input:not([disabled]):not([type="hidden"]):not([type="file"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function domId(value) {
  return String(value || 'new').replace(/[^a-zA-Z0-9_-]/g, '-')
}

function fieldFromLibrary(key) {
  const definition = FIELD_LIBRARY[key]
  return {
    key,
    label: definition?.label || key,
    help: '',
    placeholder: '',
    required: false,
  }
}

function suggestedTemplate(fields) {
  const keys = new Set((fields || []).map(({ key }) => key))
  return keys.has('date') && keys.has('location') ? 'event' : 'simple'
}

function policies(value, platformIds = []) {
  return Object.fromEntries(platformIds.map((platform) => [platform, value]))
}

function ImageModeBadge({ mode }) {
  const label =
    mode === 'template' ? 'Diseño SAC' : mode === 'ai_image' ? 'Imagen IA' : 'Solo texto'
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
      <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
        {mode === 'none' ? (
          <path d="M3 4.5h10M3 8h7M3 11.5h8" stroke="currentColor" strokeLinecap="round" />
        ) : (
          <>
            <rect x="2.5" y="3" width="11" height="10" rx="1.5" stroke="currentColor" />
            <path d="m4.5 11 2.3-2.5 1.8 1.7 1.3-1.3 1.6 2.1" stroke="currentColor" />
            <circle cx="10.7" cy="5.9" r="1" fill="currentColor" />
          </>
        )}
      </svg>
      {label}
    </span>
  )
}

function SectionIntroduction({ title, description }) {
  return (
    <div className="border-b border-gray-200 pb-5 dark:border-gray-700">
      <h4 className="text-base font-semibold text-gray-950 dark:text-white">{title}</h4>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">
        {description}
      </p>
    </div>
  )
}

export default function GuidelinesContentTypeCatalog({
  document,
  onChange,
  editable = false,
  loading = false,
  publishedIds = [],
  protectObservationNight = true,
  selectedId: controlledSelectedId,
  onSelectedIdChange,
  panel: controlledPanel,
  initialPanel = 'information',
  onPanelChange,
}) {
  const definitions = useMemo(
    () => listContentTypeDefinitions(document, { includeArchived: true }),
    [document]
  )
  const published = useMemo(() => new Set(publishedIds), [publishedIds])
  const archivedCount = definitions.filter(({ status }) => status === 'archived').length
  const [showArchived, setShowArchived] = useState(false)
  const [internalSelectedId, setInternalSelectedId] = useState(definitions[0]?.id || '')
  const [internalPanel, setInternalPanel] = useState(
    TABS.some(({ id }) => id === initialPanel) ? initialPanel : 'information'
  )
  const [newFieldKey, setNewFieldKey] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewIsDrawer, setPreviewIsDrawer] = useState(true)
  const [mobileEditorOpen, setMobileEditorOpen] = useState(Boolean(controlledSelectedId))
  const previewTriggerRef = useRef(null)
  const previewDialogRef = useRef(null)

  const previewPlatforms = useMemo(
    () => listPlatformEntries(document).map(({ id, label }) => ({ id, label })),
    [document]
  )

  const requestedSelectedId = controlledSelectedId ?? internalSelectedId
  const requestedDefinition = definitions.find(({ id }) => id === requestedSelectedId)
  const visibleDefinitions = showArchived
    ? definitions
    : definitions.filter(({ status }) => status !== 'archived')
  const selected =
    (requestedDefinition && (showArchived || requestedDefinition.status !== 'archived')
      ? requestedDefinition
      : visibleDefinitions[0]) || null
  const activePanel = TABS.some(({ id }) => id === controlledPanel)
    ? controlledPanel
    : internalPanel
  const isProtectedObservation = protectObservationNight && selected?.id === 'observation_night'
  const protectedObservationFields = new Set(['date', 'time', 'location', 'cta', 'sponsor'])
  const disabled = !editable || loading
  const selectedIndex = selected ? definitions.findIndex(({ id }) => id === selected.id) : -1
  const selectedFieldKeys = new Set((selected?.fields || []).map(({ key }) => key))
  const availableFieldKeys = Object.keys(FIELD_LIBRARY).filter(
    (key) => !selectedFieldKeys.has(key) && !(isProtectedObservation && key === 'event_name')
  )
  const fieldToAdd = availableFieldKeys.includes(newFieldKey)
    ? newFieldKey
    : availableFieldKeys[0] || ''

  const selectDefinition = (id, { openOnMobile = true } = {}) => {
    if (controlledSelectedId === undefined) setInternalSelectedId(id)
    onSelectedIdChange?.(id)
    if (openOnMobile) setMobileEditorOpen(true)
  }

  const selectPanel = (id) => {
    if (!TABS.some((tab) => tab.id === id)) return
    if (controlledPanel === undefined) setInternalPanel(id)
    onPanelChange?.(id)
  }

  const closePreview = useCallback(() => {
    setPreviewOpen(false)
    window.requestAnimationFrame(() => previewTriggerRef.current?.focus())
  }, [])

  const togglePreview = () => {
    if (previewOpen) closePreview()
    else setPreviewOpen(true)
  }

  useEffect(() => {
    if (requestedDefinition?.status === 'archived' && controlledSelectedId) {
      setShowArchived(true)
    }
  }, [controlledSelectedId, requestedDefinition?.status])

  useEffect(() => {
    if (!definitions.length) {
      if (controlledSelectedId === undefined) setInternalSelectedId('')
      return
    }
    if (!definitions.some(({ id }) => id === internalSelectedId)) {
      setInternalSelectedId(
        definitions.find(({ status }) => status === 'active')?.id || definitions[0].id
      )
    }
  }, [definitions, internalSelectedId, controlledSelectedId])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const mediaQuery = window.matchMedia('(max-width: 1279px)')
    const syncDrawerMode = () => setPreviewIsDrawer(mediaQuery.matches)

    syncDrawerMode()
    mediaQuery.addEventListener?.('change', syncDrawerMode)
    return () => mediaQuery.removeEventListener?.('change', syncDrawerMode)
  }, [])

  useEffect(() => {
    if (!previewOpen) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') closePreview()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [closePreview, previewOpen])

  useEffect(() => {
    if (!previewOpen || !previewIsDrawer) return undefined

    const previousOverflow = window.document.body.style.overflow
    window.document.body.style.overflow = 'hidden'
    const animationFrame = window.requestAnimationFrame(() => {
      previewDialogRef.current?.querySelector(previewFocusableSelector)?.focus()
    })

    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.document.body.style.overflow = previousOverflow
    }
  }, [previewIsDrawer, previewOpen])

  const handlePreviewKeyDown = (event) => {
    if (!previewIsDrawer || event.key !== 'Tab' || !previewDialogRef.current) return

    const focusableElements = Array.from(
      previewDialogRef.current.querySelectorAll(previewFocusableSelector)
    ).filter((element) => !element.closest('[aria-hidden="true"]'))
    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]
    if (!firstElement || !lastElement) return

    if (event.shiftKey && window.document.activeElement === firstElement) {
      event.preventDefault()
      lastElement.focus()
    } else if (!event.shiftKey && window.document.activeElement === lastElement) {
      event.preventDefault()
      firstElement.focus()
    }
  }

  const emit = (nextDocument) => {
    onChange?.(normalizeGuidelineDocumentV3(nextDocument))
  }

  const replaceDefinition = (currentId, nextDefinition) => {
    if (!document) return
    emit({
      ...document,
      contentTypeCatalog: (document.contentTypeCatalog || []).map((entry) =>
        entry.id === currentId ? nextDefinition : entry
      ),
    })
  }

  const updateSelected = (updater) => {
    if (!selected) return
    replaceDefinition(selected.id, updater(selected))
  }

  const updateField = (index, patch) => {
    updateSelected((entry) => ({
      ...entry,
      fields: (entry.fields || []).map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field
      ),
    }))
  }

  const moveField = (index, offset) => {
    updateSelected((entry) => {
      const fields = [...(entry.fields || [])]
      const target = Math.max(0, Math.min(fields.length - 1, index + offset))
      if (target === index) return entry
      const [field] = fields.splice(index, 1)
      fields.splice(target, 0, field)
      return { ...entry, fields }
    })
  }

  const removeField = (index) => {
    updateSelected((entry) => {
      const currentFields = entry.fields || []
      const removed = currentFields[index]
      const fields = currentFields.filter((_, fieldIndex) => fieldIndex !== index)
      const next = {
        ...entry,
        fields,
        titleSource: entry.titleSource === removed?.key ? 'type_label' : entry.titleSource,
      }
      if (removed?.key === 'sponsor') {
        next.visual = { ...entry.visual, sponsorAllowed: false }
      }
      return next
    })
  }

  const addField = () => {
    if (!fieldToAdd) return
    updateSelected((entry) => ({
      ...entry,
      fields: [...(entry.fields || []), fieldFromLibrary(fieldToAdd)],
    }))
    setNewFieldKey('')
  }

  const createNewType = () => {
    if (!document) return
    const previousIds = new Set(definitions.map(({ id }) => id))
    const next = createContentType(document, { label: 'Nuevo tipo' })
    const created = next.contentTypeCatalog.find(({ id }) => !previousIds.has(id))
    emit(next)
    if (created) {
      selectDefinition(created.id)
      selectPanel('information')
    }
  }

  const duplicateSelected = () => {
    if (!selected || !document) return
    const previousIds = new Set(definitions.map(({ id }) => id))
    const next = duplicateContentType(document, selected.id)
    const created = next.contentTypeCatalog.find(({ id }) => !previousIds.has(id))
    emit(next)
    if (created) {
      selectDefinition(created.id)
      selectPanel('information')
    }
  }

  const moveSelected = (direction) => {
    if (!selected || !document) return
    emit(moveContentType(document, selected.id, direction))
  }

  const changeStatus = (status) => {
    if (!selected || !document) return
    const currentId = selected.id
    emit(setContentTypeStatus(document, currentId, status))
    if (status === 'archived' && !showArchived) {
      const nextVisible = definitions.find(
        ({ id, status: entryStatus }) => id !== currentId && entryStatus === 'active'
      )
      if (nextVisible) selectDefinition(nextVisible.id, { openOnMobile: false })
      else setMobileEditorOpen(false)
    }
  }

  const changeId = (nextId) => {
    if (!selected || published.has(selected.id)) return
    const previousId = selected.id
    replaceDefinition(previousId, { ...selected, id: nextId })
    selectDefinition(nextId, { openOnMobile: false })
  }

  const changeVisualMode = (mode) => {
    const platformIds = previewPlatforms.map(({ id }) => id)
    updateSelected((entry) => {
      const visual = entry.visual || {}
      if (mode === 'none') {
        return {
          ...entry,
          fields: (entry.fields || []).filter(({ key }) => key !== 'sponsor'),
          visual: {
            ...visual,
            mode,
            template: null,
            backgroundSources: [],
            sponsorAllowed: false,
            imagePolicyByPlatform: policies('prohibited', platformIds),
          },
        }
      }
      if (mode === 'ai_image') {
        return {
          ...entry,
          fields: (entry.fields || []).filter(({ key }) => key !== 'sponsor'),
          visual: {
            ...visual,
            mode,
            template: null,
            backgroundSources: [],
            sponsorAllowed: false,
            imagePolicyByPlatform:
              visual.mode === 'none'
                ? policies('optional', platformIds)
                : { ...visual.imagePolicyByPlatform },
          },
        }
      }
      return {
        ...entry,
        visual: {
          ...visual,
          mode: 'template',
          template: SUPPORTED_TEMPLATE_IDS.includes(visual.template)
            ? visual.template
            : suggestedTemplate(entry.fields || []),
          backgroundSources: visual.backgroundSources?.length
            ? [...visual.backgroundSources]
            : ['stock'],
          sponsorAllowed: visual.sponsorAllowed === true,
          imagePolicyByPlatform:
            visual.mode === 'none'
              ? policies('optional', platformIds)
              : { ...visual.imagePolicyByPlatform },
        },
      }
    })
  }

  const changeTemplate = (template) => {
    updateSelected((entry) => {
      const allowSponsor = template === 'event' && entry.visual?.sponsorAllowed === true
      return {
        ...entry,
        fields: allowSponsor
          ? entry.fields || []
          : (entry.fields || []).filter(({ key }) => key !== 'sponsor'),
        visual: {
          ...entry.visual,
          template,
          sponsorAllowed: allowSponsor,
        },
      }
    })
  }

  const toggleBackground = (source) => {
    updateSelected((entry) => {
      const current = entry.visual?.backgroundSources || []
      const backgroundSources = current.includes(source)
        ? current.filter((value) => value !== source)
        : [...current, source]
      return { ...entry, visual: { ...entry.visual, backgroundSources } }
    })
  }

  const toggleSponsor = (allowed) => {
    updateSelected((entry) => {
      const fields = entry.fields || []
      const hasSponsor = fields.some(({ key }) => key === 'sponsor')
      return {
        ...entry,
        fields: allowed
          ? hasSponsor
            ? fields
            : [...fields, fieldFromLibrary('sponsor')]
          : fields.filter(({ key }) => key !== 'sponsor'),
        visual: { ...entry.visual, sponsorAllowed: allowed },
      }
    })
  }

  const handleTabKeyDown = (event, tabId) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const currentIndex = TABS.findIndex(({ id }) => id === tabId)
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? TABS.length - 1
          : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length
    const next = TABS[nextIndex]
    selectPanel(next.id)
    window.requestAnimationFrame(() => {
      window.document.getElementById(`content-type-tab-${next.id}`)?.focus()
    })
  }

  const gridColumns = previewOpen
    ? 'md:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_320px]'
    : 'md:grid-cols-[240px_minmax(0,1fr)]'

  return (
    <section
      className="overflow-hidden border-y border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
      aria-labelledby="content-type-catalog-heading"
    >
      <header className="flex flex-col gap-4 border-b border-gray-200 px-4 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6 dark:border-gray-700">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#560647] dark:text-[#e5b9dc]">
            Principal
          </p>
          <h3
            id="content-type-catalog-heading"
            className="mt-1 text-lg font-semibold tracking-tight text-gray-950 dark:text-white"
          >
            Tipos de contenido
          </h3>
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
            Decide qué información pide el asistente y cómo debe trabajar con cada clase de
            publicación.
          </p>
        </div>
        {editable && (
          <button
            type="button"
            onClick={createNewType}
            disabled={loading || !document}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#560647] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#6d0b5b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#560647] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#c78bbb] dark:text-gray-950 dark:hover:bg-[#d7add0] dark:focus-visible:ring-[#d7add0] dark:focus-visible:ring-offset-gray-900"
          >
            <span aria-hidden="true">＋</span>
            Crear tipo
          </button>
        )}
      </header>

      <div className={`grid min-h-[640px] grid-cols-1 items-start ${gridColumns}`}>
        <aside
          className={`${mobileEditorOpen ? 'hidden md:block' : 'block'} h-full border-r border-gray-200 bg-gray-50/70 dark:border-gray-700 dark:bg-gray-950/30`}
          aria-label="Tipos de contenido"
        >
          <div className="sticky top-20">
            <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-3 dark:border-gray-700">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                {visibleDefinitions.length}{' '}
                {visibleDefinitions.length === 1 ? 'tipo visible' : 'tipos visibles'}
              </p>
              {archivedCount > 0 && (
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(event) => setShowArchived(event.target.checked)}
                    className="rounded border-gray-300 text-[#560647] focus:ring-[#560647] dark:border-gray-600"
                  />
                  Ver archivados
                </label>
              )}
            </div>

            {visibleDefinitions.length ? (
              <ol className="divide-y divide-gray-200 dark:divide-gray-800">
                {visibleDefinitions.map((entry, index) => {
                  const active = entry.id === selected?.id
                  return (
                    <li key={`${entry.id}-${index}`}>
                      <button
                        type="button"
                        onClick={() => selectDefinition(entry.id)}
                        aria-current={active ? 'true' : undefined}
                        className={`group relative w-full px-4 py-3.5 text-left transition focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#560647] ${
                          active
                            ? 'bg-[#560647]/[0.07] dark:bg-[#c78bbb]/10'
                            : 'hover:bg-white dark:hover:bg-gray-800/70'
                        } ${entry.status === 'archived' ? 'opacity-65' : ''}`}
                      >
                        {active && (
                          <span
                            className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-[#560647] dark:bg-[#c78bbb]"
                            aria-hidden="true"
                          />
                        )}
                        <span className="flex items-start justify-between gap-2">
                          <span
                            className={`min-w-0 truncate text-sm font-semibold ${
                              active
                                ? 'text-[#560647] dark:text-[#e5b9dc]'
                                : 'text-gray-900 dark:text-gray-100'
                            }`}
                          >
                            {entry.label || 'Sin nombre'}
                          </span>
                          {entry.status === 'archived' && (
                            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                              Archivado
                            </span>
                          )}
                        </span>
                        <span className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-[11px] text-gray-500 dark:text-gray-400">
                            {(entry.fields || []).length}{' '}
                            {(entry.fields || []).length === 1 ? 'campo' : 'campos'}
                          </span>
                          <ImageModeBadge mode={entry.visual?.mode} />
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  No hay tipos visibles
                </p>
                <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                  {archivedCount
                    ? 'Activa “Ver archivados” para encontrar los tipos guardados.'
                    : 'Crea el primer tipo para comenzar.'}
                </p>
              </div>
            )}
          </div>
        </aside>

        <div className={`${mobileEditorOpen ? 'block' : 'hidden md:block'} min-w-0`}>
          {selected ? (
            <>
              <div className="border-b border-gray-200 bg-white px-4 py-4 sm:px-6 dark:border-gray-700 dark:bg-gray-900">
                <button
                  type="button"
                  onClick={() => setMobileEditorOpen(false)}
                  className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-[#560647] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#560647] md:hidden dark:text-[#e5b9dc]"
                >
                  <span aria-hidden="true">←</span> Volver a tipos
                </button>

                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="truncate text-xl font-semibold tracking-tight text-gray-950 dark:text-white">
                        {selected.label || 'Sin nombre'}
                      </h4>
                      {selected.status === 'archived' && (
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                          Archivado
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {(selected.fields || []).length}{' '}
                      {(selected.fields || []).length === 1
                        ? 'dato en el formulario'
                        : 'datos en el formulario'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => moveSelected('up')}
                      disabled={disabled || selectedIndex <= 0}
                      className={iconButtonClass}
                      aria-label={`Mover ${selected.label || selected.id} hacia arriba`}
                      title="Subir en la lista"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSelected('down')}
                      disabled={
                        disabled || selectedIndex < 0 || selectedIndex >= definitions.length - 1
                      }
                      className={iconButtonClass}
                      aria-label={`Mover ${selected.label || selected.id} hacia abajo`}
                      title="Bajar en la lista"
                    >
                      ↓
                    </button>
                    <button
                      ref={previewTriggerRef}
                      type="button"
                      onClick={togglePreview}
                      aria-expanded={previewOpen}
                      aria-controls="content-type-preview"
                      className={quietButtonClass}
                    >
                      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                        <path
                          d="M2.5 10s2.7-5 7.5-5 7.5 5 7.5 5-2.7 5-7.5 5-7.5-5-7.5-5Z"
                          stroke="currentColor"
                        />
                        <circle cx="10" cy="10" r="2" stroke="currentColor" />
                      </svg>
                      {previewOpen ? 'Ocultar vista' : 'Ver formulario'}
                    </button>
                    {editable && (
                      <details className="group relative">
                        <summary className={`${quietButtonClass} cursor-pointer list-none`}>
                          Más <span aria-hidden="true">⌄</span>
                        </summary>
                        <div className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-900">
                          <button
                            type="button"
                            onClick={duplicateSelected}
                            disabled={disabled}
                            className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            Duplicar como tipo nuevo
                          </button>
                          {selected.status === 'archived' ? (
                            <button
                              type="button"
                              onClick={() => changeStatus('active')}
                              disabled={disabled}
                              className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                              Restaurar tipo
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => changeStatus('archived')}
                              disabled={disabled || isProtectedObservation}
                              aria-describedby={
                                isProtectedObservation ? 'observation-night-protection' : undefined
                              }
                              className="w-full px-4 py-2.5 text-left text-sm text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-300 dark:hover:bg-red-950/30"
                            >
                              Archivar tipo
                            </button>
                          )}
                        </div>
                      </details>
                    )}
                  </div>
                </div>

                <div
                  className="mt-4 flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-700"
                  role="tablist"
                  aria-label={`Editar ${selected.label || 'tipo de contenido'}`}
                >
                  {TABS.map((tab) => (
                    <button
                      key={tab.id}
                      id={`content-type-tab-${tab.id}`}
                      type="button"
                      role="tab"
                      aria-selected={activePanel === tab.id}
                      aria-controls={`content-type-panel-${tab.id}`}
                      tabIndex={activePanel === tab.id ? 0 : -1}
                      onClick={() => selectPanel(tab.id)}
                      onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
                      className={`relative shrink-0 px-3 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#560647] ${
                        activePanel === tab.id
                          ? 'text-[#560647] dark:text-[#e5b9dc]'
                          : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                      }`}
                    >
                      {tab.label}
                      {activePanel === tab.id && (
                        <span
                          className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#560647] dark:bg-[#c78bbb]"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div
                id={`content-type-panel-${activePanel}`}
                role="tabpanel"
                aria-labelledby={`content-type-tab-${activePanel}`}
                tabIndex={0}
                className="mx-auto max-w-3xl px-4 py-6 focus-visible:outline-none sm:px-6 sm:py-8"
              >
                {isProtectedObservation && selected.status !== 'archived' && (
                  <p
                    id="observation-night-protection"
                    className="mb-6 border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-500 dark:bg-amber-950/30 dark:text-amber-200"
                  >
                    <strong>Noche de Observación es un tipo esencial.</strong> Su nombre, datos
                    principales y diseño están protegidos para que el asistente siempre lo reconozca
                    correctamente.
                  </p>
                )}

                {activePanel === 'information' && (
                  <fieldset disabled={disabled} className="space-y-6">
                    <SectionIntroduction
                      title="Cuándo usar este tipo"
                      description="Ponle un nombre claro para el equipo y explica qué clase de publicación representa."
                    />
                    <div>
                      <label
                        htmlFor={`content-type-${domId(selected.id)}-label`}
                        className={labelClass}
                      >
                        Nombre para el equipo
                      </label>
                      <input
                        id={`content-type-${domId(selected.id)}-label`}
                        type="text"
                        value={selected.label || ''}
                        onChange={(event) =>
                          updateSelected((entry) => ({ ...entry, label: event.target.value }))
                        }
                        disabled={disabled || isProtectedObservation}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`content-type-${domId(selected.id)}-description`}
                        className={labelClass}
                      >
                        ¿Para qué publicaciones se usa?
                      </label>
                      <textarea
                        id={`content-type-${domId(selected.id)}-description`}
                        value={selected.description || ''}
                        onChange={(event) =>
                          updateSelected((entry) => ({
                            ...entry,
                            description: event.target.value,
                          }))
                        }
                        placeholder="Explica en pocas palabras cuándo debe elegirse este tipo."
                        className={textareaClass}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`content-type-${domId(selected.id)}-title-source`}
                        className={labelClass}
                      >
                        Qué se usa como título
                      </label>
                      <select
                        id={`content-type-${domId(selected.id)}-title-source`}
                        value={selected.titleSource || 'type_label'}
                        onChange={(event) =>
                          updateSelected((entry) => ({
                            ...entry,
                            titleSource: event.target.value,
                          }))
                        }
                        disabled={disabled || isProtectedObservation}
                        className={inputClass}
                      >
                        {TITLE_SOURCES.map((source) => (
                          <option
                            key={source}
                            value={source}
                            disabled={
                              source !== 'type_label' &&
                              !(selected.fields || []).some(({ key }) => key === source)
                            }
                          >
                            {TITLE_SOURCE_LABELS[source] || source}
                          </option>
                        ))}
                      </select>
                      <p className={hintClass}>
                        Las opciones dependen de los datos incluidos en el formulario.
                      </p>
                    </div>

                    <details className="border-t border-gray-200 pt-5 dark:border-gray-700">
                      <summary className="cursor-pointer text-sm font-semibold text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#560647] dark:text-gray-300">
                        Opciones avanzadas
                      </summary>
                      <div className="mt-4">
                        <label
                          htmlFor={`content-type-${domId(selected.id)}-id`}
                          className={labelClass}
                        >
                          Identificador interno
                        </label>
                        <input
                          id={`content-type-${domId(selected.id)}-id`}
                          type="text"
                          value={selected.id}
                          onChange={(event) => changeId(event.target.value)}
                          disabled={disabled || published.has(selected.id)}
                          pattern="[a-z][a-z0-9_]{1,63}"
                          className={`${inputClass} font-mono text-xs`}
                        />
                        <p className={hintClass}>
                          {published.has(selected.id)
                            ? 'Ya está en uso y no se puede cambiar.'
                            : 'Solo minúsculas, números y guion bajo. Se bloquea al activar.'}
                        </p>
                      </div>
                    </details>
                  </fieldset>
                )}

                {activePanel === 'fields' && (
                  <fieldset disabled={disabled} className="space-y-6">
                    <SectionIntroduction
                      title="Datos que pedirá el formulario"
                      description="El orden aquí será el mismo que verá la persona al validar o generar contenido."
                    />

                    <div className="flex flex-col gap-2 border-b border-gray-200 pb-6 sm:flex-row dark:border-gray-700">
                      <label htmlFor={`field-${domId(selected.id)}-add`} className="sr-only">
                        Dato para añadir
                      </label>
                      <select
                        id={`field-${domId(selected.id)}-add`}
                        value={fieldToAdd}
                        onChange={(event) => setNewFieldKey(event.target.value)}
                        disabled={disabled || !availableFieldKeys.length}
                        className={inputClass}
                      >
                        {availableFieldKeys.length ? (
                          availableFieldKeys.map((key) => (
                            <option key={key} value={key}>
                              {FIELD_LIBRARY[key].label}
                            </option>
                          ))
                        ) : (
                          <option value="">Ya añadiste todos los datos disponibles</option>
                        )}
                      </select>
                      <button
                        type="button"
                        onClick={addField}
                        disabled={disabled || !fieldToAdd}
                        className={quietButtonClass}
                      >
                        Añadir dato
                      </button>
                    </div>

                    {(selected.fields || []).length ? (
                      <ol className="divide-y divide-gray-200 dark:divide-gray-700">
                        {(selected.fields || []).map((field, index) => {
                          const protectedField =
                            isProtectedObservation && protectedObservationFields.has(field.key)
                          return (
                            <li key={`${field.key}-${index}`} className="py-6 first:pt-0">
                              <div className="mb-4 flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-gray-950 dark:text-white">
                                    {field.label || FIELD_LIBRARY[field.key]?.label || 'Sin nombre'}
                                  </p>
                                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                    Dato {index + 1} de {(selected.fields || []).length}
                                    {protectedField ? ' · Protegido' : ''}
                                  </p>
                                </div>
                                <div className="flex items-center">
                                  <button
                                    type="button"
                                    onClick={() => moveField(index, -1)}
                                    disabled={disabled || index === 0}
                                    className={iconButtonClass}
                                    aria-label={`Mover ${field.label || field.key} hacia arriba`}
                                  >
                                    ↑
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moveField(index, 1)}
                                    disabled={
                                      disabled || index === (selected.fields || []).length - 1
                                    }
                                    className={iconButtonClass}
                                    aria-label={`Mover ${field.label || field.key} hacia abajo`}
                                  >
                                    ↓
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeField(index)}
                                    disabled={disabled || protectedField}
                                    className="rounded-lg px-2 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:cursor-not-allowed disabled:opacity-35 dark:text-red-300 dark:hover:bg-red-950/30"
                                  >
                                    Quitar
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                  <label
                                    htmlFor={`field-${domId(selected.id)}-${domId(field.key)}-${index}-label`}
                                    className={labelClass}
                                  >
                                    Nombre del dato
                                  </label>
                                  <input
                                    id={`field-${domId(selected.id)}-${domId(field.key)}-${index}-label`}
                                    type="text"
                                    value={field.label || ''}
                                    onChange={(event) =>
                                      updateField(index, { label: event.target.value })
                                    }
                                    className={inputClass}
                                  />
                                </div>
                                <div>
                                  <label
                                    htmlFor={`field-${domId(selected.id)}-${domId(field.key)}-${index}-placeholder`}
                                    className={labelClass}
                                  >
                                    Ejemplo dentro del campo
                                  </label>
                                  <input
                                    id={`field-${domId(selected.id)}-${domId(field.key)}-${index}-placeholder`}
                                    type="text"
                                    value={field.placeholder || ''}
                                    onChange={(event) =>
                                      updateField(index, { placeholder: event.target.value })
                                    }
                                    className={inputClass}
                                  />
                                </div>
                                <div className="sm:col-span-2">
                                  <label
                                    htmlFor={`field-${domId(selected.id)}-${domId(field.key)}-${index}-help`}
                                    className={labelClass}
                                  >
                                    Ayuda para completarlo
                                  </label>
                                  <input
                                    id={`field-${domId(selected.id)}-${domId(field.key)}-${index}-help`}
                                    type="text"
                                    value={field.help || ''}
                                    onChange={(event) =>
                                      updateField(index, { help: event.target.value })
                                    }
                                    className={inputClass}
                                  />
                                </div>
                              </div>

                              <label className="mt-4 inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                                <input
                                  type="checkbox"
                                  checked={field.required === true}
                                  onChange={(event) =>
                                    updateField(index, { required: event.target.checked })
                                  }
                                  disabled={disabled || protectedField}
                                  className="rounded border-gray-300 text-[#560647] focus:ring-[#560647] dark:border-gray-600"
                                />
                                Pedir este dato siempre
                              </label>

                              <details className="mt-4">
                                <summary className="cursor-pointer text-xs font-medium text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#560647] dark:text-gray-400">
                                  Información técnica
                                </summary>
                                <dl className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-gray-50 px-3 py-2 text-xs dark:bg-gray-800/60">
                                  <div>
                                    <dt className="text-gray-500 dark:text-gray-400">Campo</dt>
                                    <dd className="mt-0.5 font-mono text-gray-800 dark:text-gray-200">
                                      {field.key}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="text-gray-500 dark:text-gray-400">Formato</dt>
                                    <dd className="mt-0.5 font-mono text-gray-800 dark:text-gray-200">
                                      {FIELD_LIBRARY[field.key]?.inputType || 'desconocido'}
                                    </dd>
                                  </div>
                                </dl>
                              </details>
                            </li>
                          )
                        })}
                      </ol>
                    ) : (
                      <p className="border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
                        Añade el primer dato que el equipo deberá completar.
                      </p>
                    )}
                  </fieldset>
                )}

                {activePanel === 'validation' && (
                  <fieldset disabled={disabled} className="space-y-6">
                    <SectionIntroduction
                      title="Qué debe revisar el asistente"
                      description="Escribe criterios específicos para este tipo. Las reglas generales y las de cada red social también se aplicarán."
                    />
                    <div>
                      <label
                        htmlFor={`content-type-${domId(selected.id)}-validation-rules`}
                        className={labelClass}
                      >
                        Indicaciones para validar
                      </label>
                      <textarea
                        id={`content-type-${domId(selected.id)}-validation-rules`}
                        value={selected.validation?.rules || ''}
                        onChange={(event) =>
                          updateSelected((entry) => ({
                            ...entry,
                            validation: { ...entry.validation, rules: event.target.value },
                          }))
                        }
                        placeholder="Por ejemplo: comprueba que la fecha, hora y lugar coincidan con la información oficial."
                        className={`${textareaClass} min-h-[260px]`}
                      />
                      <p className={hintClass}>
                        Describe resultados observables. Evita instrucciones sobre cómo funciona el
                        sistema por dentro.
                      </p>
                    </div>
                  </fieldset>
                )}

                {activePanel === 'generation' && (
                  <fieldset disabled={disabled} className="space-y-6">
                    <SectionIntroduction
                      title="Qué debe crear el asistente"
                      description="Indica qué hace que una publicación de este tipo esté completa y sea útil para la audiencia."
                    />
                    <div>
                      <label
                        htmlFor={`content-type-${domId(selected.id)}-generation-rules`}
                        className={labelClass}
                      >
                        Indicaciones para generar
                      </label>
                      <textarea
                        id={`content-type-${domId(selected.id)}-generation-rules`}
                        value={selected.generation?.rules || ''}
                        onChange={(event) =>
                          updateSelected((entry) => ({
                            ...entry,
                            generation: { ...entry.generation, rules: event.target.value },
                          }))
                        }
                        placeholder="Por ejemplo: prepara una invitación clara que destaque la fecha, hora, lugar y qué debe llevar la persona."
                        className={`${textareaClass} min-h-[260px]`}
                      />
                      <p className={hintClass}>
                        Las indicaciones deben complementar la voz del SAC, no repetirla.
                      </p>
                    </div>
                  </fieldset>
                )}

                {activePanel === 'image' && (
                  <fieldset disabled={disabled} className="space-y-6">
                    <SectionIntroduction
                      title="Cómo se trabaja la imagen"
                      description="Decide si este contenido lleva imagen, de dónde puede salir y qué exige cada red social."
                    />
                    <div>
                      <label
                        htmlFor={`content-type-${domId(selected.id)}-visual-mode`}
                        className={labelClass}
                      >
                        Forma de crear la publicación
                      </label>
                      <select
                        id={`content-type-${domId(selected.id)}-visual-mode`}
                        value={selected.visual?.mode || 'none'}
                        onChange={(event) => changeVisualMode(event.target.value)}
                        disabled={disabled || isProtectedObservation}
                        className={inputClass}
                      >
                        {VISUAL_MODES.map((mode) => (
                          <option key={mode} value={mode}>
                            {VISUAL_MODE_LABELS[mode] || mode}
                          </option>
                        ))}
                      </select>
                      <p className={hintClass}>
                        {VISUAL_MODE_HELP[selected.visual?.mode || 'none']}
                      </p>
                    </div>

                    {selected.visual?.mode === 'template' && (
                      <>
                        <div>
                          <label
                            htmlFor={`content-type-${domId(selected.id)}-template`}
                            className={labelClass}
                          >
                            Diseño del SAC
                          </label>
                          <select
                            id={`content-type-${domId(selected.id)}-template`}
                            value={selected.visual?.template || SUPPORTED_TEMPLATE_IDS[0]}
                            onChange={(event) => changeTemplate(event.target.value)}
                            disabled={disabled || isProtectedObservation}
                            className={inputClass}
                          >
                            {SUPPORTED_TEMPLATE_IDS.map((template) => (
                              <option key={template} value={template}>
                                {TEMPLATE_LABELS[template] || template}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <p className={labelClass}>Fondos permitidos</p>
                          <div className="space-y-3">
                            {BACKGROUND_SOURCES.map((source) => (
                              <label
                                key={source}
                                className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-200"
                              >
                                <input
                                  type="checkbox"
                                  checked={
                                    selected.visual?.backgroundSources?.includes(source) || false
                                  }
                                  onChange={() => toggleBackground(source)}
                                  className="mt-0.5 rounded border-gray-300 text-[#560647] focus:ring-[#560647] dark:border-gray-600"
                                />
                                <span>{BACKGROUND_LABELS[source] || source}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <label className="flex items-start gap-3 border-y border-gray-200 py-4 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-200">
                          <input
                            type="checkbox"
                            checked={selected.visual?.sponsorAllowed === true}
                            onChange={(event) => toggleSponsor(event.target.checked)}
                            disabled={
                              disabled ||
                              isProtectedObservation ||
                              selected.visual?.template !== 'event'
                            }
                            className="mt-0.5 rounded border-gray-300 text-[#560647] focus:ring-[#560647] dark:border-gray-600"
                          />
                          <span>
                            <span className="block font-medium">Permitir auspiciador</span>
                            <span className="mt-0.5 block text-xs leading-5 text-gray-500 dark:text-gray-400">
                              Añade al formulario la opción de subir el logo de un auspiciador.
                            </span>
                          </span>
                        </label>
                      </>
                    )}

                    <div>
                      <p className={labelClass}>Qué pide cada red social</p>
                      <div className="divide-y divide-gray-200 border-y border-gray-200 dark:divide-gray-700 dark:border-gray-700">
                        {previewPlatforms.map(({ id: platform, label }) => (
                          <div
                            key={platform}
                            className="grid grid-cols-[minmax(0,1fr)_minmax(130px,180px)] items-center gap-4 py-3"
                          >
                            <label
                              htmlFor={`content-type-${domId(selected.id)}-policy-${platform}`}
                              className="text-sm font-medium text-gray-800 dark:text-gray-200"
                            >
                              {label}
                            </label>
                            <select
                              id={`content-type-${domId(selected.id)}-policy-${platform}`}
                              value={
                                selected.visual?.imagePolicyByPlatform?.[platform] || 'prohibited'
                              }
                              onChange={(event) =>
                                updateSelected((entry) => ({
                                  ...entry,
                                  visual: {
                                    ...entry.visual,
                                    imagePolicyByPlatform: {
                                      ...entry.visual.imagePolicyByPlatform,
                                      [platform]: event.target.value,
                                    },
                                  },
                                }))
                              }
                              disabled={disabled || selected.visual?.mode === 'none'}
                              className={inputClass}
                            >
                              {IMAGE_POLICIES.map((policy) => (
                                <option key={policy} value={policy}>
                                  {IMAGE_POLICY_LABELS[policy] || policy}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>

                    <details className="border-t border-gray-200 pt-5 dark:border-gray-700">
                      <summary className="cursor-pointer text-sm font-semibold text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#560647] dark:text-gray-300">
                        Opciones avanzadas
                      </summary>
                      <dl className="mt-4 grid grid-cols-1 gap-3 rounded-lg bg-gray-50 p-4 text-xs sm:grid-cols-2 dark:bg-gray-800/60">
                        <div>
                          <dt className="text-gray-500 dark:text-gray-400">Modo interno</dt>
                          <dd className="mt-1 font-mono text-gray-800 dark:text-gray-200">
                            {selected.visual?.mode || 'none'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-gray-500 dark:text-gray-400">Plantilla interna</dt>
                          <dd className="mt-1 font-mono text-gray-800 dark:text-gray-200">
                            {selected.visual?.template || 'ninguna'}
                          </dd>
                        </div>
                      </dl>
                    </details>
                  </fieldset>
                )}
              </div>
            </>
          ) : (
            <div className="px-6 py-16 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Crea un tipo para comenzar a definir el formulario.
              </p>
            </div>
          )}
        </div>

        {previewOpen && selected && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 bg-gray-950/40 backdrop-blur-[1px] xl:hidden"
              onClick={closePreview}
              tabIndex={-1}
              aria-hidden="true"
            />
            <aside
              id="content-type-preview"
              ref={previewDialogRef}
              role={previewIsDrawer ? 'dialog' : undefined}
              aria-modal={previewIsDrawer ? 'true' : undefined}
              aria-labelledby={previewIsDrawer ? 'content-type-preview-heading' : undefined}
              onKeyDown={handlePreviewKeyDown}
              className="fixed inset-y-0 right-0 z-50 w-full max-w-[560px] border-l border-gray-200 bg-white shadow-2xl sm:w-[min(560px,90vw)] xl:sticky xl:top-20 xl:z-10 xl:h-[calc(100vh-6rem)] xl:w-auto xl:max-w-none xl:self-start xl:shadow-none dark:border-gray-700 dark:bg-gray-900"
            >
              <GuidelinesContentTypePreview
                definition={selected}
                platforms={previewPlatforms}
                onClose={closePreview}
                drawer={previewIsDrawer}
              />
            </aside>
          </>
        )}
      </div>
    </section>
  )
}
