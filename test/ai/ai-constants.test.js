import {
  PLATFORMS,
  CONTENT_TYPES,
  PLATFORM_LABELS,
  CONTENT_TYPE_LABELS,
  IMAGE_CONTENT_TYPES,
  PLATFORM_MEDIA_POSTURE,
  contentTypeAcceptsImages,
  contentTypeRequiresImages,
  shouldGenerateImagePrompt,
} from '../../lib/ai-constants'

describe('ai-constants', () => {
  test('PLATFORMS includes x, instagram, facebook', () => {
    expect(PLATFORMS).toEqual(['x', 'instagram', 'facebook'])
    for (const p of PLATFORMS) {
      expect(PLATFORM_LABELS[p]).toBeTruthy()
    }
  })

  test('CONTENT_TYPES has labels for every type', () => {
    expect(CONTENT_TYPES.length).toBeGreaterThan(0)
    for (const ct of CONTENT_TYPES) {
      expect(CONTENT_TYPE_LABELS[ct]).toBeTruthy()
    }
  })

  test('IMAGE_CONTENT_TYPES is subset of CONTENT_TYPES', () => {
    for (const ct of IMAGE_CONTENT_TYPES) {
      expect(CONTENT_TYPES).toContain(ct)
    }
    expect(IMAGE_CONTENT_TYPES).toContain('image_post')
    expect(IMAGE_CONTENT_TYPES).toContain('carousel')
  })

  test('every platform has a media posture', () => {
    for (const p of PLATFORMS) {
      expect(['text_first', 'image_first', 'mixed']).toContain(PLATFORM_MEDIA_POSTURE[p])
    }
  })

  test('intrinsic image types accept images on any platform and do not require them', () => {
    for (const platform of PLATFORMS) {
      for (const contentType of IMAGE_CONTENT_TYPES) {
        expect(contentTypeAcceptsImages(platform, contentType)).toBe(true)
        expect(contentTypeRequiresImages(platform, contentType)).toBe(false)
      }
    }
  })

  test('instagram regular_post accepts and requires images (image_first)', () => {
    expect(contentTypeAcceptsImages('instagram', 'regular_post')).toBe(true)
    expect(contentTypeRequiresImages('instagram', 'regular_post')).toBe(true)
  })

  test('facebook regular_post accepts images but does not require them (mixed)', () => {
    expect(contentTypeAcceptsImages('facebook', 'regular_post')).toBe(true)
    expect(contentTypeRequiresImages('facebook', 'regular_post')).toBe(false)
  })

  test('x regular_post neither accepts nor requires images (text_first)', () => {
    expect(contentTypeAcceptsImages('x', 'regular_post')).toBe(false)
    expect(contentTypeRequiresImages('x', 'regular_post')).toBe(false)
  })

  test('non-visual content types do not accept images', () => {
    for (const platform of PLATFORMS) {
      expect(contentTypeAcceptsImages(platform, 'caption')).toBe(false)
      expect(contentTypeRequiresImages(platform, 'caption')).toBe(false)
      expect(contentTypeAcceptsImages(platform, 'reel_caption')).toBe(false)
      expect(contentTypeRequiresImages(platform, 'reel_caption')).toBe(false)
    }
  })

  test('shouldGenerateImagePrompt skips reel captions and defaults on for others', () => {
    expect(shouldGenerateImagePrompt('reel_caption')).toBe(false)
    expect(shouldGenerateImagePrompt('regular_post')).toBe(true)
  })
})
