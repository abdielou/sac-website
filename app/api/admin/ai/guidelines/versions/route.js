import { auth } from '../../../../../../auth'
import { NextResponse } from 'next/server'
import { checkPermission } from '../../../../../../lib/api-permissions'
import { listGuidelineVersions } from '../../../../../../lib/guidelines-store'

export const GET = auth(async function GET(req) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  const permissionError = checkPermission(req, 'read_ai')
  if (permissionError) return permissionError

  try {
    const versions = await listGuidelineVersions()
    return NextResponse.json({ versions })
  } catch (error) {
    console.error('GET /api/admin/ai/guidelines/versions failed', error)
    return NextResponse.json(
      { error: 'Error al listar versiones', details: 'No se pudo listar el historial de guías.' },
      { status: 500 }
    )
  }
})
