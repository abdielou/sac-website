import { auth } from '../../../../../auth'
import { NextResponse } from 'next/server'
import { checkPermission } from '../../../../../lib/api-permissions'
import { getGuidelinesWorkspace } from '../../../../../lib/guidelines-store'

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
    const workspace = await getGuidelinesWorkspace()
    return NextResponse.json(workspace)
  } catch (error) {
    console.error('GET /api/admin/ai/guidelines failed', error)
    return NextResponse.json(
      { error: 'Error al cargar guías', details: 'No se pudieron cargar las guías activas.' },
      { status: 500 }
    )
  }
})
