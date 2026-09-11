import {
  DEFAULT_SEED_PLATFORMS,
  DEFAULT_SEED_PLATFORM_LABELS,
  contentTypeAcceptsImages,
  contentTypeRequiresEventCta,
  contentTypeRequiresImages,
  getCanonicalEventName,
  isEventContentType,
  shouldGenerateImagePrompt,
} from '../../lib/ai-constants'

const definition = ({
  fields = [{ key: 'topic', required: true }],
  titleSource = 'topic',
  mode = 'ai_image',
  template = null,
  policies = { x: 'optional', instagram: 'optional', facebook: 'prohibited' },
} = {}) => ({
  id: 'configured_type',
  label: 'Tipo configurado',
  fields,
  titleSource,
  visual: { mode, template, imagePolicyByPlatform: policies },
})

describe('ai-constants', () => {
  test('DEFAULT_SEED_PLATFORMS describes only the initial Guidelines seed', () => {
    expect(DEFAULT_SEED_PLATFORMS).toEqual(['x', 'instagram', 'facebook'])
    for (const platform of DEFAULT_SEED_PLATFORMS) {
      expect(DEFAULT_SEED_PLATFORM_LABELS[platform]).toBeTruthy()
    }
  })

  test('content type ids do not activate semantics without a Guidelines definition', () => {
    for (const id of ['observation_night', 'event_promotion', 'regular_post', 'anything_else']) {
      expect(isEventContentType(id)).toBe(false)
      expect(getCanonicalEventName(id)).toBeNull()
      expect(contentTypeRequiresEventCta(id)).toBe(false)
      expect(shouldGenerateImagePrompt(id)).toBe(false)
    }
  })

  test('event semantics come from generic fields and visual primitives', () => {
    const configuredEvent = definition({
      fields: [
        { key: 'event_name', required: true },
        { key: 'cta', required: true },
      ],
      titleSource: 'type_label',
      mode: 'template',
      template: 'event',
    })

    expect(isEventContentType('arbitrary_id', configuredEvent)).toBe(true)
    expect(getCanonicalEventName('arbitrary_id', configuredEvent)).toBe('Tipo configurado')
    expect(contentTypeRequiresEventCta('arbitrary_id', configuredEvent)).toBe(true)
  })

  test('optional event fields do not turn a custom type into an event contract', () => {
    const optionalEvent = definition({
      fields: [{ key: 'event_name', required: false }],
      mode: 'none',
    })

    expect(isEventContentType('community_update', optionalEvent)).toBe(false)
    expect(
      isEventContentType('community_update', {
        ...optionalEvent,
        fields: [{ key: 'event_name', required: true }],
      })
    ).toBe(true)
    expect(
      isEventContentType('community_update', {
        ...optionalEvent,
        visual: { ...optionalEvent.visual, template: 'event' },
      })
    ).toBe(true)
  })

  test('each platform image posture comes only from Guidelines', () => {
    const configured = definition()

    expect(contentTypeAcceptsImages('x', 'any_id', configured)).toBe(true)
    expect(contentTypeRequiresImages('x', 'any_id', configured)).toBe(false)
    expect(contentTypeAcceptsImages('instagram', 'any_id', configured)).toBe(true)
    expect(contentTypeRequiresImages('instagram', 'any_id', configured)).toBe(false)
    expect(contentTypeAcceptsImages('facebook', 'any_id', configured)).toBe(false)
    expect(contentTypeRequiresImages('facebook', 'any_id', configured)).toBe(false)
  })

  test('missing definitions never fall back to a platform or content-type posture', () => {
    expect(contentTypeAcceptsImages('instagram', 'regular_post')).toBe(false)
    expect(contentTypeRequiresImages('instagram', 'regular_post')).toBe(false)
    expect(contentTypeAcceptsImages('threads', 'regular_post')).toBe(false)
  })

  test('image generation follows visual mode and selected-platform policies', () => {
    const configured = definition()
    expect(
      shouldGenerateImagePrompt(
        'any_id',
        { platforms: ['instagram'], contentTypeDefinition: configured },
        configured
      )
    ).toBe(true)
    expect(
      shouldGenerateImagePrompt(
        'any_id',
        { platforms: ['facebook'], contentTypeDefinition: configured },
        configured
      )
    ).toBe(false)
    expect(
      shouldGenerateImagePrompt(
        'any_id',
        {},
        definition({ mode: 'none', policies: { x: 'prohibited' } })
      )
    ).toBe(false)
  })
})
