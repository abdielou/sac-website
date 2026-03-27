import { NextResponse } from 'next/server'
import { listGuides, getGuide } from '@/lib/guides'
import { getObjectById } from '@/lib/catalog'

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

  return NextResponse.json(grouped)
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

  // Resolve catalog data for each entry
  const entries = (guide.entries || []).map((entry) => {
    const catalogObj = getObjectById(entry.objectId)
    return {
      objectId: entry.objectId,
      difficulty: entry.difficulty || null,
      equipment: entry.equipment || null,
      location: entry.location || null,
      optimalTime: entry.optimalTime || null,
      notes: entry.notes || null,
      catalog: catalogObj || null,
    }
  })

  return NextResponse.json({
    guide: {
      title: guide.title,
      type: guide.type,
      slug: guide.slug,
      publishedAt: guide.publishedAt,
      entries,
    },
  })
}
