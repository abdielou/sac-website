import { getActiveGuidelines, getDefaultGuidelines, resolveGuidelinesForRequest } from '../../lib/ai-guidelines'

describe('ai-guidelines', () => {
  test('getActiveGuidelines returns version and platform rules', () => {
    const guidelines = getActiveGuidelines()
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

  test('getDefaultGuidelines matches getActiveGuidelines stub', () => {
    expect(getDefaultGuidelines()).toEqual(getActiveGuidelines())
  })

  test('resolveGuidelinesForRequest merges platform and content type', () => {
    const resolved = resolveGuidelinesForRequest({
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

  test('resolveGuidelinesForRequest handles unknown platform', () => {
    const resolved = resolveGuidelinesForRequest({
      platform: 'unknown',
      contentType: 'regular_post',
    })
    expect(resolved.platform).toContain('generales')
  })
})
