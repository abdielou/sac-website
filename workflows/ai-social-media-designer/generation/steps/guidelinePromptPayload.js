/**
 * Keep one lossless copy of every relevant pinned rule without repeating the
 * full resolved guideline bundle once per platform. The previous shape could
 * bury the visual brief in thousands of duplicated characters.
 */
export function buildPinnedGuidelinePromptPayload(guidelines = {}) {
  const platformEntries = Object.entries(guidelines.platforms || {})
  const representative = platformEntries.find(
    ([, value]) => value && typeof value === 'object'
  )?.[1]
  const platforms = Object.fromEntries(
    platformEntries.map(([platform, value]) => [
      platform,
      value && typeof value === 'object'
        ? {
            rules: value.platform,
            captionMaxCharacters: value.captionMaxCharacters ?? null,
          }
        : value,
    ])
  )

  return {
    version: guidelines.version,
    policyVersion: guidelines.policyVersion,
    contentTypeIdentity: guidelines.contentTypeIdentity || representative?.contentTypeIdentity,
    contentTypeDefinition:
      guidelines.contentTypeDefinition || representative?.contentTypeDefinition,
    global: representative?.global,
    prohibited: representative?.prohibited,
    imagePrompt: representative?.imagePrompt,
    platforms,
  }
}
