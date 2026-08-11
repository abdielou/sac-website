import {
  getActiveGuidelines,
  getDefaultGuidelines,
  resolveGenerationGuidelinesFromDocument,
  resolveGenerationGuidelinesForRequest,
  resolveGuidelinesForRequest,
} from '../../lib/ai-guidelines'
import defaultGuidelinesDocument from '../../data/guidelines/default-v1.json'

describe('ai-guidelines', () => {
  const originalBucket = process.env.S3_ARTICLES_BUCKET_NAME

  beforeAll(() => {
    // Force defaults path for unit tests of resolvers.
    delete process.env.S3_ARTICLES_BUCKET_NAME
  })

  afterAll(() => {
    if (originalBucket === undefined) {
      delete process.env.S3_ARTICLES_BUCKET_NAME
    } else {
      process.env.S3_ARTICLES_BUCKET_NAME = originalBucket
    }
  })

  test('getDefaultGuidelines clones the frozen production default snapshot', () => {
    const guidelines = getDefaultGuidelines()
    expect(guidelines.version).toBe('default-v1')
    expect(guidelines.schemaVersion).toBe(3)
    expect(guidelines).toEqual({
      ...JSON.parse(JSON.stringify(defaultGuidelinesDocument)),
      version: 'default-v1',
    })
    guidelines.global = 'mutated'
    expect(defaultGuidelinesDocument.global).not.toBe('mutated')
  })

  test('getActiveGuidelines returns version and platform rules', async () => {
    const guidelines = await getActiveGuidelines()
    expect(guidelines.version).toBe('default-v1')
    expect(guidelines.global).toMatch(/español/i)
    expect(guidelines.platforms.x).toBeTruthy()
    expect(guidelines.platforms.instagram).toBeTruthy()
    expect(guidelines.platforms.facebook).toBeTruthy()
    expect(guidelines.platformLabels.x).toBe('X')
    expect(guidelines.platformLabels.instagram).toBe('Instagram')
    expect(guidelines.platformLabels.facebook).toBe('Facebook')
    expect(guidelines.prohibited).toBeTruthy()
    expect(guidelines.imageValidation).toBeTruthy()
  })

  test('getDefaultGuidelines matches getActiveGuidelines without bucket', async () => {
    expect(getDefaultGuidelines()).toEqual(await getActiveGuidelines())
  })

  test('keeps editable instructions in plain language without system field names', () => {
    const guidelines = getDefaultGuidelines()
    const editableInstructions = [
      guidelines.global,
      guidelines.prohibited,
      guidelines.imageValidation,
      guidelines.generation.imagePrompt,
      ...Object.values(guidelines.contentTypes),
      ...Object.values(guidelines.generation.contentTypes),
    ].join('\n')

    expect(editableInstructions).not.toMatch(
      /uncertainty_factual_risk|humanReviewRequired|missingInformation|assumptions|imageRationale|completeness/
    )
    expect(guidelines.generation.global).toBe(guidelines.global)
  })

  test('resolveGuidelinesForRequest merges platform and content type', async () => {
    const resolved = await resolveGuidelinesForRequest({
      platform: 'instagram',
      contentType: 'event_promotion',
    })
    expect(resolved.version).toBe('default-v1')
    expect(resolved.global).toMatch(/español/i)
    expect(resolved.platform).toBe(getDefaultGuidelines().platforms.instagram)
    expect(resolved.contentType).toContain('evento')
    expect(resolved.prohibited).toBeTruthy()
    expect(resolved.imageValidation).toBeTruthy()
  })

  test('resolveGuidelinesForRequest handles unknown platform', async () => {
    const resolved = await resolveGuidelinesForRequest({
      platform: 'unknown',
      contentType: 'regular_post',
    })
    expect(resolved.platform).toContain('generales')
  })

  test('generation and validation use the exact same platform expectation', async () => {
    const request = { platform: 'facebook', contentType: 'event_promotion' }
    const [validation, generation] = await Promise.all([
      resolveGuidelinesForRequest(request),
      resolveGenerationGuidelinesForRequest(request),
    ])

    expect(generation.platform).toBe(validation.platform)
    expect(generation.captionMaxCharacters).toBe(validation.captionMaxCharacters)
  })

  test('generation uses voice once and ignores the retired legacy generation field', async () => {
    const document = getDefaultGuidelines()
    document.generation.global = 'LEGACY_GENERATION_RULE_SHOULD_NOT_APPEAR'

    const resolved = await resolveGenerationGuidelinesForRequest({
      platform: 'facebook',
      contentType: 'regular_post',
    })
    const legacyResolved = resolveGenerationGuidelinesFromDocument(document, {
      platform: 'facebook',
      contentType: 'regular_post',
    })

    expect(resolved.global).toBe(getDefaultGuidelines().global)
    expect(legacyResolved.global).toBe(document.global)
    expect(legacyResolved.global).not.toContain('LEGACY_GENERATION_RULE_SHOULD_NOT_APPEAR')
  })
})
