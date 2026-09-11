import { auth } from '../../../../../../auth'
import { NextResponse } from 'next/server'
import { checkReadAccess } from '../../../../../../lib/api-permissions'
import { recoverAiRun } from '../../../../../../lib/ai-run-lease-store'

export const POST = auth(async function POST(req) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  const readError = checkReadAccess(req, 'ai')
  if (readError) return readError

  const userId = req.auth.user.id || req.auth.user.email?.toLowerCase()
  if (!userId) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'No hay una identidad disponible en la sesión.' },
      { status: 401 }
    )
  }

  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Solicitud inválida', details: 'El cuerpo debe contener JSON válido.' },
      { status: 400 }
    )
  }

  try {
    const recovered = await recoverAiRun({
      userId: String(userId),
      requestToken: body?.requestToken,
    })
    if (!recovered) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    }

    return NextResponse.json(
      {
        runId: recovered.runId || null,
        mode: recovered.mode,
        status: recovered.status,
        coordination: recovered.coordination,
      },
      { status: recovered.runId ? 200 : 202 }
    )
  } catch (error) {
    if (error?.code === 'INVALID_RUN_TOKEN') {
      return NextResponse.json(
        { error: 'Solicitud inválida', details: 'requestToken es obligatorio.' },
        { status: 400 }
      )
    }
    console.error('POST /api/admin/ai/runs/recover failed', error)
    return NextResponse.json({ error: 'No se pudo recuperar la ejecución.' }, { status: 503 })
  }
})
