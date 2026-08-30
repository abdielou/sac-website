export const GUIDELINE_VERSION_NAME_MAX_LENGTH = 80
const GUIDELINE_VERSION_NAME_MIN_LENGTH = 3

export function normalizeGuidelineVersionName(value) {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim()
}

export function validateGuidelineVersionName(value) {
  const versionName = normalizeGuidelineVersionName(value)

  if (!versionName) {
    return { ok: false, versionName, error: 'Escribe un nombre para esta versión.' }
  }
  if (versionName.length < GUIDELINE_VERSION_NAME_MIN_LENGTH) {
    return {
      ok: false,
      versionName,
      error: `El nombre debe tener al menos ${GUIDELINE_VERSION_NAME_MIN_LENGTH} caracteres.`,
    }
  }
  if (versionName.length > GUIDELINE_VERSION_NAME_MAX_LENGTH) {
    return {
      ok: false,
      versionName,
      error: `El nombre no puede superar ${GUIDELINE_VERSION_NAME_MAX_LENGTH} caracteres.`,
    }
  }

  return { ok: true, versionName, error: null }
}

function shortened(value) {
  const normalized = normalizeGuidelineVersionName(value)
  if (normalized.length <= GUIDELINE_VERSION_NAME_MAX_LENGTH) return normalized
  return `${normalized.slice(0, GUIDELINE_VERSION_NAME_MAX_LENGTH - 1).trimEnd()}…`
}

export function suggestGuidelineVersionName(summary) {
  const changedSections = ['platforms', 'contentTypes', 'generalRules', 'images']
    .map((key) => summary?.[key])
    .filter((section) => section?.changed)

  if (changedSections.length !== 1) return 'Actualización de guías'

  const [section] = changedSections
  if (section.items?.length === 1) {
    const itemLabel = section.items[0]?.label
    if (itemLabel) {
      if (section.key === 'platforms') return shortened(`Ajustes para ${itemLabel}`)
      if (section.key === 'contentTypes') return shortened(`Ajustes de ${itemLabel}`)
      return shortened(`Actualización de ${itemLabel}`)
    }
  }

  return shortened(`Actualización de ${String(section.label || 'guías').toLowerCase()}`)
}
