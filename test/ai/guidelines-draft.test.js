import {
  activateDraft,
  addPlatform,
  bumpLocalVersion,
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

  test('bumpLocalVersion increments local versions', () => {
    expect(bumpLocalVersion('mvp-default-v1')).toBe('local-v2')
    expect(bumpLocalVersion('local-v2')).toBe('local-v3')
    expect(bumpLocalVersion('local-v9')).toBe('local-v10')
  })

  test('activateDraft promotes draft with new version and audit event', () => {
    const draft = createGuidelineDocument({ version: 'mvp-default-v1', seed })
    const { active, auditEvent } = activateDraft(draft, 'Elena R.')
    expect(active.version).toBe('local-v2')
    expect(active.updatedBy).toBe('Elena R.')
    expect(active.updatedAt).toBeTruthy()
    expect(auditEvent.action).toBe('activated')
    expect(auditEvent.by).toBe('Elena R.')
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
    const legacy = {
      version: 'mvp-default-v1',
      global: 'g',
      platforms: { x: 'rules-x', instagram: 'rules-ig' },
      prohibited: 'p',
      imageValidation: 'i',
      contentTypes: {},
    }
    const normalized = normalizeGuidelineDocument(legacy)
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

  test('addPlatform adds free-form platform with empty rules', () => {
    const doc = createGuidelineDocument({ seed })
    const next = addPlatform(doc, 'Threads')
    expect(next.platforms.threads).toBe('')
    expect(next.platformLabels.threads).toBe('Threads')
    expect(Object.keys(next.platforms)).toHaveLength(4)
  })

  test('addPlatform rejects empty label', () => {
    const doc = createGuidelineDocument({ seed })
    expect(() => addPlatform(doc, '   ')).toThrow(/obligatorio/)
  })

  test('removePlatform deletes platform and label', () => {
    const doc = createGuidelineDocument({ seed })
    const next = removePlatform(doc, 'facebook')
    expect(next.platforms.facebook).toBeUndefined()
    expect(next.platformLabels.facebook).toBeUndefined()
    expect(Object.keys(next.platforms)).toHaveLength(2)
  })

  test('removePlatform refuses to delete the last platform', () => {
    let doc = createGuidelineDocument({ seed })
    doc = removePlatform(doc, 'facebook')
    doc = removePlatform(doc, 'instagram')
    expect(() => removePlatform(doc, 'x')).toThrow(/al menos una/)
  })

  test('listContentTypeEntries reads content type rules', () => {
    const entries = listContentTypeEntries(seed)
    expect(entries.some((e) => e.id === 'event_promotion')).toBe(true)
    expect(entries.find((e) => e.id === 'event_promotion')?.rules).toMatch(/evento/i)
  })

  test('resolvePlatformOptions falls back to MVP defaults', () => {
    const options = resolvePlatformOptions(null)
    expect(options.map((o) => o.id)).toEqual(['x', 'instagram', 'facebook'])
  })

  test('resolvePlatformOptions generationOnly intersects with supported platforms', () => {
    const doc = createGuidelineDocument({ seed })
    doc.platforms.threads = 'Reglas Threads'
    doc.platformLabels.threads = 'Threads'
    const options = resolvePlatformOptions(doc, { generationOnly: true })
    expect(options.map((o) => o.id)).toEqual(['x', 'instagram', 'facebook'])
    expect(options.every((o) => o.id !== 'threads')).toBe(true)
  })

  test('resolveContentTypeOptions uses active doc when present', () => {
    const options = resolveContentTypeOptions(seed)
    expect(options.some((o) => o.id === 'regular_post')).toBe(true)
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
      platform: 'x',
      contentType: 'regular_post',
      mode: 'generation',
    })
    expect(generation.mode).toBe('generation')
    expect(generation.platform).toMatch(/280/)
    expect(generation.imagePrompt).toBeTruthy()
  })
})
