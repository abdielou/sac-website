import { AI_BASE_POLICY_VERSION } from '../../../../lib/ai-agent'
import { contentDataToLegacyInput } from '../../../../lib/ai-content-data'
import { GenerateInputSchema } from '../../../../lib/ai-generation-schemas'
import { resolveGenerationGuidelinesFromDocument } from '../../../../lib/ai-guidelines'
import { getGuidelineVersion } from '../../../../lib/guidelines-store'

export async function validatePayloadStep(input) {
  'use step'
  const parsed = GenerateInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'Input inválido (schema)',
    }
  }

  return { ok: true, value: parsed.data }
}

export async function loadGuidelinesStep(input) {
  'use step'
  try {
    const document = await getGuidelineVersion(input.guidelineVersion)
    if (!document || document.version !== input.guidelineVersion) {
      return { ok: false, reason: 'guideline_version_unavailable' }
    }
    if (
      input.platforms.some(
        (platform) => !Object.prototype.hasOwnProperty.call(document.platforms || {}, platform)
      )
    ) {
      return { ok: false, reason: 'platform_unavailable' }
    }

    const byPlatform = {}
    for (const platform of input.platforms) {
      byPlatform[platform] = resolveGenerationGuidelinesFromDocument(document, {
        platform,
        contentType: input.contentType,
      })
    }

    const resolved = byPlatform[input.platforms[0]]
    const definition = resolved?.contentTypeDefinition
    if (!definition || definition.status !== 'active') {
      return { ok: false, reason: 'content_type_unavailable' }
    }
    if (
      input.policyVersion !== AI_BASE_POLICY_VERSION ||
      input.contentTypeIdentity?.id !== definition.id ||
      input.contentTypeIdentity?.label !== definition.label ||
      input.contentTypeIdentity?.guidelineVersion !== document.version
    ) {
      return { ok: false, reason: 'pinned_identity_mismatch' }
    }

    const exactInputResult = GenerateInputSchema.safeParse({
      ...input,
      contentTypeDefinition: definition,
      contentTypeIdentity: resolved.contentTypeIdentity,
    })
    if (!exactInputResult.success) {
      return { ok: false, reason: 'pinned_definition_mismatch' }
    }
    const normalizedLegacyInput = contentDataToLegacyInput(
      exactInputResult.data.contentData,
      definition
    )

    return {
      ok: true,
      version: document.version,
      policyVersion: AI_BASE_POLICY_VERSION,
      contentTypeDefinition: definition,
      contentTypeIdentity: resolved.contentTypeIdentity,
      input: {
        ...exactInputResult.data,
        ...normalizedLegacyInput,
        contentTypeDefinition: definition,
        contentTypeIdentity: resolved.contentTypeIdentity,
      },
      platforms: byPlatform,
    }
  } catch (error) {
    console.error('generateAiWorkflow: failed to load pinned guidelines', error)
    return { ok: false, reason: 'guideline_version_unavailable' }
  }
}
