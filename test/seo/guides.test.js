import siteMetadata from '@/data/siteMetadata'
import { ORIGIN } from '@/lib/seo'

const mockListGuides = jest.fn()
const mockGetGuide = jest.fn()

jest.mock('@/lib/guides', () => ({
  listGuides: (...args) => mockListGuides(...args),
  getGuide: (...args) => mockGetGuide(...args),
}))

jest.mock('@/lib/catalog', () => ({
  getObjectById: (id) =>
    id === 'NGC0224'
      ? {
          id: 'NGC0224',
          name: 'NGC 224',
          commonNameEs: 'Galaxia de Andrómeda',
          magnitude: 3.4,
          constellation: 'Andromeda',
        }
      : null,
}))

jest.mock('@/data/catalog/hubble-images.json', () => ({ NGC0224: 'heic0512a' }))

// next/link needs a router context that jsdom has no reason to provide; the
// href is what matters for crawlability, so render it as a plain anchor.
jest.mock('@/components/Link', () => {
  const React = require('react')
  return {
    __esModule: true,
    default: ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children),
  }
})

const {
  GUIDE_TYPE_ORDER,
  editionDescription,
  editionEntryCount,
  editionItemListSchema,
  editionMetadata,
  editionPath,
  editionTitle,
  entryDisplayName,
  formatEditionDate,
  getPublishedEdition,
  groupEditionsByType,
  guideTypeConfig,
  listPublishedEditions,
  missingEditionMetadata,
  resolveGuideEntries,
  toEditionSummary,
} = require('../../app/api/guides/guide-editions')

// Real slugs carry an epoch-millisecond suffix from lib/guides generateSlug().
const FEB_SLUG = 'febrero-2026-1738368000000'
const JUN_SLUG = 'junio-2026-1748736000000'

const febIndexEntry = {
  slug: FEB_SLUG,
  title: 'Febrero 2026',
  type: 'objects',
  status: 'published',
  publishedAt: '2026-02-01T12:00:00.000Z',
  updatedAt: '2026-02-10T12:00:00.000Z',
  entryCount: 22,
}

const junIndexEntry = {
  slug: JUN_SLUG,
  title: 'Junio 2026',
  type: 'galaxies',
  status: 'published',
  publishedAt: '2026-06-01T12:00:00.000Z',
  updatedAt: '2026-06-02T12:00:00.000Z',
  entryCount: 14,
}

const draftIndexEntry = {
  slug: 'agosto-2026-1756080000000',
  title: 'Agosto 2026',
  type: 'objects',
  status: 'draft',
  publishedAt: null,
  updatedAt: '2026-08-01T12:00:00.000Z',
  entryCount: 3,
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  console.error.mockRestore()
})

describe('editionPath', () => {
  it('maps a stored slug to one URL per edition', () => {
    expect(editionPath(FEB_SLUG)).toBe(`/guides/${FEB_SLUG}`)
  })

  it('never produces a double slash', () => {
    expect(editionPath(`/${FEB_SLUG}`)).toBe(`/guides/${FEB_SLUG}`)
  })

  it('leaves the epoch suffix on the slug untouched, so indexed URLs keep working', () => {
    expect(editionPath(FEB_SLUG)).toContain('1738368000000')
  })
})

describe('editionTitle', () => {
  it('turns a bare month name into a searchable phrase', () => {
    expect(editionTitle(febIndexEntry)).toBe('Guía de observación: Febrero 2026')
  })

  it('uses the galaxies prefix for the seasonal guide', () => {
    expect(editionTitle(junIndexEntry)).toBe('Guía de galaxias: Junio 2026')
  })

  it('never appends the site name, which the root layout template already adds', () => {
    expect(editionTitle(febIndexEntry)).not.toContain('SAC')
    expect(editionTitle(febIndexEntry)).not.toContain(siteMetadata.title)
  })

  it('keeps a title the editor already phrased, accents or not', () => {
    expect(editionTitle({ title: 'Guia de galaxias enanas', type: 'galaxies' })).toBe(
      'Guia de galaxias enanas'
    )
    expect(editionTitle({ title: 'Guía de observación de verano', type: 'objects' })).toBe(
      'Guía de observación de verano'
    )
  })

  it('falls back to the type prefix when the title is empty', () => {
    expect(editionTitle({ title: '   ', type: 'objects' })).toBe('Guía de observación')
    expect(editionTitle(undefined)).toBe('Guía de observación')
  })

  it('treats an unknown type as the monthly object guide', () => {
    expect(editionTitle({ title: 'Marzo 2026', type: 'nebulae' })).toBe(
      'Guía de observación: Marzo 2026'
    )
    expect(guideTypeConfig('nebulae').type).toBe('objects')
  })
})

describe('editionEntryCount', () => {
  it('reads entryCount from an index entry', () => {
    expect(editionEntryCount(febIndexEntry)).toBe(22)
  })

  it('prefers the real entries array of a full guide document', () => {
    expect(editionEntryCount({ entryCount: 22, entries: [{ objectId: 'NGC0224' }] })).toBe(1)
  })

  it('returns 0 when neither is present', () => {
    expect(editionEntryCount({})).toBe(0)
    expect(editionEntryCount(null)).toBe(0)
  })
})

describe('editionDescription', () => {
  it('describes the objects in Spanish, with the count and the edition', () => {
    expect(editionDescription(febIndexEntry)).toBe(
      '22 objetos del cielo profundo de Febrero 2026 con magnitud, dificultad, equipo recomendado y hora óptima desde Puerto Rico y el Caribe.'
    )
  })

  it('uses the galaxies subject for the seasonal guide', () => {
    expect(editionDescription(junIndexEntry)).toContain('14 galaxias de Junio 2026')
  })

  it('drops the count when the edition is empty', () => {
    expect(editionDescription({ title: 'Marzo 2026', type: 'objects' })).toMatch(
      /^Objetos del cielo profundo de Marzo 2026 /
    )
  })

  it('stays inside a usable meta description length', () => {
    expect(editionDescription(febIndexEntry).length).toBeLessThanOrEqual(180)
  })
})

describe('editionMetadata', () => {
  const meta = editionMetadata(febIndexEntry)

  it('sets a self-referencing canonical on the per-edition URL', () => {
    expect(meta.alternates.canonical).toBe(`${ORIGIN}/guides/${FEB_SLUG}`)
  })

  it('omits the site name so the layout template does not double it', () => {
    expect(meta.title).toBe('Guía de observación: Febrero 2026')
    expect(meta.title).not.toContain('SAC')
  })

  it('keeps the shared OpenGraph base instead of replacing it', () => {
    expect(meta.openGraph.siteName).toBe(siteMetadata.title)
    expect(meta.openGraph.locale).toBe('es_PR')
    expect(meta.openGraph.images.length).toBeGreaterThan(0)
    expect(meta.openGraph.url).toBe(`${ORIGIN}/guides/${FEB_SLUG}`)
    expect(meta.openGraph.type).toBe('article')
  })

  it('keeps the shared Twitter base', () => {
    expect(meta.twitter.card).toBe('summary_large_image')
    expect(meta.twitter.title).toBe('Guía de observación: Febrero 2026')
  })

  it('emits full ISO article dates', () => {
    expect(meta.openGraph.publishedTime).toBe('2026-02-01T12:00:00.000Z')
    expect(meta.openGraph.modifiedTime).toBe('2026-02-10T12:00:00.000Z')
  })

  it('never lets modifiedTime precede publishedTime', () => {
    const stale = editionMetadata({
      ...febIndexEntry,
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    expect(stale.openGraph.modifiedTime).toBe(stale.openGraph.publishedTime)
  })

  it('omits article dates entirely when publishedAt is missing, so output stays stable', () => {
    const undated = editionMetadata({ ...febIndexEntry, publishedAt: null })
    expect(undated.openGraph.publishedTime).toBeUndefined()
    expect(undated.openGraph.modifiedTime).toBeUndefined()
  })
})

describe('missingEditionMetadata', () => {
  it('keeps an unknown edition out of the index', () => {
    const meta = missingEditionMetadata('no-existe')
    expect(meta.robots.index).toBe(false)
    expect(meta.robots.follow).toBe(false)
    expect(meta.title).toBe('Guía no encontrada')
    expect(meta.alternates.canonical).toBe(`${ORIGIN}/guides/no-existe`)
  })
})

describe('toEditionSummary', () => {
  it('carries both the raw editor title and the search title', () => {
    const summary = toEditionSummary(febIndexEntry)
    expect(summary).toMatchObject({
      slug: FEB_SLUG,
      type: 'objects',
      rawTitle: 'Febrero 2026',
      title: 'Guía de observación: Febrero 2026',
      path: `/guides/${FEB_SLUG}`,
      entryCount: 22,
    })
  })
})

describe('listPublishedEditions', () => {
  it('drops drafts and sorts newest first', async () => {
    mockListGuides.mockResolvedValue({
      guides: [febIndexEntry, draftIndexEntry, junIndexEntry],
    })

    const editions = await listPublishedEditions()
    expect(editions.map((e) => e.slug)).toEqual([JUN_SLUG, FEB_SLUG])
  })

  it('drops entries with no slug', async () => {
    mockListGuides.mockResolvedValue({
      guides: [febIndexEntry, { title: 'Roto', status: 'published' }, null],
    })

    const editions = await listPublishedEditions()
    expect(editions).toHaveLength(1)
  })

  it('degrades to an empty list when S3 is unreachable, so the build still works', async () => {
    mockListGuides.mockRejectedValue(new Error('Failed to read guide index'))
    await expect(listPublishedEditions()).resolves.toEqual([])
  })

  it('handles an empty index', async () => {
    mockListGuides.mockResolvedValue({ guides: [] })
    await expect(listPublishedEditions()).resolves.toEqual([])
  })
})

describe('groupEditionsByType', () => {
  it('returns a bucket for every rendered type, even when empty', () => {
    const grouped = groupEditionsByType([])
    expect(Object.keys(grouped)).toEqual(GUIDE_TYPE_ORDER)
    expect(grouped.objects).toEqual([])
    expect(grouped.galaxies).toEqual([])
  })

  it('splits editions by type and keeps the incoming order', () => {
    const grouped = groupEditionsByType([
      toEditionSummary(junIndexEntry),
      toEditionSummary(febIndexEntry),
    ])
    expect(grouped.objects.map((e) => e.slug)).toEqual([FEB_SLUG])
    expect(grouped.galaxies.map((e) => e.slug)).toEqual([JUN_SLUG])
  })

  it('files an unknown type under the monthly object guide', () => {
    const grouped = groupEditionsByType([{ slug: 'x', type: 'nebulae' }])
    expect(grouped.objects.map((e) => e.slug)).toEqual(['x'])
  })
})

describe('getPublishedEdition', () => {
  it('resolves a published edition by slug', async () => {
    mockGetGuide.mockResolvedValue({ ...febIndexEntry, entries: [] })
    const guide = await getPublishedEdition(FEB_SLUG)
    expect(guide.slug).toBe(FEB_SLUG)
    expect(mockGetGuide).toHaveBeenCalledWith(FEB_SLUG)
  })

  it('returns null for a draft, so the page can 404 instead of leaking it', async () => {
    mockGetGuide.mockResolvedValue({ ...draftIndexEntry, entries: [] })
    await expect(getPublishedEdition(draftIndexEntry.slug)).resolves.toBeNull()
  })

  it('returns null for an unknown slug', async () => {
    mockGetGuide.mockRejectedValue(new Error('Guide not found: nope'))
    await expect(getPublishedEdition('nope')).resolves.toBeNull()
  })

  it('returns null without hitting S3 for an empty slug', async () => {
    await expect(getPublishedEdition('')).resolves.toBeNull()
    expect(mockGetGuide).not.toHaveBeenCalled()
  })
})

describe('resolveGuideEntries', () => {
  const guide = {
    ...febIndexEntry,
    entries: [
      {
        objectId: 'NGC0224',
        difficulty: 'facil',
        equipment: 'equipo_pequeno',
        location: 'suburbios',
        optimalTime: '8:00 PM',
        notes: 'Visible a simple vista',
      },
      { objectId: 'NGC9999' },
    ],
  }

  it('resolves catalog data server-side, so the object table lands in the HTML', () => {
    const [andromeda] = resolveGuideEntries(guide)
    expect(andromeda.catalog.commonNameEs).toBe('Galaxia de Andrómeda')
    expect(andromeda.imageUrl).toBe(
      'https://cdn.esahubble.org/archives/images/thumb700x/heic0512a.jpg'
    )
  })

  it('keeps an unknown object rather than dropping it', () => {
    const [, unknown] = resolveGuideEntries(guide)
    expect(unknown.catalog).toBeNull()
    expect(unknown.imageUrl).toBeNull()
    expect(unknown.objectId).toBe('NGC9999')
  })

  it('tolerates a guide with no entries', () => {
    expect(resolveGuideEntries({})).toEqual([])
    expect(resolveGuideEntries(null)).toEqual([])
  })
})

describe('entryDisplayName', () => {
  it('prefers the Spanish common name', () => {
    expect(entryDisplayName({ objectId: 'NGC0224', catalog: { commonNameEs: 'Andrómeda' } })).toBe(
      'Andrómeda'
    )
  })

  it('falls back to the object id when there is no catalog record', () => {
    expect(entryDisplayName({ objectId: 'NGC9999', catalog: null })).toBe('NGC9999')
  })
})

describe('editionItemListSchema', () => {
  const entries = resolveGuideEntries({
    entries: [{ objectId: 'NGC0224', optimalTime: '8:00 PM' }],
  })
  const schema = editionItemListSchema(febIndexEntry, entries)

  it('is an ItemList on the edition URL', () => {
    expect(schema['@type']).toBe('ItemList')
    expect(schema.url).toBe(`${ORIGIN}/guides/${FEB_SLUG}`)
    expect(schema.url).not.toMatch(/[^:]\/\//)
  })

  it('lists every object with its position and name', () => {
    expect(schema.numberOfItems).toBe(1)
    expect(schema.itemListElement[0]).toMatchObject({
      '@type': 'ListItem',
      position: 1,
      name: 'Galaxia de Andrómeda',
    })
    expect(schema.itemListElement[0].description).toContain('Magnitud 3.4')
  })

  it('omits the description when there are no facts to state', () => {
    const bare = editionItemListSchema(febIndexEntry, [{ objectId: 'NGC9999', catalog: null }])
    expect(bare.itemListElement[0].description).toBeUndefined()
  })
})

describe('GuideSection server-rendered markup', () => {
  // The whole point of the change: a crawler must see the object table and one
  // real link per edition in the initial HTML, with no fetch after hydration.
  const renderSection = () => {
    const { renderToStaticMarkup } = require('react-dom/server')
    const React = require('react')
    // The app sources rely on the automatic JSX runtime; babel-jest here uses
    // the classic one, so the transformed modules need React in scope.
    global.React = React
    const GuideSection = require('../../app/guides/GuideSection').default

    const entries = resolveGuideEntries({
      entries: [{ objectId: 'NGC0224', optimalTime: '8:00 PM', difficulty: 'facil' }],
    })

    return renderToStaticMarkup(
      React.createElement(GuideSection, {
        sectionTitle: 'Objetos del mes',
        editions: [toEditionSummary(febIndexEntry), toEditionSummary(junIndexEntry)],
        activeSlug: FEB_SLUG,
        entries,
      })
    )
  }

  it('puts the object data in the initial HTML', () => {
    const html = renderSection()
    expect(html).toContain('Galaxia de Andr')
    expect(html).toContain('Mag: 3.4')
  })

  it('renders one crawlable link per edition instead of a select', () => {
    const html = renderSection()
    expect(html).toContain(`href="/guides/${FEB_SLUG}"`)
    expect(html).toContain(`href="/guides/${JUN_SLUG}"`)
    expect(html).not.toContain('<option')
  })
})

describe('formatEditionDate', () => {
  it('returns an empty string for a missing or unparseable date', () => {
    expect(formatEditionDate(null)).toBe('')
    expect(formatEditionDate('')).toBe('')
    expect(formatEditionDate('no es fecha')).toBe('')
  })

  it('formats a real date', () => {
    expect(formatEditionDate('2026-02-01T12:00:00.000Z')).not.toBe('')
  })
})
