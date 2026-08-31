import { NextResponse } from 'next/server'
import { listGuides, getGuide } from '@/lib/guides'
import { resolveGuideEntries } from '../guide-editions'

// Cache public guide responses: 5 min fresh, serve stale up to 1 hour while revalidating
const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
}

/**
 * GET /api/guides/public
 *
 * Public (no auth) endpoint for published guides.
 *
 * Without query params: returns published guides grouped by type.
 * With ?slug=xxx: returns full guide with resolved catalog data.
 */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const slug = searchParams.get('slug')

    // Single guide mode — resolve full catalog data
    if (slug) {
      return await handleSingleGuide(slug)
    }

    // List mode — return published guides grouped by type
    return await handleListGuides()
  } catch (error) {
    // Handle S3 not configured gracefully
    if (error.message?.includes('S3') || error.name === 'CredentialsProviderError') {
      return NextResponse.json({ galaxies: [], objects: [] })
    }

    console.error('Error fetching public guides:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * Return published guides grouped by type (galaxies, objects).
 */
async function handleListGuides() {
  const result = await listGuides()
  const published = result.guides.filter((g) => g.status === 'published')

  const grouped = { galaxies: [], objects: [] }

  for (const guide of published) {
    const type = guide.type
    const entry = {
      slug: guide.slug,
      title: guide.title,
      publishedAt: guide.publishedAt,
      entryCount: guide.entryCount || 0,
    }

    if (type === 'galaxies') {
      grouped.galaxies.push(entry)
    } else if (type === 'objects') {
      grouped.objects.push(entry)
    }
  }

  // Sort each group by publishedAt descending (most recent first)
  const sortDesc = (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)
  grouped.galaxies.sort(sortDesc)
  grouped.objects.sort(sortDesc)

  return NextResponse.json(grouped, { headers: CACHE_HEADERS })
}

/**
 * Return a single guide with fully resolved catalog data for each entry.
 */
async function handleSingleGuide(slug) {
  let guide
  try {
    guide = await getGuide(slug)
  } catch {
    return NextResponse.json(
      { error: 'Guia no encontrada', details: `No guide found with slug: ${slug}` },
      { status: 404 }
    )
  }

  if (!guide || guide.status !== 'published') {
    return NextResponse.json(
      { error: 'Guia no encontrada', details: `No published guide found with slug: ${slug}` },
      { status: 404 }
    )
  }

  // Resolve catalog data for each entry. Shared with the server-rendered
  // /guides/<slug> page so both surfaces expose identical object data.
  const entries = resolveGuideEntries(guide)

  return NextResponse.json(
    {
      guide: {
        title: guide.title,
        type: guide.type,
        slug: guide.slug,
        publishedAt: guide.publishedAt,
        entries,
      },
    },
    { headers: CACHE_HEADERS }
  )
}
