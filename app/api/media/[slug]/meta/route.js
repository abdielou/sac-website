import { NextResponse } from 'next/server'
import { getMediaEntry } from '@/lib/media-s3'

export async function GET(request, { params }) {
  const { slug } = params
  const entry = await getMediaEntry(slug)

  if (!entry) {
    return NextResponse.json({ error: 'Video no encontrado' }, { status: 404 })
  }

  return NextResponse.json({
    slug: entry.slug,
    title: entry.title,
    description: entry.description || null,
    thumbnail: entry.thumbnail || null,
    publishedAt: entry.publishedAt,
  })
}
