import { auth } from '../../../../../../../auth'
import { NextResponse } from 'next/server'
import { checkPermission } from '../../../../../../../lib/api-permissions'
import { MAX_GUIDELINE_DRAFT_BODY_BYTES } from '../../../../../../../lib/ai-constants'
import {
  discardGuidelineDraft,
  saveGuidelineDraft,
} from '../../../../../../../lib/guidelines-store'

function actorFromAuth(authSession) {
  return authSession?.user?.name || authSession?.user?.email || 'Usuario'
}

function bodyTooLarge() {
  return NextResponse.json(
    {
      error: 'Borrador demasiado grande',
      details: `El cuerpo admite hasta ${MAX_GUIDELINE_DRAFT_BODY_BYTES} bytes.`,
    },
    { status: 413 }
  )
}

/**
 * Parse the JSON body with a byte cap. The declared length is checked first so
 * an oversized upload is refused before it is read; the actual text length is
 * checked afterwards because the header is optional and untrusted.
 */
async function readBoundedJson(req) {
  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_GUIDELINE_DRAFT_BODY_BYTES) {
    return { error: bodyTooLarge() }
  }
  const text = await req.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_GUIDELINE_DRAFT_BODY_BYTES) {
    return { error: bodyTooLarge() }
  }
  try {
    return { body: JSON.parse(text) }
  } catch {
    return {
      error: NextResponse.json(
        { error: 'JSON inválido', details: 'El cuerpo de la solicitud no contiene JSON válido' },
        { status: 400 }
      ),
    }
  }
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
    const parsed = await readBoundedJson(req)
    if (parsed.error) return parsed.error
    const body = parsed.body
    const document = body?.document
    if (!document || typeof document !== 'object') {
      return NextResponse.json({ error: 'document es obligatorio' }, { status: 400 })
    }
    const expectedRevision = body?.expectedRevision
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      return NextResponse.json({ error: 'expectedRevision es obligatorio' }, { status: 400 })
    }

    const result = await saveGuidelineDraft(draftId, document, {
      updatedBy: actorFromAuth(req.auth),
      expectedRevision,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error.code === 'DRAFT_NOT_FOUND') {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error.code === 'DRAFT_CONFLICT') {
      return NextResponse.json({ error: error.message }, { status: 409 })
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
