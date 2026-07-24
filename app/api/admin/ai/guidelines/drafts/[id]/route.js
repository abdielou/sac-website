import { auth } from '../../../../../../../auth'
import { NextResponse } from 'next/server'
import { checkPermission } from '../../../../../../../lib/api-permissions'
import {
  discardGuidelineDraft,
  saveGuidelineDraft,
} from '../../../../../../../lib/guidelines-store'

function actorFromAuth(authSession) {
  return authSession?.user?.name || authSession?.user?.email || 'Usuario'
}

export const PUT = auth(async function PUT(req, { params }) {
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
    return NextResponse.json({ error: 'draftId es obligatorio' }, { status: 400 })
  }

  try {
    const body = await req.json()
    const document = body?.document
    if (!document || typeof document !== 'object') {
      return NextResponse.json({ error: 'document es obligatorio' }, { status: 400 })
    }

    const result = await saveGuidelineDraft(draftId, document, {
      updatedBy: actorFromAuth(req.auth),
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
    console.error('PUT /api/admin/ai/guidelines/drafts/[id] failed', error)
    return NextResponse.json(
      { error: 'Error al guardar borrador', details: error.message || 'No se pudo guardar.' },
      { status: 500 }
    )
  }
})

export const DELETE = auth(async function DELETE(req, { params }) {
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
    return NextResponse.json({ error: 'draftId es obligatorio' }, { status: 400 })
  }

  try {
    const result = await discardGuidelineDraft(draftId, {
      discardedBy: actorFromAuth(req.auth),
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error.code === 'DRAFT_NOT_FOUND') {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    console.error('DELETE /api/admin/ai/guidelines/drafts/[id] failed', error)
    return NextResponse.json(
      { error: 'Error al descartar borrador', details: error.message || 'No se pudo descartar.' },
      { status: 500 }
    )
  }
})
