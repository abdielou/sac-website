import { auth } from '../../../../../../../auth'
import { NextResponse } from 'next/server'
import { checkPermission } from '../../../../../../../lib/api-permissions'
import { rollbackGuidelineVersion } from '../../../../../../../lib/guidelines-store'

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
  const version = resolvedParams?.version ? decodeURIComponent(resolvedParams.version) : null
  if (!version) {
    return NextResponse.json({ error: 'version es obligatoria' }, { status: 400 })
  }

  try {
    const result = await rollbackGuidelineVersion(version, {
      rolledBackBy: actorFromAuth(req.auth),
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error.code === 'VERSION_NOT_FOUND') {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error.code === 'ALREADY_ACTIVE') {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error('POST /api/admin/ai/guidelines/[version]/rollback failed', error)
    return NextResponse.json(
      {
        error: 'Error al hacer rollback',
        details: error.message || 'No se pudo restaurar la versión.',
      },
      { status: 500 }
    )
  }
})
