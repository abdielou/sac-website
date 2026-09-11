'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GuidelinesContentTypePreview from '@/components/admin/ai/GuidelinesContentTypePreview'
import GuidelinesTemplatePreview from '@/components/admin/ai/GuidelinesTemplatePreview'
import { listPlatformEntries } from '@/lib/ai-guidelines-draft'
import {
  BACKGROUND_SOURCES,
  FIELD_LIBRARY,
  IMAGE_POLICIES,
  SUPPORTED_TEMPLATE_IDS,
  TITLE_SOURCES,
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

const TEMPLATE_LABELS = {
  event: 'Diseño para eventos',
  simple: 'Diseño sencillo',
}

const IMAGE_REQUIREMENT_LABELS = {
  prohibited: 'No lleva imagen',
  optional: 'La imagen es opcional',
  required: 'La imagen es obligatoria',
}

const BACKGROUND_LABELS = {
  stock: 'Usar fondos del SAC',
  ai_generated: 'Permitir fondos creados por IA',
}

const VISUAL_INPUT_KEYS = new Set(['image_style', 'image_constraints', 'sponsor'])

const TABS = [
  { id: 'information', label: 'Información' },
  { id: 'fields', label: 'Campos' },
  { id: 'assistant', label: 'Asistente' },
]

const ASSISTANT_MODES = [
  { id: 'validation', label: 'Validar' },
  { id: 'generation', label: 'Generar' },
]

function mainPanelFor(panel) {
  return ['validation', 'generation', 'assistant'].includes(panel) ? 'assistant' : panel
}

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

function contentFieldCount(definition) {
  return (definition?.fields || []).filter(({ key }) => !VISUAL_INPUT_KEYS.has(key)).length
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
  const archivedCount = definitions.filter(({ status }) => status === 'archived').length
  const activeCount = definitions.filter(({ status }) => status === 'active').length
  const [showArchived, setShowArchived] = useState(false)
  const [internalSelectedId, setInternalSelectedId] = useState(definitions[0]?.id || '')
  const [internalPanel, setInternalPanel] = useState(
    TABS.some(({ id }) => id === mainPanelFor(initialPanel))
      ? mainPanelFor(initialPanel)
      : 'information'
  )
  const [internalAssistantMode, setInternalAssistantMode] = useState(
    initialPanel === 'generation' ? 'generation' : 'validation'
  )
  const [newFieldKey, setNewFieldKey] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewIsDrawer, setPreviewIsDrawer] = useState(true)
  const [mobileEditorOpen, setMobileEditorOpen] = useState(Boolean(controlledSelectedId))
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newTypeName, setNewTypeName] = useState('')
  const [archiveConfirmationId, setArchiveConfirmationId] = useState(null)
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
  const controlledMainPanel = mainPanelFor(controlledPanel)
  const activePanel = TABS.some(({ id }) => id === controlledMainPanel)
    ? controlledMainPanel
    : internalPanel
  const assistantMode = ['validation', 'generation'].includes(controlledPanel)
    ? controlledPanel
    : internalAssistantMode
  const disabled = !editable || loading
  const selectedIndex = selected ? definitions.findIndex(({ id }) => id === selected.id) : -1
  const selectedFieldKeys = new Set((selected?.fields || []).map(({ key }) => key))
  const contentFieldEntries = (selected?.fields || [])
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => !VISUAL_INPUT_KEYS.has(field.key))
  const availableFieldKeys = Object.keys(FIELD_LIBRARY).filter(
    (key) => !VISUAL_INPUT_KEYS.has(key) && !selectedFieldKeys.has(key)
  )
  const fieldToAdd = availableFieldKeys.includes(newFieldKey)
    ? newFieldKey
    : availableFieldKeys[0] || ''
  const selectedPlatformIds = Array.isArray(selected?.platforms)
    ? selected.platforms
    : previewPlatforms.map(({ id }) => id)
  const imagePolicies = selectedPlatformIds.map(
    (id) => selected?.visual?.imagePolicyByPlatform?.[id] || 'prohibited'
  )
  const imageRequirement =
    selected?.visual?.mode === 'none'
      ? 'prohibited'
      : imagePolicies.length > 0 && imagePolicies.every((policy) => policy === 'required')
        ? 'required'
        : 'optional'
  const followsSacDesign = selected?.visual?.mode === 'template' ? 'yes' : 'no'
  const normalizedNewTypeName = newTypeName.trim().toLocaleLowerCase('es-PR')
  const duplicateNewTypeName = Boolean(
    normalizedNewTypeName &&
    definitions.some(
      ({ label }) =>
        String(label || '')
          .trim()
          .toLocaleLowerCase('es-PR') === normalizedNewTypeName
    )
  )

  const selectDefinition = (id, { openOnMobile = true } = {}) => {
    if (controlledSelectedId === undefined) setInternalSelectedId(id)
    onSelectedIdChange?.(id)
    if (openOnMobile) setMobileEditorOpen(true)
  }

  const selectPanel = (id) => {
    if (!TABS.some((tab) => tab.id === id)) return
    if (controlledPanel === undefined) setInternalPanel(id)
    onPanelChange?.(id === 'assistant' ? assistantMode : id)
  }

  const selectAssistantMode = (mode) => {
    if (!ASSISTANT_MODES.some(({ id }) => id === mode)) return
    setInternalAssistantMode(mode)
    onPanelChange?.(mode)
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

  const moveContentField = (position, offset) => {
    updateSelected((entry) => {
      const fields = [...(entry.fields || [])]
      const contentIndexes = fields
        .map((field, index) => ({ field, index }))
        .filter(({ field }) => !VISUAL_INPUT_KEYS.has(field.key))
        .map(({ index }) => index)
      const targetPosition = Math.max(0, Math.min(contentIndexes.length - 1, position + offset))
      if (targetPosition === position) return entry
      const currentIndex = contentIndexes[position]
      const targetIndex = contentIndexes[targetPosition]
      const currentField = fields[currentIndex]
      fields[currentIndex] = fields[targetIndex]
      fields[targetIndex] = currentField
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

  const changeVisualInputField = (key, setting) => {
    updateSelected((entry) => {
      const fields = entry.fields || []
      const exists = fields.some((field) => field.key === key)
      if (setting === 'off') {
        return { ...entry, fields: fields.filter((field) => field.key !== key) }
      }
      if (!exists) {
        return {
          ...entry,
          fields: [...fields, { ...fieldFromLibrary(key), required: setting === 'required' }],
        }
      }
      return {
        ...entry,
        fields: fields.map((field) =>
          field.key === key ? { ...field, required: setting === 'required' } : field
        ),
      }
    })
  }

  const createNewType = () => {
    const label = newTypeName.trim()
    if (!document || !label || duplicateNewTypeName) return
    const previousIds = new Set(definitions.map(({ id }) => id))
    const next = createContentType(document, { label })
    const created = next.contentTypeCatalog.find(({ id }) => !previousIds.has(id))
    emit(next)
    setNewTypeName('')
    setCreateDialogOpen(false)
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

  const changeStatus = (status, requestedId = selected?.id) => {
    if (!requestedId || !document) return
    const currentId = requestedId
    emit(setContentTypeStatus(document, currentId, status))
    if (status === 'archived' && !showArchived) {
      const nextVisible = definitions.find(
        ({ id, status: entryStatus }) => id !== currentId && entryStatus === 'active'
      )
      if (nextVisible) selectDefinition(nextVisible.id, { openOnMobile: false })
      else setMobileEditorOpen(false)
    }
  }

  const stopUsingType = (id) => {
    if (!id || !document || activeCount <= 1) return
    emit({
      ...document,
      contentTypeCatalog: (document.contentTypeCatalog || []).filter((entry) => entry.id !== id),
    })
    const nextVisible = definitions.find(
      ({ id: entryId, status }) => entryId !== id && status === 'active'
    )
    if (nextVisible) selectDefinition(nextVisible.id, { openOnMobile: false })
    else setMobileEditorOpen(false)
  }

  const changeVisualMode = (mode) => {
    const platformIds = previewPlatforms.map(({ id }) => id)
    updateSelected((entry) => {
      const visual = entry.visual || {}
      if (mode === 'none') {
        return {
          ...entry,
          fields: (entry.fields || []).filter(({ key }) => !VISUAL_INPUT_KEYS.has(key)),
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

  const changeSacDesign = (answer) => {
    if (answer === 'yes') {
      changeVisualMode('template')
      return
    }
    if (selected?.visual?.mode === 'template') changeVisualMode('ai_image')
  }

  const changeImageRequirement = (requirement) => {
    const platformIds = selectedPlatformIds
    if (requirement === 'prohibited') {
      changeVisualMode('none')
      return
    }
    updateSelected((entry) => {
      const visual = entry.visual || {}
      const mode = visual.mode === 'none' ? 'template' : visual.mode
      return {
        ...entry,
        visual: {
          ...visual,
          mode,
          template:
            mode === 'template'
              ? SUPPORTED_TEMPLATE_IDS.includes(visual.template)
                ? visual.template
                : suggestedTemplate(entry.fields || [])
              : null,
          backgroundSources:
            mode === 'template'
              ? visual.backgroundSources?.length
                ? [...visual.backgroundSources]
                : ['stock']
              : [],
          sponsorAllowed: mode === 'template' && visual.sponsorAllowed === true,
          imagePolicyByPlatform: {
            ...visual.imagePolicyByPlatform,
            ...policies(requirement, platformIds),
          },
        },
      }
    })
  }

  const changePlatformImagePolicy = (platform, requirement) => {
    updateSelected((entry) => {
      const visual = entry.visual || {}
      const imagePolicyByPlatform = {
        ...visual.imagePolicyByPlatform,
        [platform]: requirement,
      }
      const scopedPlatforms = Array.isArray(entry.platforms) ? entry.platforms : []
      const allScopedPlatformsProhibitImages =
        scopedPlatforms.length > 0 &&
        scopedPlatforms.every((id) => imagePolicyByPlatform[id] === 'prohibited')

      if (allScopedPlatformsProhibitImages) {
        return {
          ...entry,
          fields: (entry.fields || []).filter(({ key }) => !VISUAL_INPUT_KEYS.has(key)),
          visual: {
            ...visual,
            mode: 'none',
            template: null,
            backgroundSources: [],
            sponsorAllowed: false,
            imagePolicyByPlatform: policies(
              'prohibited',
              previewPlatforms.map(({ id }) => id)
            ),
          },
        }
      }

      const mode = visual.mode === 'none' ? 'template' : visual.mode
      return {
        ...entry,
        visual: {
          ...visual,
          mode,
          template:
            mode === 'template'
              ? SUPPORTED_TEMPLATE_IDS.includes(visual.template)
                ? visual.template
                : suggestedTemplate(entry.fields || [])
              : null,
          backgroundSources:
            mode === 'template'
              ? visual.backgroundSources?.length
                ? [...visual.backgroundSources]
                : ['stock']
              : [],
          sponsorAllowed: mode === 'template' && visual.sponsorAllowed === true,
          imagePolicyByPlatform,
        },
      }
    })
  }

  const toggleTypePlatform = (platform, checked) => {
    updateSelected((entry) => {
      const current = Array.isArray(entry.platforms)
        ? entry.platforms
        : previewPlatforms.map(({ id }) => id)
      if (!checked && current.length <= 1) return entry
      const platforms = checked
        ? current.includes(platform)
          ? current
          : [...current, platform]
        : current.filter((id) => id !== platform)
      return { ...entry, platforms }
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

  const handleAssistantModeKeyDown = (event, modeId) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const currentIndex = ASSISTANT_MODES.findIndex(({ id }) => id === modeId)
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? ASSISTANT_MODES.length - 1
          : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + ASSISTANT_MODES.length) %
            ASSISTANT_MODES.length
    const nextMode = ASSISTANT_MODES[nextIndex]
    selectAssistantMode(nextMode.id)
    window.requestAnimationFrame(() => {
      window.document.getElementById(`content-type-assistant-mode-${nextMode.id}`)?.focus()
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
            onClick={() => setCreateDialogOpen(true)}
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
                  Ver fuera de uso
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
                              Fuera de uso
                            </span>
                          )}
                        </span>
                        <span className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-[11px] text-gray-500 dark:text-gray-400">
                            {contentFieldCount(entry)}{' '}
                            {contentFieldCount(entry) === 1 ? 'campo' : 'campos'}
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
                    ? 'Activa “Ver fuera de uso” para encontrar los tipos retirados.'
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
                          Fuera de uso
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {contentFieldEntries.length}{' '}
                      {contentFieldEntries.length === 1
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
                              Volver a usar este tipo
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setArchiveConfirmationId(selected.id)}
                              disabled={disabled || activeCount <= 1}
                              className="w-full px-4 py-2.5 text-left text-sm text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-300 dark:hover:bg-red-950/30"
                            >
                              Dejar de usar este tipo
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
                        Nombre
                      </label>
                      <input
                        id={`content-type-${domId(selected.id)}-label`}
                        type="text"
                        value={selected.label || ''}
                        onChange={(event) =>
                          updateSelected((entry) => ({ ...entry, label: event.target.value }))
                        }
                        disabled={disabled}
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
                      <p className={labelClass}>¿En qué redes se publica este tipo?</p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {previewPlatforms.map(({ id, label }) => {
                          const checked = selectedPlatformIds.includes(id)
                          return (
                            <label
                              key={id}
                              className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-3 text-sm font-medium text-gray-800 dark:border-gray-700 dark:text-gray-200"
                            >
                              <input
                                id={`content-type-${domId(selected.id)}-platform-${domId(id)}`}
                                type="checkbox"
                                checked={checked}
                                onChange={(event) => toggleTypePlatform(id, event.target.checked)}
                                disabled={disabled || (checked && selectedPlatformIds.length <= 1)}
                                className="rounded border-gray-300 text-[#560647] focus:ring-[#560647] dark:border-gray-600"
                              />
                              <span>{label}</span>
                            </label>
                          )
                        })}
                      </div>
                      <p className={hintClass}>
                        Solo se generará y validará contenido para las redes marcadas. Debe quedar
                        al menos una.
                      </p>
                    </div>

                    <div className="border-y border-gray-200 py-6 dark:border-gray-700">
                      <div>
                        <label
                          htmlFor={`content-type-${domId(selected.id)}-image-requirement`}
                          className={labelClass}
                        >
                          ¿Este tipo lleva imagen?
                        </label>
                        <select
                          id={`content-type-${domId(selected.id)}-image-requirement`}
                          value={imageRequirement}
                          onChange={(event) => changeImageRequirement(event.target.value)}
                          disabled={disabled}
                          className={inputClass}
                        >
                          {IMAGE_POLICIES.map((policy) => (
                            <option key={policy} value={policy}>
                              {IMAGE_REQUIREMENT_LABELS[policy]}
                            </option>
                          ))}
                        </select>
                        <p className={hintClass}>
                          Esta selección aplica la misma regla a todas las redes marcadas.
                        </p>
                      </div>

                      <div className="mt-6">
                        <p className={labelClass}>Regla de imagen por red</p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {previewPlatforms
                            .filter(({ id }) => selectedPlatformIds.includes(id))
                            .map(({ id, label }) => (
                              <label
                                key={id}
                                htmlFor={`content-type-${domId(selected.id)}-image-policy-${domId(id)}`}
                                className="rounded-lg border border-gray-200 px-3 py-3 text-sm font-medium text-gray-800 dark:border-gray-700 dark:text-gray-200"
                              >
                                <span className="mb-2 block">{label}</span>
                                <select
                                  id={`content-type-${domId(selected.id)}-image-policy-${domId(id)}`}
                                  value={
                                    selected.visual?.imagePolicyByPlatform?.[id] || 'prohibited'
                                  }
                                  onChange={(event) =>
                                    changePlatformImagePolicy(id, event.target.value)
                                  }
                                  disabled={disabled}
                                  className={inputClass}
                                >
                                  {IMAGE_POLICIES.map((policy) => (
                                    <option key={policy} value={policy}>
                                      {IMAGE_REQUIREMENT_LABELS[policy]}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ))}
                        </div>
                      </div>

                      {selected.visual?.mode !== 'none' && (
                        <div className="mt-6">
                          <label
                            htmlFor={`content-type-${domId(selected.id)}-visual-mode`}
                            className={labelClass}
                          >
                            ¿Esta generación sigue un diseño del SAC?
                          </label>
                          <select
                            id={`content-type-${domId(selected.id)}-visual-mode`}
                            value={followsSacDesign}
                            onChange={(event) => changeSacDesign(event.target.value)}
                            disabled={disabled}
                            className={inputClass}
                          >
                            <option value="yes">Sí</option>
                            <option value="no">No</option>
                          </select>
                        </div>
                      )}

                      {selected.visual?.mode !== 'none' && (
                        <div className="mt-6 space-y-6">
                          {selected.visual?.mode === 'ai_image' && (
                            <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-200">
                              Se generará una imagen libre con IA.
                            </p>
                          )}
                          {selected.visual?.mode === 'template' && (
                            <>
                              <p className="rounded-lg border border-[#C8ABDB] bg-[#560647]/[0.05] px-4 py-3 text-sm leading-6 text-[#560647] dark:border-[#7f4773] dark:bg-[#c78bbb]/10 dark:text-[#e5b9dc]">
                                Se generará un cartel con la marca del SAC.
                              </p>
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
                                  disabled={disabled}
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
                                <p className={labelClass}>De dónde puede salir el fondo</p>
                                <div className="space-y-3">
                                  {BACKGROUND_SOURCES.map((source) => (
                                    <label
                                      key={source}
                                      className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-200"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={
                                          selected.visual?.backgroundSources?.includes(source) ||
                                          false
                                        }
                                        onChange={() => toggleBackground(source)}
                                        className="mt-0.5 rounded border-gray-300 text-[#560647] focus:ring-[#560647] dark:border-gray-600"
                                      />
                                      <span>{BACKGROUND_LABELS[source] || source}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>

                              {selected.visual?.backgroundSources?.includes('stock') && (
                                <GuidelinesTemplatePreview
                                  layoutId={selected.visual?.template || 'event'}
                                />
                              )}

                              <label className="flex items-start gap-3 border-y border-gray-200 py-4 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-200">
                                <input
                                  type="checkbox"
                                  checked={selected.visual?.sponsorAllowed === true}
                                  onChange={(event) => toggleSponsor(event.target.checked)}
                                  disabled={disabled || selected.visual?.template !== 'event'}
                                  className="mt-0.5 rounded border-gray-300 text-[#560647] focus:ring-[#560647] dark:border-gray-600"
                                />
                                <span>
                                  <span className="block font-medium">Permitir auspiciador</span>
                                  <span className="mt-0.5 block text-xs leading-5 text-gray-500 dark:text-gray-400">
                                    Añade al formulario la opción de subir el logo de un
                                    auspiciador.
                                  </span>
                                </span>
                              </label>
                            </>
                          )}

                          <details className="rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-700">
                            <summary className="cursor-pointer text-sm font-medium text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#560647] dark:text-gray-200">
                              Datos opcionales para crear la imagen
                            </summary>
                            <div className="mt-3 space-y-4 border-t border-gray-200 pt-4 dark:border-gray-700">
                              {['image_style', 'image_constraints'].map((key) => {
                                const field = (selected.fields || []).find(
                                  (entry) => entry.key === key
                                )
                                const setting = field
                                  ? field.required
                                    ? 'required'
                                    : 'optional'
                                  : 'off'
                                return (
                                  <div
                                    key={key}
                                    className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center"
                                  >
                                    <label
                                      htmlFor={`content-type-${domId(selected.id)}-${key}`}
                                      className="text-sm font-medium text-gray-800 dark:text-gray-200"
                                    >
                                      {FIELD_LIBRARY[key].label}
                                    </label>
                                    <select
                                      id={`content-type-${domId(selected.id)}-${key}`}
                                      value={setting}
                                      onChange={(event) =>
                                        changeVisualInputField(key, event.target.value)
                                      }
                                      disabled={disabled}
                                      className={inputClass}
                                    >
                                      <option value="off">No pedir</option>
                                      <option value="optional">Opcional</option>
                                      <option value="required">Pedir siempre</option>
                                    </select>
                                  </div>
                                )
                              })}
                            </div>
                          </details>
                        </div>
                      )}
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
                        disabled={disabled}
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

                    {contentFieldEntries.length ? (
                      <ol className="divide-y divide-gray-200 dark:divide-gray-700">
                        {contentFieldEntries.map(({ field, index }, position) => {
                          return (
                            <li key={`${field.key}-${index}`} className="py-6 first:pt-0">
                              <div className="mb-4 flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-gray-950 dark:text-white">
                                    {field.label || FIELD_LIBRARY[field.key]?.label || 'Sin nombre'}
                                  </p>
                                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                    Dato {position + 1} de {contentFieldEntries.length}
                                  </p>
                                </div>
                                <div className="flex items-center">
                                  <button
                                    type="button"
                                    onClick={() => moveContentField(position, -1)}
                                    disabled={disabled || position === 0}
                                    className={iconButtonClass}
                                    aria-label={`Mover ${field.label || field.key} hacia arriba`}
                                  >
                                    ↑
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moveContentField(position, 1)}
                                    disabled={
                                      disabled || position === contentFieldEntries.length - 1
                                    }
                                    className={iconButtonClass}
                                    aria-label={`Mover ${field.label || field.key} hacia abajo`}
                                  >
                                    ↓
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeField(index)}
                                    disabled={disabled}
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
                                  disabled={disabled}
                                  className="rounded border-gray-300 text-[#560647] focus:ring-[#560647] dark:border-gray-600"
                                />
                                Pedir este dato siempre
                              </label>
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

                {activePanel === 'assistant' && (
                  <div className="space-y-6">
                    <SectionIntroduction
                      title="Cómo debe trabajar el asistente"
                      description="Define por separado qué debe revisar y qué debe crear para este tipo de contenido."
                    />

                    <div
                      className="inline-flex rounded-lg bg-gray-100 p-1 dark:bg-gray-800"
                      role="tablist"
                      aria-label="Modo del asistente"
                    >
                      {ASSISTANT_MODES.map((mode) => (
                        <button
                          key={mode.id}
                          id={`content-type-assistant-mode-${mode.id}`}
                          type="button"
                          role="tab"
                          aria-selected={assistantMode === mode.id}
                          aria-controls={`content-type-assistant-panel-${mode.id}`}
                          tabIndex={assistantMode === mode.id ? 0 : -1}
                          onClick={() => selectAssistantMode(mode.id)}
                          onKeyDown={(event) => handleAssistantModeKeyDown(event, mode.id)}
                          className={`rounded-md px-5 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#560647] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 ${
                            assistantMode === mode.id
                              ? 'bg-white text-[#560647] shadow-sm dark:bg-gray-700 dark:text-[#e5b9dc]'
                              : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                          }`}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>

                    {assistantMode === 'validation' && (
                      <fieldset
                        id="content-type-assistant-panel-validation"
                        role="tabpanel"
                        aria-labelledby="content-type-assistant-mode-validation"
                        disabled={disabled}
                        className="space-y-6"
                      >
                        <div>
                          <label
                            htmlFor={`content-type-${domId(selected.id)}-validation-rules`}
                            className={labelClass}
                          >
                            ¿Qué debe revisar?
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
                            Las reglas generales y las de cada red también se aplicarán.
                          </p>
                        </div>
                      </fieldset>
                    )}

                    {assistantMode === 'generation' && (
                      <fieldset
                        id="content-type-assistant-panel-generation"
                        role="tabpanel"
                        aria-labelledby="content-type-assistant-mode-generation"
                        disabled={disabled}
                        className="space-y-6"
                      >
                        <div>
                          <label
                            htmlFor={`content-type-${domId(selected.id)}-generation-rules`}
                            className={labelClass}
                          >
                            ¿Qué debe crear y cómo?
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
                            Estas indicaciones complementan la voz del SAC y el alcance definido en
                            Información.
                          </p>
                        </div>
                      </fieldset>
                    )}
                  </div>
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

        {archiveConfirmationId && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-950/45 p-4"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setArchiveConfirmationId(null)
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="archive-content-type-title"
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900"
            >
              <h3
                id="archive-content-type-title"
                className="text-lg font-semibold text-gray-950 dark:text-white"
              >
                Dejar de usar este tipo de contenido
              </h3>
              <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                Dejará de aparecer en Generar y Validar cuando actives esta versión. Las versiones
                anteriores y su historial no cambiarán.
              </p>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setArchiveConfirmationId(null)}
                  className={quietButtonClass}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopUsingType(archiveConfirmationId)
                    setArchiveConfirmationId(null)
                  }}
                  className="rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
                >
                  Dejar de usar
                </button>
              </div>
            </div>
          </div>
        )}

        {createDialogOpen && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-950/45 p-4"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setCreateDialogOpen(false)
                setNewTypeName('')
              }
            }}
          >
            <form
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-content-type-title"
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900"
              onSubmit={(event) => {
                event.preventDefault()
                createNewType()
              }}
            >
              <h3
                id="create-content-type-title"
                className="text-lg font-semibold text-gray-950 dark:text-white"
              >
                Crear tipo de contenido
              </h3>
              <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                Escribe el nombre que verá el equipo. Luego podrás definir cuándo usarlo y qué
                información pedir.
              </p>
              <div className="mt-5">
                <label htmlFor="new-content-type-name" className={labelClass}>
                  Nombre
                </label>
                <input
                  id="new-content-type-name"
                  type="text"
                  value={newTypeName}
                  onChange={(event) => setNewTypeName(event.target.value)}
                  autoFocus
                  required
                  maxLength={160}
                  aria-invalid={duplicateNewTypeName || undefined}
                  aria-describedby={
                    duplicateNewTypeName ? 'new-content-type-name-error' : undefined
                  }
                  className={inputClass}
                  placeholder="Ej. Actividad educativa"
                />
                {duplicateNewTypeName && (
                  <p
                    id="new-content-type-name-error"
                    className="mt-1.5 text-xs text-red-700 dark:text-red-300"
                  >
                    Ya existe un tipo con ese nombre.
                  </p>
                )}
              </div>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setCreateDialogOpen(false)
                    setNewTypeName('')
                  }}
                  className={quietButtonClass}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!newTypeName.trim() || duplicateNewTypeName}
                  className="rounded-lg bg-[#560647] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6d0b5b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#560647] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#c78bbb] dark:text-gray-950 dark:hover:bg-[#d7add0] dark:focus-visible:ring-[#d7add0] dark:focus-visible:ring-offset-gray-900"
                >
                  Crear tipo
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </section>
  )
}
