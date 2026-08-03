import {
  GUIDELINES_SCHEMA_VERSION,
  createContentType,
  diffGuidelineDocuments,
  duplicateContentType,
  listContentTypeDefinitions,
  moveContentType,
  normalizeGuidelineDocumentV3,
  resolveContentTypeDefinition,
  setContentTypeStatus,
  summarizeGuidelineDocumentChanges,
  validateGuidelineForActivation,
} from '../../lib/ai-guidelines-schema'
import { getDefaultGuidelines } from '../../lib/ai-guidelines'

function validGuidelines() {
  return getDefaultGuidelines()
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

describe('Guidelines schema v3 seed', () => {
  test('default guidelines are schema v3 with a content-type catalog', () => {
    const migrated = validGuidelines()
    const migratedAgain = normalizeGuidelineDocumentV3(migrated)

    expect(migrated.schemaVersion).toBe(GUIDELINES_SCHEMA_VERSION)
    expect(migrated.contentTypeCatalog).toBeInstanceOf(Array)
    expect(migrated.contentTypes.observation_night).toContain('fecha, hora y lugar')
    expect(migrated.generation.contentTypes.observation_night).toContain('invitación')
    expect(migrated.generation.platforms).toBeUndefined()
    expect(migrated.generation.global).toBe(migrated.global)
    expect(migrated.version).toBe('default-v1')
    expect(migratedAgain).toEqual(migrated)
  })

  test('keeps observation_night as its own first-class, first catalog entry', () => {
    const migrated = validGuidelines()
    const observationNight = migrated.contentTypeCatalog[0]

    expect(observationNight).toMatchObject({
      id: 'observation_night',
      label: 'Noche de Observación',
      status: 'active',
      titleSource: 'type_label',
    })
    expect(observationNight.id).not.toBe('event_promotion')
    expect(migrated.contentTypeCatalog.some(({ id }) => id === 'event_promotion')).toBe(true)
  })

  test('preserves customized guideline copy when normalizing', () => {
    const customized = validGuidelines()
    const customVoice = 'Voz personalizada por el equipo editorial.'
    const customImageRule = 'Usa ilustraciones creadas por artistas de la comunidad.'
    const customTypeRule = 'Explica el tema con una analogía cotidiana propia del SAC.'
    customized.global = customVoice
    customized.generation.imagePrompt = customImageRule
    customized.contentTypeCatalog.find(
      ({ id }) => id === 'educational_astronomy'
    ).generation.rules = customTypeRule

    const normalized = normalizeGuidelineDocumentV3(customized)

    expect(normalized.global).toBe(customVoice)
    expect(normalized.generation.global).toBe(customVoice)
    expect(normalized.generation.imagePrompt).toBe(customImageRule)
    expect(
      normalized.contentTypeCatalog.find(({ id }) => id === 'educational_astronomy').generation
        .rules
    ).toBe(customTypeRule)
  })

  test('keeps the structured X character limit from the seed', () => {
    const migrated = validGuidelines()
    expect(migrated.platformConstraints.x.captionMaxCharacters).toBe(280)
  })

  test('keeps character limits in the structured field instead of free text', () => {
    const document = validGuidelines()
    document.platforms.x = 'Usar un máximo 300 caracteres.'

    const validation = validateGuidelineForActivation(document)

    expect(validation.ok).toBe(false)
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'duplicate_constraint', path: 'platforms.x' }),
      ])
    )
  })

  test('does not reactivate an archived type when normalizing an existing document', () => {
    const archived = setContentTypeStatus(validGuidelines(), 'observation_night', 'archived')
    const normalizedAgain = normalizeGuidelineDocumentV3(archived)

    expect(
      resolveContentTypeDefinition(normalizedAgain, 'observation_night', {
        includeArchived: true,
      })?.status
    ).toBe('archived')
    expect(resolveContentTypeDefinition(normalizedAgain, 'observation_night')).toBeNull()
  })
})

describe('Guidelines schema v3 activation validation', () => {
  test('accepts a complete migrated catalog', () => {
    expect(validateGuidelineForActivation(validGuidelines())).toMatchObject({
      ok: true,
      errors: [],
      issues: [],
    })
  })

  test('does not require the retired global generation field', () => {
    const document = validGuidelines()
    delete document.generation.global

    expect(validateGuidelineForActivation(document)).toMatchObject({
      ok: true,
      issues: [],
      document: { generation: { global: document.global } },
    })
  })

  test('returns linkable structured issues without changing legacy errors', () => {
    const document = validGuidelines()
    document.global = ''
    document.platforms.x = { unsafe: true }
    document.contentTypeCatalog[0].fields[0].help = { unsafe: true }
    document.contentTypeCatalog[0].visual.template = 'freeform'

    const validation = validateGuidelineForActivation(document)

    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'required', path: 'global' }),
        expect.objectContaining({ code: 'required', path: 'platforms.x' }),
        expect.objectContaining({
          code: 'invalid_type',
          path: 'contentTypeCatalog.0.fields.0.help',
        }),
        expect.objectContaining({
          code: 'unsupported_value',
          path: 'contentTypeCatalog.0.visual.template',
        }),
      ])
    )
    expect(validation.errors).toEqual(validation.issues.map(({ message }) => message))
  })

  test('allows activating without one of the seed platforms', () => {
    const document = validGuidelines()
    delete document.platforms.x
    delete document.platformLabels.x
    for (const entry of document.contentTypeCatalog) {
      entry.platforms = entry.platforms.filter((platform) => platform !== 'x')
      if (entry.visual?.imagePolicyByPlatform) {
        delete entry.visual.imagePolicyByPlatform.x
      }
    }

    const validation = validateGuidelineForActivation(document)

    expect(validation.ok).toBe(true)
    expect(validation.issues).toEqual([])
  })

  test('requires at least one platform', () => {
    const document = validGuidelines()
    document.platforms = {}
    document.platformLabels = {}
    for (const entry of document.contentTypeCatalog) {
      if (entry.visual) entry.visual.imagePolicyByPlatform = {}
    }

    const validation = validateGuidelineForActivation(document)

    expect(validation.ok).toBe(false)
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'required',
          path: 'platforms',
          message: 'Debe existir al menos una plataforma.',
        }),
      ])
    )
  })

  test('allows activating a newly named platform when rules and policies are complete', () => {
    const document = validGuidelines()
    document.platforms.threads = 'Reglas para Threads.'
    document.platformLabels.threads = 'Threads'
    for (const entry of document.contentTypeCatalog) {
      const visual = entry.visual
      if (!visual?.imagePolicyByPlatform) continue
      visual.imagePolicyByPlatform.threads = visual.mode === 'none' ? 'prohibited' : 'optional'
    }

    expect(validateGuidelineForActivation(document)).toMatchObject({
      ok: true,
      errors: [],
      issues: [],
    })
  })

  test('rejects duplicate content type IDs', () => {
    const document = validGuidelines()
    document.contentTypeCatalog.push(clone(document.contentTypeCatalog[0]))

    const validation = validateGuidelineForActivation(document)

    expect(validation.ok).toBe(false)
    expect(validation.errors).toEqual(expect.arrayContaining([expect.stringMatching(/duplicado/i)]))
  })

  test('rejects duplicate content type names regardless of capitalization', () => {
    const document = validGuidelines()
    document.contentTypeCatalog[1].label = document.contentTypeCatalog[0].label.toUpperCase()

    const validation = validateGuidelineForActivation(document)

    expect(validation.ok).toBe(false)
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'duplicate_label',
          path: 'contentTypeCatalog.1.label',
        }),
      ])
    )
  })

  test('does not recreate a missing v3 catalog during activation', () => {
    const document = validGuidelines()
    delete document.contentTypeCatalog

    const validation = validateGuidelineForActivation(document)

    expect(validation.ok).toBe(false)
    expect(validation.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/contentTypeCatalog es obligatorio/i)])
    )
  })

  test.each([
    {
      name: 'unsupported field',
      mutate(document) {
        document.contentTypeCatalog[0].fields[0].key = 'arbitrary_payload'
      },
      error: /campo no soportado/i,
    },
    {
      name: 'unknown template',
      mutate(document) {
        document.contentTypeCatalog[0].visual.template = 'freeform'
      },
      error: /plantilla inexistente/i,
    },
    {
      name: 'unsupported title source',
      mutate(document) {
        document.contentTypeCatalog[0].titleSource = 'arbitrary_payload'
      },
      error: /titleSource inválido/i,
    },
    {
      name: 'optional title source',
      mutate(document) {
        const type = document.contentTypeCatalog.find(({ id }) => id === 'caption')
        type.fields.find(({ key }) => key === 'topic').required = false
      },
      error: /titleSource.*campo requerido/i,
    },
    {
      name: 'sponsor on an unsupported template',
      mutate(document) {
        const type = document.contentTypeCatalog.find(({ id }) => id === 'image_post')
        type.fields.push({
          key: 'sponsor',
          label: 'Auspiciador',
          help: '',
          placeholder: '',
          required: false,
        })
        type.visual.sponsorAllowed = true
      },
      error: /plantilla event/i,
    },
    {
      name: 'base policy contradiction',
      mutate(document) {
        document.global = 'Se permite dar consejos médicos.'
      },
      error: /no puede permitir consejos médicos/i,
    },
    {
      name: 'visual mode prohibited on every platform',
      mutate(document) {
        const type = document.contentTypeCatalog.find(({ id }) => id === 'regular_post')
        type.platforms = ['x']
        type.visual.imagePolicyByPlatform.x = 'prohibited'
        type.visual.imagePolicyByPlatform = {
          x: 'prohibited',
          instagram: 'prohibited',
          facebook: 'prohibited',
        }
      },
      error: /prohíbe en todas las plataformas/i,
    },
    {
      name: 'visual type without a required purpose field',
      mutate(document) {
        const type = document.contentTypeCatalog.find(({ id }) => id === 'caption')
        type.titleSource = 'type_label'
        type.fields = [
          {
            key: 'tone',
            label: 'Tono',
            help: '',
            placeholder: '',
            required: false,
          },
        ]
      },
      error: /aporte propósito visual/i,
    },
    {
      name: 'invalid platform id slug',
      mutate(document) {
        document.platforms['Bad ID'] = 'Reglas inválidas.'
        document.platformLabels['Bad ID'] = 'Bad'
      },
      error: /slug válido/i,
    },
    {
      name: 'non-string platform rules',
      mutate(document) {
        document.platforms.x = { boom: true }
      },
      error: /necesita expectativas de contenido/i,
    },
    {
      name: 'non-string field metadata',
      mutate(document) {
        document.contentTypeCatalog[0].fields[0].help = { unsafe: true }
      },
      error: /help.*debe ser texto/i,
    },
    {
      name: 'non-boolean sponsor capability',
      mutate(document) {
        document.contentTypeCatalog[0].visual.sponsorAllowed = 'yes'
      },
      error: /debe indicar si permite auspiciador/i,
    },
    {
      name: 'required sponsor on a text-only supported platform',
      mutate(document) {
        const type = document.contentTypeCatalog.find(({ id }) => id === 'regular_post')
        type.platforms = ['x']
        type.visual.imagePolicyByPlatform.x = 'prohibited'
        type.fields.push({
          key: 'sponsor',
          label: 'Auspiciador',
          help: '',
          placeholder: '',
          required: true,
        })
        type.visual.template = 'event'
        type.visual.sponsorAllowed = true
      },
      error: /no puede exigir auspiciador/i,
    },
  ])('rejects $name', ({ mutate, error }) => {
    const document = validGuidelines()
    mutate(document)

    const validation = validateGuidelineForActivation(document)

    expect(validation.ok).toBe(false)
    expect(validation.errors).toEqual(expect.arrayContaining([expect.stringMatching(error)]))
  })

  test('allows a published type to be removed from the new version', () => {
    const published = validGuidelines()
    const removed = clone(published)
    removed.contentTypeCatalog = removed.contentTypeCatalog.filter(({ id }) => id !== 'caption')

    const validation = validateGuidelineForActivation(removed)

    expect(validation.ok).toBe(true)
    expect(validation.document.contentTypeCatalog.some(({ id }) => id === 'caption')).toBe(false)
    expect(published.contentTypeCatalog.some(({ id }) => id === 'caption')).toBe(true)
  })

  test('allows the team to adapt observation night while preserving its internal ID', () => {
    const document = validGuidelines()
    const observation = document.contentTypeCatalog.find(({ id }) => id === 'observation_night')
    observation.label = 'Evento genérico'
    observation.titleSource = 'event_name'
    observation.fields = observation.fields
      .filter(({ key }) => key !== 'sponsor')
      .map((field) => (field.key === 'date' ? { ...field, required: false } : field))
    observation.fields.push({
      key: 'event_name',
      label: 'Nombre',
      help: '',
      placeholder: '',
      required: true,
    })
    observation.visual.sponsorAllowed = false

    const validation = validateGuidelineForActivation(document)

    expect(validation.ok).toBe(true)
    expect(validation.document.contentTypeCatalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'observation_night', label: 'Evento genérico' }),
      ])
    )
  })

  test('allows observation_night to be archived like any other content type', () => {
    const document = setContentTypeStatus(validGuidelines(), 'observation_night', 'archived')

    const validation = validateGuidelineForActivation(document)

    expect(validation.ok).toBe(true)
  })
})

describe('Guidelines schema v3 catalog operations', () => {
  test('creates a new active content type with a unique immutable candidate ID', () => {
    const base = validGuidelines()
    const created = createContentType(base, {
      id: 'community_story',
      label: 'Historia de la comunidad',
    })
    const collision = createContentType(created, {
      id: 'community_story',
      label: 'Otra historia',
    })

    expect(resolveContentTypeDefinition(base, 'community_story')).toBeNull()
    expect(resolveContentTypeDefinition(created, 'community_story')).toMatchObject({
      id: 'community_story',
      label: 'Historia de la comunidad',
      status: 'active',
    })
    expect(resolveContentTypeDefinition(collision, 'community_story_2')).toMatchObject({
      label: 'Otra historia',
      status: 'active',
    })
  })

  test('derives valid bounded IDs from nontechnical names', () => {
    const base = validGuidelines()
    const numeric = createContentType(base, { label: '123' })
    const collision = createContentType(numeric, { label: '123!' })
    const longName = `Actividad ${'educativa '.repeat(20)}`
    const long = createContentType(collision, { label: longName })
    const createdIds = long.contentTypeCatalog
      .slice(base.contentTypeCatalog.length)
      .map(({ id }) => id)

    expect(createdIds).toEqual(expect.arrayContaining(['type_123', 'type_123_2']))
    expect(createdIds.every((id) => /^[a-z][a-z0-9_]{1,63}$/.test(id))).toBe(true)
  })

  test('duplicates as a new type and archives the original only when requested', () => {
    const base = validGuidelines()
    const original = resolveContentTypeDefinition(base, 'observation_night')
    const duplicated = duplicateContentType(base, 'observation_night', {
      id: 'community_observation',
      label: 'Observación comunitaria',
      archiveOriginal: true,
    })
    const archivedOriginal = resolveContentTypeDefinition(duplicated, 'observation_night', {
      includeArchived: true,
    })
    const copy = resolveContentTypeDefinition(duplicated, 'community_observation')

    expect(archivedOriginal?.status).toBe('archived')
    expect(copy).toMatchObject({
      id: 'community_observation',
      label: 'Observación comunitaria',
      status: 'active',
    })
    expect(copy?.fields).toEqual(original?.fields)
    expect(copy?.fields).not.toBe(original?.fields)
  })

  test('supports reorder, status changes and an activation diff', () => {
    const active = validGuidelines()
    let draft = createContentType(active, {
      id: 'community_story',
      label: 'Historia de la comunidad',
    })
    draft = setContentTypeStatus(draft, 'caption', 'archived')
    draft = moveContentType(draft, 'regular_post', 'up')

    const diff = diffGuidelineDocuments(active, draft)

    expect(draft.contentTypeCatalog[0].id).toBe('regular_post')
    expect(resolveContentTypeDefinition(draft, 'caption')).toBeNull()
    expect(resolveContentTypeDefinition(draft, 'caption', { includeArchived: true })?.status).toBe(
      'archived'
    )
    expect(diff.created).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'community_story' })])
    )
    expect(diff.archived).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'caption' })])
    )
    expect(diff.changed).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'caption' })])
    )
    expect(diff.reordered).toBe(true)

    const restored = setContentTypeStatus(draft, 'caption', 'active')
    expect(diffGuidelineDocuments(draft, restored).restored).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'caption' })])
    )
    expect(() => setContentTypeStatus(draft, 'caption', 'deleted')).toThrow(/estado inválido/i)
  })

  test('summarizes every review area with human labels and linkable paths', () => {
    const active = validGuidelines()
    const draft = clone(active)
    const regularPostIndex = draft.contentTypeCatalog.findIndex(({ id }) => id === 'regular_post')
    const regularPost = draft.contentTypeCatalog[regularPostIndex]

    draft.global = 'Nueva voz al validar.'
    draft.platforms.x = 'Nuevas reglas para X.'
    draft.imageValidation = 'Nuevas reglas al validar imágenes.'
    regularPost.description = 'Nueva descripción de la publicación regular.'
    regularPost.visual.imagePolicyByPlatform.x = 'optional'

    const summary = summarizeGuidelineDocumentChanges(active, draft)

    expect(summary).toMatchObject({
      hasChanges: true,
      contentTypes: {
        label: 'Tipos de contenido',
        section: 'types',
        changed: true,
      },
      generalRules: {
        label: 'Reglas generales',
        section: 'general',
        changed: true,
      },
      platforms: {
        label: 'Redes sociales',
        section: 'platforms',
        changed: true,
      },
      images: {
        label: 'Imágenes',
        changed: true,
      },
    })
    expect(summary.contentTypes.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'regular_post',
          label: 'Publicación regular',
          path: `contentTypeCatalog.${regularPostIndex}`,
          fields: expect.arrayContaining([
            expect.objectContaining({ key: 'description', label: 'Descripción' }),
          ]),
        }),
      ])
    )
    expect(summary.generalRules.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Voz y tono general', path: 'global' }),
      ])
    )
    expect(summary.platforms.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'x',
          label: 'X',
          path: 'platforms.x',
          fields: expect.arrayContaining([
            expect.objectContaining({
              key: 'expectations',
              label: 'Qué debe cumplir el contenido',
            }),
          ]),
        }),
      ])
    )
    expect(summary.images.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Reglas al validar imágenes',
          section: 'general',
          path: 'imageValidation',
        }),
        expect.objectContaining({
          id: 'regular_post',
          label: 'Imagen de Publicación regular',
          section: 'types',
          path: `contentTypeCatalog.${regularPostIndex}.visual`,
        }),
      ])
    )
    expect(summary.contentTypeDiff.changed).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'regular_post' })])
    )
    expect(summary.totalChanges).toBe(
      summary.contentTypes.count +
        summary.generalRules.count +
        summary.platforms.count +
        summary.images.count
    )
  })

  test('returns an empty full summary for equivalent documents', () => {
    const active = validGuidelines()
    const summary = summarizeGuidelineDocumentChanges(active, clone(active))

    expect(summary.hasChanges).toBe(false)
    expect(summary.totalChanges).toBe(0)
    expect(
      [summary.contentTypes, summary.generalRules, summary.platforms, summary.images].every(
        ({ changed, items }) => changed === false && items.length === 0
      )
    ).toBe(true)
  })

  test('replaces the retired global generation field with an ignored compatibility alias', () => {
    const active = validGuidelines()
    const withLegacyField = clone(active)
    withLegacyField.generation.global = 'Instrucción técnica heredada.'

    expect(normalizeGuidelineDocumentV3(withLegacyField).generation.global).toBe(active.global)
    expect(summarizeGuidelineDocumentChanges(active, withLegacyField)).toMatchObject({
      hasChanges: false,
      totalChanges: 0,
    })
  })

  test('lists and resolves active types separately from archived types', () => {
    const document = setContentTypeStatus(validGuidelines(), 'caption', 'archived')
    const activeIds = listContentTypeDefinitions(document).map(({ id }) => id)
    const allIds = listContentTypeDefinitions(document, { includeArchived: true }).map(
      ({ id }) => id
    )

    expect(activeIds).not.toContain('caption')
    expect(allIds).toContain('caption')
    expect(resolveContentTypeDefinition(document, 'regular_post')?.status).toBe('active')
    expect(resolveContentTypeDefinition(document, 'caption')).toBeNull()
    expect(
      resolveContentTypeDefinition(document, 'caption', { includeArchived: true })?.status
    ).toBe('archived')
  })
})
