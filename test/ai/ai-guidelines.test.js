import {
  getActiveGuidelines,
  getDefaultGuidelines,
  resolveGuidelinesForRequest,
} from '../../lib/ai-guidelines'

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

  test('getActiveGuidelines returns version and platform rules', async () => {
    const guidelines = await getActiveGuidelines()
    expect(guidelines.version).toBe('mvp-default-v1')
    expect(guidelines.global).toContain('Español')
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

  test('resolveGuidelinesForRequest merges platform and content type', async () => {
    const resolved = await resolveGuidelinesForRequest({
      platform: 'instagram',
      contentType: 'event_promotion',
    })
    expect(resolved.version).toBe('mvp-default-v1')
    expect(resolved.global).toContain('Español')
    expect(resolved.platform).toContain('Instagram')
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
})
