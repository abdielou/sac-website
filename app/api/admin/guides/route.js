import { auth } from '../../../../auth'
import { NextResponse } from 'next/server'
import { listGuides, createGuide } from '@/lib/guides'
import { checkPermission } from '../../../../lib/api-permissions'
import { Actions } from '../../../../lib/permissions'

/**
 * GET /api/admin/guides
 *
 * Query params:
 * - status: "published" or "draft" (optional, default: all)
 */
export const GET = auth(async function GET(req) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')

    const result = await listGuides()
    let guides = result.guides

    // Apply status filter if provided
    if (status === 'published' || status === 'draft') {
      guides = guides.filter((g) => g.status === status)
    }

    return NextResponse.json({ guides })
  } catch (error) {
    console.error('Error listing guides:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    )
  }
})

/**
 * POST /api/admin/guides
 *
 * Body: { title (required), type (required: "galaxies"|"objects"), entries?, author? }
 */
export const POST = auth(async function POST(req) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  // Check permission to create guides
  const permissionError = checkPermission(req, Actions.CREATE_GUIDE)
  if (permissionError) {
    return permissionError
  }

  try {
    const body = await req.json()

    // Validate title
    if (!body.title || !body.title.trim()) {
      return NextResponse.json(
        { error: 'El titulo es requerido', details: 'Title is required' },
        { status: 400 }
      )
    }

    // Validate type
    const validTypes = ['galaxies', 'objects']
    if (!body.type || !validTypes.includes(body.type)) {
      return NextResponse.json(
        {
          error: 'Tipo de guia invalido',
          details: `Type must be one of: ${validTypes.join(', ')}`,
        },
        { status: 400 }
      )
    }

    const data = {
      title: body.title.trim(),
      type: body.type,
      entries: body.entries || [],
      author: body.author || null,
    }

    const guide = await createGuide(data)

    return NextResponse.json({ guide }, { status: 201 })
  } catch (error) {
    console.error('Error creating guide:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    )
  }
})
