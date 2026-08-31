import { auth } from '../../../../../../auth'
import { NextResponse } from 'next/server'
import { checkPermission } from '../../../../../../lib/api-permissions'
import { createGuidelineDraft } from '../../../../../../lib/guidelines-store'

function actorFromAuth(authSession) {
  return authSession?.user?.name || authSession?.user?.email || 'Usuario'
}

export const POST = auth(async function POST(req) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  const permissionError = checkPermission(req, 'write_ai')
  if (permissionError) return permissionError

  try {
    let basedOnVersion
    try {
      const body = await req.json()
      basedOnVersion = body?.basedOnVersion
    } catch {
      basedOnVersion = undefined
    }

    const result = await createGuidelineDraft({
      createdBy: actorFromAuth(req.auth),
      basedOnVersion,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (error.code === 'DRAFT_EXISTS') {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error('POST /api/admin/ai/guidelines/drafts failed', error)
    return NextResponse.json(
      {
        error: 'Error al crear borrador',
        details: error.message || 'No se pudo crear el borrador.',
      },
      { status: 500 }
    )
  }
})
