import {
  CONTENT_TYPE_DEFINITIONS,
  DEFAULT_SEED_PLATFORM_LABELS,
  DEFAULT_SEED_PLATFORMS,
  MAX_GUIDELINE_PLATFORMS,
  OBSERVATION_NIGHT_CONTENT_TYPE,
  OBSERVATION_NIGHT_LABEL,
  PLATFORM_ID_PATTERN,
} from './ai-constants'
import { findGuidelinePolicyContradictions } from './ai-agent'

export const GUIDELINES_SCHEMA_VERSION = 3
const MAX_PLATFORM_EXPECTATION_LENGTH = 40_100

export const FIELD_LIBRARY = Object.freeze({
  intent: { key: 'intent', label: 'Intención', inputType: 'textarea', maxLength: 500 },
  topic: { key: 'topic', label: 'Tema', inputType: 'textarea', maxLength: 600 },
  event_name: {
    key: 'event_name',
    label: 'Nombre del evento',
    inputType: 'text',
    maxLength: 160,
  },
  date: { key: 'date', label: 'Fecha', inputType: 'date', maxLength: 40 },
  time: { key: 'time', label: 'Hora', inputType: 'time', maxLength: 40 },
  location: { key: 'location', label: 'Lugar', inputType: 'text', maxLength: 240 },
  cta: { key: 'cta', label: 'Llamado a la acción', inputType: 'text', maxLength: 300 },
  tone: { key: 'tone', label: 'Tono', inputType: 'text', maxLength: 120 },
  audience: { key: 'audience', label: 'Audiencia', inputType: 'text', maxLength: 200 },
  known_facts: {
    key: 'known_facts',
    label: 'Datos confirmados',
    inputType: 'list',
    maxItems: 20,
    itemMaxLength: 500,
  },
  hashtags: {
    key: 'hashtags',
    label: 'Hashtags',
    inputType: 'list',
    maxItems: 20,
    itemMaxLength: 500,
  },
  links: {
    key: 'links',
    label: 'Enlaces',
    inputType: 'list',
    maxItems: 20,
    itemMaxLength: 500,
  },
  image_style: {
    key: 'image_style',
    label: 'Estilo de imagen',
    inputType: 'text',
    maxLength: 500,
  },
  image_constraints: {
    key: 'image_constraints',
    label: 'Restricciones visuales',
    inputType: 'textarea',
    maxLength: 1000,
  },
  sponsor: { key: 'sponsor', label: 'Auspiciador', inputType: 'image' },
})

export const SUPPORTED_TEMPLATE_IDS = Object.freeze(['event', 'simple'])
export const TITLE_SOURCES = Object.freeze(['type_label', 'event_name', 'topic'])
export const IMAGE_POLICIES = Object.freeze(['prohibited', 'optional', 'required'])
export const VISUAL_MODES = Object.freeze(['none', 'ai_image', 'template'])
export const BACKGROUND_SOURCES = Object.freeze(['stock', 'ai_generated'])

const DESCRIPTIONS = {
  observation_night: 'Invitación recurrente a una Noche de Observación de SAC.',
  regular_post: 'Publicación general para informar o conversar con la comunidad de SAC.',
  caption: 'Texto breve que acompaña una pieza ya definida.',
  image_post: 'Publicación centrada en una imagen y su mensaje.',
  carousel: 'Publicación que presenta un tema mediante varias láminas.',
  reel_caption: 'Texto de acompañamiento para un reel existente.',
  event_promotion: 'Promoción de un evento de SAC distinto a Noche de Observación.',
  educational_astronomy: 'Contenido educativo de astronomía para la comunidad de SAC.',
  member_update: 'Actualización institucional dirigida a miembros de SAC.',
}

const GENERIC_FIELDS = [
  ['intent', true],
  ['topic', true],
  ['cta', false],
  ['tone', false],
  ['audience', false],
  ['known_facts', false],
  ['hashtags', false],
  ['links', false],
  ['image_style', false],
  ['image_constraints', false],
]

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function makeField(key, required = false) {
  const definition = FIELD_LIBRARY[key]
  if (!definition) return { key, label: key, help: '', placeholder: '', required }
  return {
    key,
    label: definition.label,
    help: '',
    placeholder: '',
    required,
  }
}

function policies(value, platformIds = DEFAULT_SEED_PLATFORMS) {
  const resolvedValue =
    value === 'optional' && platformIds.includes('instagram') ? 'required' : value
  return Object.fromEntries(platformIds.map((platform) => [platform, resolvedValue]))
}

function seedShape(id, platformIds = DEFAULT_SEED_PLATFORMS) {
  const resolvedPlatformIds =
    Array.isArray(platformIds) && platformIds.length ? platformIds : DEFAULT_SEED_PLATFORMS

  if (id === OBSERVATION_NIGHT_CONTENT_TYPE) {
    return {
      fields: [
        makeField('date', true),
        makeField('time', true),
        makeField('location', true),
        makeField('cta'),
        makeField('sponsor'),
      ],
      titleSource: 'type_label',
      visual: {
        mode: 'template',
        template: 'event',
        backgroundSources: [...BACKGROUND_SOURCES],
        sponsorAllowed: true,
        imagePolicyByPlatform: policies('optional', resolvedPlatformIds),
      },
    }
  }

  if (id === 'event_promotion') {
    return {
      fields: [
        makeField('event_name', true),
        makeField('date', true),
        makeField('time', true),
        makeField('location', true),
        makeField('cta', true),
        makeField('sponsor'),
      ],
      titleSource: 'event_name',
      visual: {
        mode: 'template',
        template: 'event',
        backgroundSources: [...BACKGROUND_SOURCES],
        sponsorAllowed: true,
        imagePolicyByPlatform: policies('optional', resolvedPlatformIds),
      },
    }
  }

  const noImage = id === 'reel_caption'
  const generatedOnly = id === 'caption'
  const regularPostPolicies = Object.fromEntries(
    resolvedPlatformIds.map((platform) => {
      if (resolvedPlatformIds.includes('instagram')) return [platform, 'required']
      if (id === 'regular_post' && platform === 'x') return [platform, 'prohibited']
      return [platform, 'optional']
    })
  )
  return {
    fields: GENERIC_FIELDS.map(([key, required]) => makeField(key, required)).filter(
      ({ key }) => !(noImage && (key === 'image_style' || key === 'image_constraints'))
    ),
    titleSource: 'topic',
    visual: noImage
      ? {
          mode: 'none',
          template: null,
          backgroundSources: [],
          sponsorAllowed: false,
          imagePolicyByPlatform: policies('prohibited', resolvedPlatformIds),
        }
      : generatedOnly
        ? {
            mode: 'ai_image',
            template: null,
            backgroundSources: [],
            sponsorAllowed: false,
            imagePolicyByPlatform: policies('optional', resolvedPlatformIds),
          }
        : {
            mode: 'template',
            template: 'simple',
            backgroundSources: [...BACKGROUND_SOURCES],
            sponsorAllowed: false,
            imagePolicyByPlatform: regularPostPolicies,
          },
  }
}

export function createDefaultContentTypeCatalog({
  validationRules = {},
  generationRules = {},
  platformIds = DEFAULT_SEED_PLATFORMS,
} = {}) {
  const resolvedPlatformIds =
    Array.isArray(platformIds) && platformIds.length ? platformIds : DEFAULT_SEED_PLATFORMS
  return CONTENT_TYPE_DEFINITIONS.map(({ id, label }) => {
    const shape = seedShape(id, resolvedPlatformIds)
    const scopedPlatforms =
      shape.visual.mode === 'none' && resolvedPlatformIds.length > 1
        ? resolvedPlatformIds.filter((platform) => platform !== 'instagram')
        : resolvedPlatformIds
    return {
      id,
      label,
      status: 'active',
      platforms: [...scopedPlatforms],
      description: DESCRIPTIONS[id] || `Contenido social de SAC: ${label}.`,
      fields: shape.fields,
      titleSource: shape.titleSource,
      validation: {
        rules:
          validationRules[id] ||
          `Validar ${label} contra la información provista y las restricciones de SAC.`,
      },
      generation: {
        rules:
          generationRules[id] ||
          `Generar ${label} para las redes sociales de SAC sin inventar información.`,
      },
      visual: shape.visual,
    }
  })
}

function normalizePlatforms(doc) {
  const platforms =
    doc?.platforms && typeof doc.platforms === 'object' && !Array.isArray(doc.platforms)
      ? { ...doc.platforms }
      : {}
  const existingLabels =
    doc?.platformLabels &&
    typeof doc.platformLabels === 'object' &&
    !Array.isArray(doc.platformLabels)
      ? { ...doc.platformLabels }
      : {}
  const platformLabels = {}
  for (const id of Object.keys(platforms)) {
    platformLabels[id] = existingLabels[id] || DEFAULT_SEED_PLATFORM_LABELS[id] || id
  }
  return { platforms, platformLabels }
}

function normalizePlatformConstraints(doc, platformIds) {
  const hasExplicitConstraints = isPlainRecord(doc?.platformConstraints)

  return Object.fromEntries(
    platformIds.map((id) => {
      if (
        hasExplicitConstraints &&
        Object.prototype.hasOwnProperty.call(doc.platformConstraints, id)
      ) {
        const value = doc.platformConstraints[id]
        return [id, isPlainRecord(value) ? { ...value } : value]
      }

      return [id, { captionMaxCharacters: null }]
    })
  )
}

/**
 * Normalize a schema v3 guidelines document.
 * Syncs platform labels/constraints and, when present, flat contentTypes maps from the catalog.
 */
export function normalizeGuidelineDocumentV3(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return doc || null

  const { platforms, platformLabels } = normalizePlatforms(doc)
  const global = typeof doc.global === 'string' ? doc.global : doc.global || ''
  const configuredPlatformIds = Object.keys(platforms)
  const platformConstraints = normalizePlatformConstraints(doc, configuredPlatformIds)

  if (!Array.isArray(doc.contentTypeCatalog)) {
    return {
      ...clone(doc),
      schemaVersion: GUIDELINES_SCHEMA_VERSION,
      global,
      platforms,
      platformLabels,
      platformConstraints,
    }
  }

  const contentTypeCatalog = doc.contentTypeCatalog.map((entry) => {
    const hasExplicitPlatforms = Array.isArray(entry?.platforms)
    const defaultPlatforms =
      entry?.visual?.mode === 'none' && configuredPlatformIds.length > 1
        ? configuredPlatformIds.filter((platform) => platform !== 'instagram')
        : configuredPlatformIds
    const imagePolicyByPlatform =
      entry?.visual?.imagePolicyByPlatform && typeof entry.visual.imagePolicyByPlatform === 'object'
        ? { ...entry.visual.imagePolicyByPlatform }
        : entry?.visual?.imagePolicyByPlatform
    if (
      !hasExplicitPlatforms &&
      defaultPlatforms.includes('instagram') &&
      entry?.visual?.mode !== 'none' &&
      imagePolicyByPlatform
    ) {
      for (const platform of defaultPlatforms) imagePolicyByPlatform[platform] = 'required'
    }
    return {
      ...clone(entry),
      platforms: hasExplicitPlatforms ? [...entry.platforms] : [...defaultPlatforms],
      fields: Array.isArray(entry?.fields)
        ? entry.fields.map((field) => ({ ...field }))
        : entry?.fields,
      validation: entry?.validation ? { ...entry.validation } : entry?.validation,
      generation: entry?.generation ? { ...entry.generation } : entry?.generation,
      visual: entry?.visual
        ? {
            ...entry.visual,
            backgroundSources: Array.isArray(entry.visual.backgroundSources)
              ? [...entry.visual.backgroundSources]
              : entry.visual.backgroundSources,
            imagePolicyByPlatform,
          }
        : entry?.visual,
    }
  })

  const contentTypes = {}
  const generationContentTypes = {}
  for (const entry of contentTypeCatalog) {
    if (typeof entry?.id !== 'string') continue
    contentTypes[entry.id] = entry.validation?.rules || ''
    generationContentTypes[entry.id] = entry.generation?.rules || ''
  }

  const generation =
    doc.generation && typeof doc.generation === 'object' ? clone(doc.generation) : {}
  delete generation.platforms
  generation.global = global

  return {
    ...clone(doc),
    schemaVersion: GUIDELINES_SCHEMA_VERSION,
    global,
    platforms,
    platformLabels,
    platformConstraints,
    contentTypeCatalog,
    contentTypes,
    generation: {
      ...generation,
      contentTypes: generationContentTypes,
    },
  }
}

function extractCaptionCharacterLimit(...rules) {
  const text = rules.filter((value) => typeof value === 'string').join('\n')
  const match = text.match(/(?:máximo(?:\s+de)?|límite(?:\s+de)?)\s+(\d{1,5})\s+caracteres?/i)
  const value = match ? Number(match[1]) : null
  return Number.isInteger(value) && value >= 1 && value <= 20_000 ? value : null
}

function createValidationReporter() {
  const errors = []
  const issues = []
  const report = (code, path, message) => {
    errors.push(message)
    issues.push({ code, path, message })
  }
  return { errors, issues, report }
}

export function validateGuidelineDraft(doc) {
  const { errors, issues, report } = createValidationReporter()
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    report('invalid_document', '', 'Documento de guías inválido.')
  } else {
    if (doc.schemaVersion != null && doc.schemaVersion !== GUIDELINES_SCHEMA_VERSION) {
      report(
        'invalid_schema_version',
        'schemaVersion',
        `schemaVersion debe ser ${GUIDELINES_SCHEMA_VERSION}.`
      )
    }
    if (doc.contentTypeCatalog != null && !Array.isArray(doc.contentTypeCatalog)) {
      report('invalid_type', 'contentTypeCatalog', 'contentTypeCatalog debe ser una lista.')
    }
  }
  return { ok: errors.length === 0, errors, issues }
}

function nonEmptyText(value) {
  return typeof value === 'string' && Boolean(value.trim())
}

function isPlainRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function exceedsTextLimit(value, max) {
  return typeof value === 'string' && value.length > max
}

function validateVisual(entry, report, configuredPlatforms, entryPath) {
  const visual = entry.visual
  const prefix = `El tipo "${entry.id}"`
  const visualPath = `${entryPath}.visual`
  if (!isPlainRecord(visual)) {
    report('required', visualPath, `${prefix} necesita configuración visual.`)
    return
  }
  if (!VISUAL_MODES.includes(visual.mode)) {
    report('invalid_value', `${visualPath}.mode`, `${prefix} usa un modo visual inválido.`)
    return
  }

  if (!Array.isArray(visual.backgroundSources)) {
    report(
      'invalid_type',
      `${visualPath}.backgroundSources`,
      `${prefix} debe declarar las fuentes de fondo como una lista.`
    )
  }
  const backgrounds = Array.isArray(visual.backgroundSources) ? visual.backgroundSources : []
  if (backgrounds.some((source) => !BACKGROUND_SOURCES.includes(source))) {
    report(
      'unsupported_value',
      `${visualPath}.backgroundSources`,
      `${prefix} referencia un fondo no soportado.`
    )
  }
  if (new Set(backgrounds).size !== backgrounds.length) {
    report(
      'duplicate_value',
      `${visualPath}.backgroundSources`,
      `${prefix} repite una fuente de fondo.`
    )
  }

  if (visual.mode === 'template') {
    if (!SUPPORTED_TEMPLATE_IDS.includes(visual.template)) {
      report(
        'unsupported_value',
        `${visualPath}.template`,
        `${prefix} referencia una plantilla inexistente.`
      )
    }
    if (!backgrounds.length) {
      report(
        'required',
        `${visualPath}.backgroundSources`,
        `${prefix} debe permitir al menos una fuente de fondo.`
      )
    }
  } else if (visual.template !== null || backgrounds.length) {
    report(
      'incompatible_value',
      visual.template !== null ? `${visualPath}.template` : `${visualPath}.backgroundSources`,
      `${prefix} solo puede configurar plantilla y fondos en modo plantilla.`
    )
  }

  if (typeof visual.sponsorAllowed !== 'boolean') {
    report(
      'invalid_type',
      `${visualPath}.sponsorAllowed`,
      `${prefix} debe indicar si permite auspiciador.`
    )
  }

  const policiesByPlatform = visual.imagePolicyByPlatform
  if (!isPlainRecord(policiesByPlatform)) {
    report(
      'required',
      `${visualPath}.imagePolicyByPlatform`,
      `${prefix} necesita una política de imagen por plataforma.`
    )
  } else {
    const configuredSet = new Set(configuredPlatforms)
    for (const platform of Object.keys(policiesByPlatform)) {
      if (!configuredSet.has(platform)) {
        report(
          'unsupported_platform',
          `${visualPath}.imagePolicyByPlatform.${platform}`,
          `${prefix} configura una política para la plataforma "${platform}" que no está en Guidelines.`
        )
      }
    }
    for (const platform of configuredPlatforms) {
      if (!IMAGE_POLICIES.includes(policiesByPlatform[platform])) {
        report(
          'invalid_value',
          `${visualPath}.imagePolicyByPlatform.${platform}`,
          `${prefix} usa una política de imagen inválida para ${platform}.`
        )
      }
      if (visual.mode === 'none' && policiesByPlatform[platform] !== 'prohibited') {
        report(
          'incompatible_value',
          `${visualPath}.imagePolicyByPlatform.${platform}`,
          `${prefix} debe prohibir imágenes en ${platform} cuando no usa imagen.`
        )
      }
    }
    if (
      visual.mode !== 'none' &&
      configuredPlatforms.length > 0 &&
      configuredPlatforms.every((platform) => policiesByPlatform[platform] === 'prohibited')
    ) {
      report(
        'incompatible_value',
        `${visualPath}.imagePolicyByPlatform`,
        `${prefix} configura una imagen, pero la prohíbe en todas las plataformas.`
      )
    }
  }

  const fields = Array.isArray(entry.fields)
    ? entry.fields.filter((field) => isPlainRecord(field))
    : []
  const keys = new Set(fields.map(({ key }) => key))
  const requiredKeys = new Set(
    fields.filter(({ required }) => required === true).map(({ key }) => key)
  )
  const hasDirectVisualPurpose = ['intent', 'topic', 'event_name'].some((key) =>
    requiredKeys.has(key)
  )
  const hasEventVisualPurpose =
    visual.template === 'event' && requiredKeys.has('date') && requiredKeys.has('location')
  if (visual.mode !== 'none' && !hasDirectVisualPurpose && !hasEventVisualPurpose) {
    report(
      'required',
      `${entryPath}.fields`,
      `${prefix} necesita un campo requerido que aporte propósito visual (intención, tema, nombre del evento o logística de evento).`
    )
  }
  if (visual.sponsorAllowed === true && !keys.has('sponsor')) {
    report(
      'required',
      `${entryPath}.fields`,
      `${prefix} permite auspiciador pero no incluye el campo sponsor.`
    )
  }
  if (visual.sponsorAllowed === true && visual.template !== 'event') {
    report(
      'incompatible_value',
      `${visualPath}.sponsorAllowed`,
      `${prefix} solo puede permitir auspiciador con la plantilla event.`
    )
  }
  if (visual.sponsorAllowed !== true && keys.has('sponsor')) {
    report(
      'incompatible_value',
      `${entryPath}.fields`,
      `${prefix} incluye sponsor pero no permite auspiciador.`
    )
  }
  const sponsorField = fields.find(({ key }) => key === 'sponsor')
  if (
    sponsorField?.required === true &&
    configuredPlatforms.some((platform) => policiesByPlatform?.[platform] === 'prohibited')
  ) {
    report(
      'incompatible_value',
      `${entryPath}.fields.${fields.indexOf(sponsorField)}.required`,
      `${prefix} no puede exigir auspiciador en una plataforma donde la imagen está prohibida.`
    )
  }
}

export function validateGuidelineForActivation(doc) {
  const draftValidation = validateGuidelineDraft(doc)
  if (!draftValidation.ok) return draftValidation
  const { errors, issues, report } = createValidationReporter()

  if (doc?.schemaVersion === GUIDELINES_SCHEMA_VERSION && !Array.isArray(doc.contentTypeCatalog)) {
    report(
      'required',
      'contentTypeCatalog',
      'contentTypeCatalog es obligatorio para activar esta versión de Guidelines.'
    )
    return {
      ok: false,
      errors,
      issues,
      document: clone(doc),
    }
  }

  const normalized = normalizeGuidelineDocumentV3(doc)
  if (doc.schemaVersion === GUIDELINES_SCHEMA_VERSION && !isPlainRecord(doc.platformLabels)) {
    report(
      'invalid_type',
      'platformLabels',
      'platformLabels debe ser un objeto de etiquetas de texto.'
    )
  }
  if (!nonEmptyText(normalized.global)) {
    report('required', 'global', 'La voz global es obligatoria.')
  }
  if (exceedsTextLimit(normalized.global, 20_000)) {
    report('max_length', 'global', 'La voz global admite hasta 20000 caracteres.')
  }
  if (!nonEmptyText(normalized.prohibited)) {
    report('required', 'prohibited', 'Las restricciones adicionales son obligatorias.')
  }
  if (!nonEmptyText(normalized.imageValidation)) {
    report('required', 'imageValidation', 'Las reglas de validación de imágenes son obligatorias.')
  }
  if (exceedsTextLimit(normalized.prohibited, 20_000)) {
    report(
      'max_length',
      'prohibited',
      'Las restricciones adicionales admiten hasta 20000 caracteres.'
    )
  }
  if (exceedsTextLimit(normalized.imageValidation, 20_000)) {
    report(
      'max_length',
      'imageValidation',
      'Las reglas de validación de imágenes admiten hasta 20000 caracteres.'
    )
  }

  const platformIds = Object.keys(normalized.platforms || {})
  const configuredPlatforms = platformIds
  if (!platformIds.length) {
    report('required', 'platforms', 'Debe existir al menos una plataforma.')
  }
  if (platformIds.length > MAX_GUIDELINE_PLATFORMS) {
    report(
      'max_length',
      'platforms',
      `Como máximo se admiten ${MAX_GUIDELINE_PLATFORMS} plataformas.`
    )
  }
  for (const id of platformIds) {
    if (!PLATFORM_ID_PATTERN.test(id)) {
      report(
        'invalid_value',
        `platforms.${id}`,
        `El identificador de plataforma "${id}" no es un slug válido.`
      )
    }
    if (!nonEmptyText(normalized.platforms[id])) {
      report(
        'required',
        `platforms.${id}`,
        `La plataforma "${id}" necesita expectativas de contenido.`
      )
    } else if (exceedsTextLimit(normalized.platforms[id], MAX_PLATFORM_EXPECTATION_LENGTH)) {
      report(
        'max_length',
        `platforms.${id}`,
        `Las expectativas de "${id}" admiten hasta ${MAX_PLATFORM_EXPECTATION_LENGTH} caracteres.`
      )
    }
    if (extractCaptionCharacterLimit(normalized.platforms[id]) !== null) {
      report(
        'duplicate_constraint',
        `platforms.${id}`,
        `Define el máximo de caracteres de "${id}" en su campo numérico, no dentro de las expectativas.`
      )
    }
    if (!nonEmptyText(normalized.platformLabels?.[id])) {
      report(
        'required',
        `platformLabels.${id}`,
        `La plataforma "${id}" necesita una etiqueta de texto.`
      )
    } else if (exceedsTextLimit(normalized.platformLabels[id], 100)) {
      report(
        'max_length',
        `platformLabels.${id}`,
        `La etiqueta de "${id}" admite hasta 100 caracteres.`
      )
    }
    const constraints = normalized.platformConstraints?.[id]
    if (!isPlainRecord(constraints)) {
      report(
        'invalid_type',
        `platformConstraints.${id}`,
        `Los límites de "${id}" deben ser una configuración válida.`
      )
    } else {
      const maxCharacters = constraints.captionMaxCharacters
      if (
        maxCharacters !== null &&
        maxCharacters !== undefined &&
        (!Number.isInteger(maxCharacters) || maxCharacters < 1 || maxCharacters > 20_000)
      ) {
        report(
          'invalid_value',
          `platformConstraints.${id}.captionMaxCharacters`,
          `El máximo de caracteres de "${id}" debe estar entre 1 y 20000, o quedar vacío.`
        )
      }
    }
  }
  if (!nonEmptyText(normalized.generation?.imagePrompt)) {
    report(
      'required',
      'generation.imagePrompt',
      'Las reglas de generación de imágenes son obligatorias.'
    )
  } else if (exceedsTextLimit(normalized.generation.imagePrompt, 20_000)) {
    report(
      'max_length',
      'generation.imagePrompt',
      'Las reglas de generación de imágenes admiten hasta 20000 caracteres.'
    )
  }

  const catalog = normalized.contentTypeCatalog
  if (!Array.isArray(catalog) || !catalog.length) {
    report('required', 'contentTypeCatalog', 'Debe existir al menos un tipo de contenido.')
    return { ok: false, errors, issues, document: normalized }
  }

  const ids = new Set()
  const labels = new Set()
  for (const [entryIndex, entry] of catalog.entries()) {
    const entryPath = `contentTypeCatalog.${entryIndex}`
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      report('invalid_type', entryPath, 'Cada tipo de contenido debe ser un objeto.')
      continue
    }
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(entry.id || '')) {
      report('invalid_id', `${entryPath}.id`, `El identificador "${entry.id || ''}" no es válido.`)
    } else if (ids.has(entry.id)) {
      report('duplicate_id', `${entryPath}.id`, `El identificador "${entry.id}" está duplicado.`)
    }
    ids.add(entry.id)

    if (!nonEmptyText(entry.label)) {
      report('required', `${entryPath}.label`, `El tipo "${entry.id}" necesita una etiqueta.`)
    } else if (exceedsTextLimit(entry.label, 160)) {
      report(
        'max_length',
        `${entryPath}.label`,
        `La etiqueta de "${entry.id}" admite hasta 160 caracteres.`
      )
    } else {
      const normalizedLabel = entry.label.trim().toLocaleLowerCase('es-PR')
      if (labels.has(normalizedLabel)) {
        report(
          'duplicate_label',
          `${entryPath}.label`,
          `Ya existe un tipo de contenido con el nombre "${entry.label.trim()}".`
        )
      }
      labels.add(normalizedLabel)
    }
    if (!['active', 'archived'].includes(entry.status)) {
      report(
        'invalid_value',
        `${entryPath}.status`,
        `El tipo "${entry.id}" usa un estado inválido.`
      )
    }
    if (!Array.isArray(entry.platforms) || !entry.platforms.length) {
      report(
        'required',
        `${entryPath}.platforms`,
        `El tipo "${entry.id}" debe publicarse al menos en una red.`
      )
    } else {
      const scopedPlatforms = new Set()
      for (const [platformIndex, platform] of entry.platforms.entries()) {
        const platformPath = `${entryPath}.platforms.${platformIndex}`
        if (!configuredPlatforms.includes(platform)) {
          report(
            'unsupported_platform',
            platformPath,
            `La red "${platform}" de "${entry.id}" no está configurada en Guidelines.`
          )
        } else if (scopedPlatforms.has(platform)) {
          report(
            'duplicate_platform',
            platformPath,
            `El tipo "${entry.id}" repite la red "${platform}".`
          )
        }
        scopedPlatforms.add(platform)
      }
      if (scopedPlatforms.has('instagram')) {
        if (entry.visual?.mode === 'none') {
          report(
            'instagram_requires_image',
            `${entryPath}.visual.mode`,
            `El tipo "${entry.id}" debe llevar imagen porque se publica en Instagram.`
          )
        }
        for (const platform of entry.platforms) {
          if (entry.visual?.imagePolicyByPlatform?.[platform] !== 'required') {
            report(
              'instagram_requires_image',
              `${entryPath}.visual.imagePolicyByPlatform.${platform}`,
              `La imagen de "${entry.id}" debe ser obligatoria en todo el paquete porque se publica en Instagram.`
            )
          }
        }
      }
    }
    if (!nonEmptyText(entry.description)) {
      report(
        'required',
        `${entryPath}.description`,
        `El tipo "${entry.id}" necesita un propósito social explícito.`
      )
    } else if (exceedsTextLimit(entry.description, 1_000)) {
      report(
        'max_length',
        `${entryPath}.description`,
        `El propósito social de "${entry.id}" admite hasta 1000 caracteres.`
      )
    }
    if (!Array.isArray(entry.fields) || !entry.fields.length) {
      report('required', `${entryPath}.fields`, `El tipo "${entry.id}" necesita al menos un campo.`)
    } else {
      const fieldKeys = new Set()
      for (const [fieldIndex, field] of entry.fields.entries()) {
        const fieldPath = `${entryPath}.fields.${fieldIndex}`
        if (!isPlainRecord(field)) {
          report('invalid_type', fieldPath, `Cada campo de "${entry.id}" debe ser un objeto.`)
          continue
        }
        if (!FIELD_LIBRARY[field?.key]) {
          report(
            'unsupported_field',
            `${fieldPath}.key`,
            `El tipo "${entry.id}" usa el campo no soportado "${field?.key || ''}".`
          )
        } else if (fieldKeys.has(field.key)) {
          report(
            'duplicate_field',
            `${fieldPath}.key`,
            `El tipo "${entry.id}" repite el campo "${field.key}".`
          )
        }
        fieldKeys.add(field?.key)
        if (!nonEmptyText(field?.label)) {
          report(
            'required',
            `${fieldPath}.label`,
            `El campo "${field?.key || ''}" de "${entry.id}" necesita etiqueta.`
          )
        } else if (exceedsTextLimit(field.label, 160)) {
          report(
            'max_length',
            `${fieldPath}.label`,
            `La etiqueta del campo "${field.key}" de "${entry.id}" admite hasta 160 caracteres.`
          )
        }
        for (const property of ['help', 'placeholder']) {
          if (typeof field[property] !== 'string') {
            report(
              'invalid_type',
              `${fieldPath}.${property}`,
              `El ${property} del campo "${field?.key || ''}" de "${entry.id}" debe ser texto.`
            )
          } else if (field[property].length > 500) {
            report(
              'max_length',
              `${fieldPath}.${property}`,
              `El ${property} del campo "${field.key}" de "${entry.id}" admite hasta 500 caracteres.`
            )
          }
        }
        if (typeof field?.required !== 'boolean') {
          report(
            'invalid_type',
            `${fieldPath}.required`,
            `El campo "${field?.key || ''}" de "${entry.id}" debe indicar required.`
          )
        }
      }
      if (!TITLE_SOURCES.includes(entry.titleSource)) {
        report(
          'invalid_value',
          `${entryPath}.titleSource`,
          `El tipo "${entry.id}" usa un titleSource inválido.`
        )
      } else if (entry.titleSource !== 'type_label' && !fieldKeys.has(entry.titleSource)) {
        report(
          'incompatible_value',
          `${entryPath}.titleSource`,
          `El titleSource de "${entry.id}" no corresponde a un campo seleccionado.`
        )
      } else if (
        entry.titleSource !== 'type_label' &&
        entry.fields.find((field) => field?.key === entry.titleSource)?.required !== true
      ) {
        report(
          'incompatible_value',
          `${entryPath}.titleSource`,
          `El titleSource de "${entry.id}" debe ser un campo requerido.`
        )
      }
    }
    if (!nonEmptyText(entry.validation?.rules)) {
      report(
        'required',
        `${entryPath}.validation.rules`,
        `El tipo "${entry.id}" necesita reglas de validación.`
      )
    } else if (exceedsTextLimit(entry.validation.rules, 20_000)) {
      report(
        'max_length',
        `${entryPath}.validation.rules`,
        `Las reglas de validación de "${entry.id}" admiten hasta 20000 caracteres.`
      )
    }
    if (!nonEmptyText(entry.generation?.rules)) {
      report(
        'required',
        `${entryPath}.generation.rules`,
        `El tipo "${entry.id}" necesita reglas de generación.`
      )
    } else if (exceedsTextLimit(entry.generation.rules, 20_000)) {
      report(
        'max_length',
        `${entryPath}.generation.rules`,
        `Las reglas de generación de "${entry.id}" admiten hasta 20000 caracteres.`
      )
    }
    validateVisual(entry, report, configuredPlatforms, entryPath)
  }
  if (!catalog.some(({ status }) => status === 'active')) {
    report('required', 'contentTypeCatalog', 'Debe existir al menos un tipo de contenido activo.')
  }

  for (const contradiction of findGuidelinePolicyContradictions(normalized)) {
    report(contradiction.code, 'global', contradiction.message)
  }

  return { ok: errors.length === 0, errors, issues, document: normalized }
}

export function listContentTypeDefinitions(doc, { includeArchived = false } = {}) {
  const normalized = normalizeGuidelineDocumentV3(doc)
  const catalog = Array.isArray(normalized?.contentTypeCatalog) ? normalized.contentTypeCatalog : []
  return includeArchived ? catalog : catalog.filter(({ status }) => status === 'active')
}

export function resolveContentTypePlatforms(definition, configuredPlatforms = []) {
  const available = Array.isArray(configuredPlatforms) ? configuredPlatforms : []
  if (!definition || !Array.isArray(definition.platforms)) return [...available]
  if (!available.length) return [...definition.platforms]
  const allowed = new Set(available)
  return definition.platforms.filter((platform) => allowed.has(platform))
}

export function resolveContentTypeDefinition(doc, id, { includeArchived = false } = {}) {
  return (
    listContentTypeDefinitions(doc, { includeArchived }).find((entry) => entry.id === id) || null
  )
}

function uniqueId(base, ids) {
  const normalized =
    String(base || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'content_type'
  const prefixed = /^[a-z]/.test(normalized) ? normalized : `type_${normalized}`
  const baseCandidate = (prefixed.length < 2 ? `${prefixed}_type` : prefixed)
    .slice(0, 64)
    .replace(/_+$/g, '')
  let candidate = baseCandidate
  let suffix = 2
  while (ids.has(candidate)) {
    const suffixText = `_${suffix}`
    candidate = `${baseCandidate.slice(0, 64 - suffixText.length).replace(/_+$/g, '')}${suffixText}`
    suffix += 1
  }
  return candidate
}

export function createContentType(doc, { id, label = 'Nuevo tipo' } = {}) {
  const normalized = normalizeGuidelineDocumentV3(doc)
  const platformIds = Object.keys(normalized.platforms || {})
  const ids = new Set(normalized.contentTypeCatalog.map((entry) => entry.id))
  const nextId = uniqueId(id || label, ids)
  const shape = seedShape(nextId, platformIds)
  return {
    ...normalized,
    contentTypeCatalog: [
      ...normalized.contentTypeCatalog,
      {
        id: nextId,
        label,
        status: 'active',
        platforms: [...platformIds],
        description: '',
        fields: shape.fields,
        titleSource: shape.titleSource,
        validation: { rules: '' },
        generation: { rules: '' },
        visual: shape.visual,
      },
    ],
  }
}

export function duplicateContentType(doc, sourceId, { id, label, archiveOriginal = false } = {}) {
  const normalized = normalizeGuidelineDocumentV3(doc)
  const source = normalized.contentTypeCatalog.find((entry) => entry.id === sourceId)
  if (!source) throw new Error('Tipo de contenido no encontrado.')
  const ids = new Set(normalized.contentTypeCatalog.map((entry) => entry.id))
  const nextId = uniqueId(id || `${source.id}_copy`, ids)
  const catalog = normalized.contentTypeCatalog.map((entry) =>
    archiveOriginal && entry.id === sourceId ? { ...entry, status: 'archived' } : entry
  )
  catalog.push({
    ...clone(source),
    id: nextId,
    label: label || `${source.label} (nuevo)`,
    status: 'active',
  })
  return { ...normalized, contentTypeCatalog: catalog }
}

export function moveContentType(doc, id, direction) {
  const normalized = normalizeGuidelineDocumentV3(doc)
  const catalog = [...normalized.contentTypeCatalog]
  const index = catalog.findIndex((entry) => entry.id === id)
  if (index < 0) return normalized
  const target =
    typeof direction === 'number' && Math.abs(direction) > 1
      ? Math.max(0, Math.min(catalog.length - 1, direction))
      : Math.max(0, Math.min(catalog.length - 1, index + (direction === 'up' ? -1 : 1)))
  if (target === index) return normalized
  const [entry] = catalog.splice(index, 1)
  catalog.splice(target, 0, entry)
  return { ...normalized, contentTypeCatalog: catalog }
}

export function setContentTypeStatus(doc, id, status) {
  if (!['active', 'archived'].includes(status)) throw new Error('Estado inválido.')
  const normalized = normalizeGuidelineDocumentV3(doc)
  return {
    ...normalized,
    contentTypeCatalog: normalized.contentTypeCatalog.map((entry) =>
      entry.id === id ? { ...entry, status } : entry
    ),
  }
}

export function diffGuidelineDocuments(active, draft) {
  const before = normalizeGuidelineDocumentV3(active)
  const after = normalizeGuidelineDocumentV3(draft)
  const beforeById = new Map((before?.contentTypeCatalog || []).map((entry) => [entry.id, entry]))
  const afterById = new Map((after?.contentTypeCatalog || []).map((entry) => [entry.id, entry]))
  const created = []
  const archived = []
  const removed = []
  const restored = []
  const changed = []

  for (const entry of after?.contentTypeCatalog || []) {
    const previous = beforeById.get(entry.id)
    if (!previous) created.push({ id: entry.id, label: entry.label })
    else {
      if (previous.status !== 'archived' && entry.status === 'archived') {
        archived.push({ id: entry.id, label: entry.label })
      }
      if (previous.status === 'archived' && entry.status === 'active') {
        restored.push({ id: entry.id, label: entry.label })
      }
      if (JSON.stringify(previous) !== JSON.stringify(entry)) {
        changed.push({ id: entry.id, label: entry.label })
      }
    }
  }

  const beforeOrder = [...beforeById.keys()].filter((id) => afterById.has(id))
  const afterOrder = (after?.contentTypeCatalog || [])
    .map(({ id }) => id)
    .filter((id) => beforeById.has(id))
  const reordered = JSON.stringify(beforeOrder) !== JSON.stringify(afterOrder)

  for (const entry of before?.contentTypeCatalog || []) {
    if (!afterById.has(entry.id)) removed.push({ id: entry.id, label: entry.label })
  }

  return { created, archived, removed, restored, changed, reordered }
}

function sameValue(before, after) {
  return JSON.stringify(before) === JSON.stringify(after)
}

function changeKind(before, after) {
  if (before === undefined && after !== undefined) return 'added'
  if (before !== undefined && after === undefined) return 'removed'
  return 'updated'
}

function summarySection({ key, label, section, path, items }) {
  return {
    key,
    label,
    section,
    path,
    changed: items.length > 0,
    count: items.length,
    items,
  }
}

/**
 * Human-oriented activation summary. Unlike `diffGuidelineDocuments`, which is
 * retained for content-type audit consumers, this groups every editable area
 * by the sections shown in the Guidelines review UI.
 */
export function summarizeGuidelineDocumentChanges(active, draft) {
  const before = normalizeGuidelineDocumentV3(active) || {}
  const after = normalizeGuidelineDocumentV3(draft) || {}
  const beforeCatalog = Array.isArray(before.contentTypeCatalog) ? before.contentTypeCatalog : []
  const afterCatalog = Array.isArray(after.contentTypeCatalog) ? after.contentTypeCatalog : []
  const beforeById = new Map(beforeCatalog.map((entry, index) => [entry.id, { entry, index }]))
  const afterById = new Map(afterCatalog.map((entry, index) => [entry.id, { entry, index }]))

  const typeFieldLabels = {
    label: 'Nombre',
    status: 'Estado',
    platforms: 'Redes',
    description: 'Descripción',
    fields: 'Campos',
    titleSource: 'Título',
    validation: 'Asistente · Validar',
    generation: 'Asistente · Generar',
  }
  const contentTypeItems = []

  for (const [id, { entry, index }] of afterById) {
    const previous = beforeById.get(id)?.entry
    const path = `contentTypeCatalog.${index}`
    if (!previous) {
      contentTypeItems.push({
        id,
        label: entry.label || id,
        kind: 'created',
        section: 'types',
        path,
        fields: [],
      })
      continue
    }

    const changedFields = Object.keys(typeFieldLabels)
      .filter((field) => !sameValue(previous[field], entry[field]))
      .map((field) => ({
        key: field,
        label: typeFieldLabels[field],
        path: `${path}.${field}`,
      }))
    if (!changedFields.length) continue

    const kind =
      previous.status !== 'archived' && entry.status === 'archived'
        ? 'archived'
        : previous.status === 'archived' && entry.status === 'active'
          ? 'restored'
          : 'updated'
    contentTypeItems.push({
      id,
      label: entry.label || previous.label || id,
      kind,
      section: 'types',
      path,
      fields: changedFields,
    })
  }

  for (const [id, { entry, index }] of beforeById) {
    if (!afterById.has(id)) {
      contentTypeItems.push({
        id,
        label: entry.label || id,
        kind: 'removed',
        section: 'types',
        path: `contentTypeCatalog.${index}`,
        fields: [],
      })
    }
  }

  const legacyTypeDiff = diffGuidelineDocuments(before, after)
  if (legacyTypeDiff.reordered) {
    contentTypeItems.push({
      id: null,
      label: 'Orden de los tipos de contenido',
      kind: 'reordered',
      section: 'types',
      path: 'contentTypeCatalog',
      fields: [],
    })
  }

  const generalRules = [
    { key: 'global', label: 'Voz y tono general', path: 'global' },
    { key: 'prohibited', label: 'Restricciones adicionales', path: 'prohibited' },
  ]
  const generalItems = generalRules
    .filter(({ key }) => {
      const beforeValue = before[key]
      const afterValue = after[key]
      return !sameValue(beforeValue, afterValue)
    })
    .map(({ key, label, path }) => {
      const beforeValue = before[key]
      const afterValue = after[key]
      return {
        key,
        label,
        kind: changeKind(beforeValue, afterValue),
        section: 'general',
        path,
      }
    })

  const platformIds = [
    ...new Set([
      ...Object.keys(before.platforms || {}),
      ...Object.keys(before.platformLabels || {}),
      ...Object.keys(before.platformConstraints || {}),
      ...Object.keys(after.platforms || {}),
      ...Object.keys(after.platformLabels || {}),
      ...Object.keys(after.platformConstraints || {}),
    ]),
  ]
  const platformItems = platformIds.flatMap((id) => {
    const fields = [
      {
        key: 'label',
        label: 'Nombre',
        path: `platformLabels.${id}`,
        before: before.platformLabels?.[id],
        after: after.platformLabels?.[id],
      },
      {
        key: 'captionMaxCharacters',
        label: 'Máximo de caracteres',
        path: `platformConstraints.${id}.captionMaxCharacters`,
        before: before.platformConstraints?.[id]?.captionMaxCharacters,
        after: after.platformConstraints?.[id]?.captionMaxCharacters,
      },
      {
        key: 'expectations',
        label: 'Qué debe cumplir el contenido',
        path: `platforms.${id}`,
        before: before.platforms?.[id],
        after: after.platforms?.[id],
      },
    ]
      .filter((field) => !sameValue(field.before, field.after))
      .map(({ before: _before, after: _after, ...field }) => field)
    if (!fields.length) return []

    const existedBefore = [
      before.platforms?.[id],
      before.platformLabels?.[id],
      before.platformConstraints?.[id],
    ].some((value) => value !== undefined)
    const existsAfter = [
      after.platforms?.[id],
      after.platformLabels?.[id],
      after.platformConstraints?.[id],
    ].some((value) => value !== undefined)
    return [
      {
        id,
        label:
          after.platformLabels?.[id] ||
          before.platformLabels?.[id] ||
          DEFAULT_SEED_PLATFORM_LABELS[id] ||
          id,
        kind: !existedBefore ? 'added' : !existsAfter ? 'removed' : 'updated',
        section: 'platforms',
        path: `platforms.${id}`,
        fields,
      },
    ]
  })

  const imageItems = [
    {
      key: 'imageValidation',
      label: 'Reglas al validar imágenes',
      section: 'general',
      path: 'imageValidation',
      before: before.imageValidation,
      after: after.imageValidation,
    },
    {
      key: 'generation.imagePrompt',
      label: 'Reglas al generar imágenes',
      section: 'general',
      path: 'generation.imagePrompt',
      before: before.generation?.imagePrompt,
      after: after.generation?.imagePrompt,
    },
  ]
    .filter((item) => !sameValue(item.before, item.after))
    .map(({ before: beforeValue, after: afterValue, ...item }) => ({
      ...item,
      kind: changeKind(beforeValue, afterValue),
    }))

  for (const [id, { entry, index }] of afterById) {
    const previous = beforeById.get(id)?.entry
    if (previous && !sameValue(previous.visual, entry.visual)) {
      imageItems.push({
        id,
        key: `contentTypeCatalog.${id}.visual`,
        label: `Imagen de ${entry.label || previous.label || id}`,
        kind: 'updated',
        section: 'types',
        path: `contentTypeCatalog.${index}.visual`,
      })
    }
  }

  const contentTypes = summarySection({
    key: 'contentTypes',
    label: 'Tipos de contenido',
    section: 'types',
    path: 'contentTypeCatalog',
    items: contentTypeItems,
  })
  const general = summarySection({
    key: 'generalRules',
    label: 'Reglas generales',
    section: 'general',
    path: 'global',
    items: generalItems,
  })
  const platforms = summarySection({
    key: 'platforms',
    label: 'Redes sociales',
    section: 'platforms',
    path: 'platforms',
    items: platformItems,
  })
  const images = summarySection({
    key: 'images',
    label: 'Imágenes',
    section: 'general',
    path: 'imageValidation',
    items: imageItems,
  })
  const totalChanges = contentTypes.count + general.count + platforms.count + images.count

  return {
    hasChanges: totalChanges > 0,
    totalChanges,
    contentTypes,
    generalRules: general,
    platforms,
    images,
    contentTypeDiff: legacyTypeDiff,
  }
}
