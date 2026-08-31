import { AI_AGENT_IDENTITY_PROMPT, AI_AGENT_IDENTITY_VERSION } from './ai-agent'
import { normalizeGuidelineDocumentV3, resolveContentTypeDefinition } from './ai-guidelines-schema'
import defaultGuidelinesDocument from '@/data/guidelines/default-v1.json'

export const DEFAULT_VERSION = 'default-v1'

function cloneDocument(doc) {
  return JSON.parse(JSON.stringify(doc))
}

/**
 * Default guidelines seed (server stub and empty-bucket bootstrap).
 * Content is frozen from the current production-ready baseline.
 */
export function getDefaultGuidelines() {
  const snapshot = cloneDocument(defaultGuidelinesDocument)
  snapshot.version = DEFAULT_VERSION
  return normalizeGuidelineDocumentV3(snapshot)
}

/**
 * Active guidelines from S3-backed guidelines-store (falls back to defaults).
 * Dynamic import avoids a circular dependency with guidelines-store.
 */
export async function getActiveGuidelines() {
  const store = await import('./guidelines-store')
  return store.getActiveGuidelines()
}

/**
 * Runtime variant: a configured store failure must stop a new AI execution
 * instead of silently pinning the built-in seed.
 */
export async function getActiveGuidelinesStrict() {
  const store = await import('./guidelines-store')
  return store.getActiveGuidelinesStrict()
}

/**
 * Resolve platform + content-type rules for a validation/generation request
 * from one immutable guidelines snapshot.
 */
export function resolveGuidelinesFromDocument(activeDocument, { platform, contentType }) {
  const active = normalizeGuidelineDocumentV3(activeDocument)
  const platformKey = String(platform || '').toLowerCase()
  const platformRules = active.platforms[platformKey] || 'Reglas generales de plataforma.'
  const definition = resolveContentTypeDefinition(active, contentType, { includeArchived: true })
  const contentTypeLabel = definition?.label || contentType
  const contentTypeRules =
    definition?.validation?.rules ||
    active.contentTypes?.[contentType] ||
    `Tipo de contenido: ${contentTypeLabel}. Aplica reglas mínimas de completitud según el tipo.`

  return {
    version: active.version,
    policyVersion: AI_AGENT_IDENTITY_VERSION,
    basePolicy: AI_AGENT_IDENTITY_PROMPT,
    global: active.global,
    platform: platformRules,
    captionMaxCharacters: active.platformConstraints?.[platformKey]?.captionMaxCharacters ?? null,
    contentType: contentTypeRules,
    prohibited: active.prohibited,
    imageValidation: active.imageValidation,
    contentTypeDefinition: definition,
    contentTypeIdentity: definition
      ? { id: definition.id, label: definition.label, guidelineVersion: active.version }
      : null,
  }
}

/**
 * Resolve generation-oriented (drafting) rules from one immutable snapshot.
 * Same fallback pattern as `resolveGuidelinesFromDocument`, but reads the
 * `generation` section. Workflows use this to keep every platform on the
 * same guidelines version.
 */
export function resolveGenerationGuidelinesFromDocument(active, { platform, contentType }) {
  active = normalizeGuidelineDocumentV3(active)
  const generation = active.generation || { contentTypes: {} }
  const platformKey = String(platform || '').toLowerCase()
  const platformRules = active.platforms[platformKey] || 'Expectativas generales de plataforma.'
  const definition = resolveContentTypeDefinition(active, contentType, { includeArchived: true })
  const contentTypeLabel = definition?.label || contentType
  const contentTypeRules =
    definition?.generation?.rules ||
    generation.contentTypes?.[contentType] ||
    `Tipo de contenido: ${contentTypeLabel}. Redactar fiel a los datos provistos, sin inventar detalles.`
  const defaultImagePrompt = getDefaultGuidelines().generation?.imagePrompt || ''

  return {
    version: active.version,
    policyVersion: AI_AGENT_IDENTITY_VERSION,
    basePolicy: AI_AGENT_IDENTITY_PROMPT,
    // Operational generation behavior belongs to the workflow prompt and guardrails.
    global: active.global,
    platform: platformRules,
    captionMaxCharacters: active.platformConstraints?.[platformKey]?.captionMaxCharacters ?? null,
    contentType: contentTypeRules,
    prohibited: active.prohibited,
    imagePrompt: generation.imagePrompt || defaultImagePrompt,
    imageValidation: active.imageValidation,
    contentTypeDefinition: definition,
    contentTypeIdentity: definition
      ? { id: definition.id, label: definition.label, guidelineVersion: active.version }
      : null,
  }
}
