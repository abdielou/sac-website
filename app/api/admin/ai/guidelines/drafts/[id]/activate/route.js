import { auth } from '../../../../../../../../auth'
import { NextResponse } from 'next/server'
import { checkPermission } from '../../../../../../../../lib/api-permissions'
import { activateGuidelineVersion } from '../../../../../../../../lib/guidelines-store'

function actorFromAuth(authSession) {
  return authSession?.user?.name || authSession?.user?.email || 'Usuario'
}

export const POST = auth(async function POST(req, { params }) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  const permissionError = checkPermission(req, 'write_ai')
  if (permissionError) return permissionError

  const resolvedParams = await params
  const draftId = resolvedParams?.id
  if (!draftId) {
    return NextResponse.json({ error: 'Identificador de borrador obligatorio' }, { status: 400 })
  }

  try {
    const result = await activateGuidelineVersion(draftId, {
      activatedBy: actorFromAuth(req.auth),
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error.code === 'DRAFT_NOT_FOUND') {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error.code === 'VALIDATION_FAILED') {
      return NextResponse.json(
        { error: error.message, details: error.errors || [] },
        { status: 400 }
      )
    }
    console.error('POST /api/admin/ai/guidelines/drafts/[id]/activate failed', error)
    return NextResponse.json(
      { error: 'Error al activar', details: error.message || 'No se pudo activar la versión.' },
      { status: 500 }
    )
  }
})
