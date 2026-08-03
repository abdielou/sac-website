import {
  addPlatform,
  cloneGuidelines,
  createAuditEvent,
  createGuidelineDocument,
  listContentTypeEntries,
  listPlatformEntries,
  normalizeGuidelineDocument,
  prependAuditEvent,
  previewGuidelinesAgainstDocument,
  removePlatform,
  resolveContentTypeOptions,
  resolvePlatformOptions,
  slugifyPlatformId,
} from '../../lib/ai-guidelines-draft'
import { getDefaultGuidelines } from '../../lib/ai-guidelines'

describe('ai-guidelines-draft', () => {
  const seed = getDefaultGuidelines()

  test('cloneGuidelines deep-copies document', () => {
    const doc = createGuidelineDocument({ seed })
    const copy = cloneGuidelines(doc)
    copy.global = 'changed'
    expect(doc.global).not.toBe('changed')
  })

  test('prependAuditEvent caps history length', () => {
    const events = [{ id: '1' }, { id: '2' }]
    const event = createAuditEvent({
      action: 'saved',
      version: 'local-v2',
      by: 'Marco',
    })
    const next = prependAuditEvent(events, event, 2)
    expect(next).toHaveLength(2)
    expect(next[0].action).toBe('saved')
  })

  test('slugifyPlatformId normalizes accents and spaces', () => {
    expect(slugifyPlatformId('Threads')).toBe('threads')
    expect(slugifyPlatformId('  YouTube Shorts ')).toBe('youtube-shorts')
    expect(slugifyPlatformId('Redes Sociales')).toBe('redes-sociales')
  })

  test('slugifyPlatformId appends suffix on collision', () => {
    expect(slugifyPlatformId('Threads', ['threads'])).toBe('threads-2')
    expect(slugifyPlatformId('Threads', ['threads', 'threads-2'])).toBe('threads-3')
  })

  test('normalizeGuidelineDocument fills missing platformLabels from constants', () => {
    const partial = {
      version: 'default-v1',
      global: 'g',
      platforms: { x: 'rules-x', instagram: 'rules-ig' },
      prohibited: 'p',
      imageValidation: 'i',
      contentTypes: {},
    }
    const normalized = normalizeGuidelineDocument(partial)
    expect(normalized.platformLabels.x).toBe('X')
    expect(normalized.platformLabels.instagram).toBe('Instagram')
    expect(normalized.platforms.x).toBe('rules-x')
  })

  test('normalizeGuidelineDocument drops orphan labels', () => {
    const doc = normalizeGuidelineDocument({
      ...seed,
      platforms: { x: 'only-x' },
      platformLabels: { x: 'X', facebook: 'Facebook' },
    })
    expect(doc.platformLabels).toEqual({ x: 'X' })
  })

  test('listPlatformEntries returns id, label, rules', () => {
    const entries = listPlatformEntries(seed)
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'instagram', label: 'Instagram' }),
        expect.objectContaining({ id: 'x', label: 'X' }),
        expect.objectContaining({ id: 'facebook', label: 'Facebook' }),
      ])
    )
    expect(entries).toHaveLength(3)
  })

  test('addPlatform adds one canonical expectation and default policies', () => {
    const doc = createGuidelineDocument({ seed })
    const next = addPlatform(doc, 'Threads')
    expect(next.platforms.threads).toMatch(/Threads/)
    expect(next.platformLabels.threads).toBe('Threads')
    expect(next.generation.platforms).toBeUndefined()
    expect(Object.keys(next.platforms)).toHaveLength(4)
    for (const entry of next.contentTypeCatalog) {
      expect(entry.visual.imagePolicyByPlatform.threads).toBe(
        entry.visual.mode === 'none'
          ? 'prohibited'
          : entry.platforms.includes('instagram')
            ? 'required'
            : 'optional'
      )
      expect(entry.platforms).toContain('threads')
    }
  })

  test('addPlatform rejects empty label', () => {
    const doc = createGuidelineDocument({ seed })
    expect(() => addPlatform(doc, '   ')).toThrow(/obligatorio/)
  })

  test('removePlatform deletes the expectation, label, and image policies', () => {
    const doc = createGuidelineDocument({ seed })
    const next = removePlatform(doc, 'facebook')
    expect(next.platforms.facebook).toBeUndefined()
    expect(next.platformLabels.facebook).toBeUndefined()
    expect(next.generation.platforms).toBeUndefined()
    expect(Object.keys(next.platforms)).toHaveLength(2)
    for (const entry of next.contentTypeCatalog) {
      expect(entry.visual.imagePolicyByPlatform.facebook).toBeUndefined()
      expect(entry.platforms).not.toContain('facebook')
    }
  })

  test('removePlatform refuses to delete the last platform', () => {
    let doc = createGuidelineDocument({ seed })
    doc = removePlatform(doc, 'facebook')
    doc = removePlatform(doc, 'instagram')
    expect(() => removePlatform(doc, 'x')).toThrow(/al menos una/)
  })

  test('listContentTypeEntries reads content type rules', () => {
    const entries = listContentTypeEntries(seed)
    expect(entries.some((e) => e.id === 'observation_night')).toBe(true)
    expect(entries.find((e) => e.id === 'observation_night')?.rules).toMatch(
      /Noche de Observación/i
    )
    expect(entries.some((e) => e.id === 'event_promotion')).toBe(true)
    expect(entries.find((e) => e.id === 'event_promotion')?.rules).toMatch(/evento|fecha/i)
  })

  test('resolvePlatformOptions falls back to seed defaults', () => {
    const options = resolvePlatformOptions(null)
    expect(options.map((o) => o.id)).toEqual(['x', 'instagram', 'facebook'])
  })

  test('resolvePlatformOptions includes custom platforms from the document', () => {
    const doc = createGuidelineDocument({ seed })
    const next = addPlatform(doc, 'Threads')
    next.platforms.threads = 'Reglas Threads'
    const options = resolvePlatformOptions(next, { generationOnly: true })
    expect(options.map((o) => o.id)).toEqual(['x', 'instagram', 'facebook', 'threads'])
  })

  test('resolvePlatformOptions does not invent platforms for an authoritative document without them', () => {
    const doc = createGuidelineDocument({ seed })
    doc.platforms = {}
    doc.platformLabels = {}

    expect(resolvePlatformOptions(doc, { generationOnly: true })).toEqual([])
  })

  test('resolveContentTypeOptions uses the canonical generator order', () => {
    const options = resolveContentTypeOptions(seed)
    expect(options[0]).toEqual({
      id: 'observation_night',
      label: 'Noche de Observación',
    })
    expect(options).toContainEqual({ id: 'event_promotion', label: 'Promoción de evento' })
    expect(options.some((o) => o.id === 'regular_post')).toBe(true)
  })

  test('resolveContentTypeOptions restores observation_night for an older guideline document', () => {
    const olderDocument = createGuidelineDocument({ seed })
    delete olderDocument.contentTypes.observation_night
    delete olderDocument.generation.contentTypes.observation_night

    expect(resolveContentTypeOptions(olderDocument)).toContainEqual({
      id: 'observation_night',
      label: 'Noche de Observación',
    })
  })

  test('previewGuidelinesAgainstDocument returns validation and generation views', () => {
    const validation = previewGuidelinesAgainstDocument(seed, {
      platform: 'instagram',
      contentType: 'event_promotion',
      mode: 'validation',
    })
    expect(validation.mode).toBe('validation')
    expect(validation.platform).toMatch(/Instagram/i)

    const generation = previewGuidelinesAgainstDocument(seed, {
      platform: 'instagram',
      contentType: 'event_promotion',
      mode: 'generation',
    })
    expect(generation.mode).toBe('generation')
    expect(generation.global).toBe(seed.global)
    expect(generation.platform).toBe(validation.platform)
    expect(generation.captionMaxCharacters).toBeNull()
    expect(generation.platform).not.toMatch(/280/)
    expect(generation.imagePrompt).toBeTruthy()
  })
})
