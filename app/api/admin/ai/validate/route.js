import { auth } from '../../../../../auth'
import { NextResponse } from 'next/server'
import { checkPermission } from '../../../../../lib/api-permissions'
import { start } from 'workflow/api'
import { validateAiWorkflow } from '../../../../../workflows/ai-social-media-designer/validation/validateAiWorkflow'

const MAX_IMAGES = 4
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024 // 5MB
const WORKFLOW_START_WINDOW_MS = 60 * 1000
const MAX_WORKFLOWS_PER_WINDOW = 5
const VALIDATE_WORKFLOW_ID =
  'workflow//./workflows/ai-social-media-designer/validation/validateAiWorkflow//validateAiWorkflow'

// MVP: in-memory rate limiting. For multi-instance production, replace with a shared store.
const startTimestampsByUser = new Map() // Map<string, number[]>

function parseStringArray(value) {
  if (value === undefined || value === null) return undefined

  if (Array.isArray(value)) {
    const list = value.map((v) => String(v).trim()).filter(Boolean)
    return list.length ? list : undefined
  }

  const str = String(value).trim()
  if (!str) return undefined

  // Try JSON first: '["a","b"]'
  try {
    const parsed = JSON.parse(str)
    if (Array.isArray(parsed)) {
      const list = parsed.map((v) => String(v).trim()).filter(Boolean)
      return list.length ? list : undefined
    }
  } catch {
    // ignore
  }

  // Fallback: comma separated 'a,b,c'
  const list = str
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return list.length ? list : undefined
}

async function fileToDataUrl(file) {
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const base64 = buffer.toString('base64')
  const mimeType = file.type || 'application/octet-stream'
  return `data:${mimeType};base64,${base64}`
}

export const POST = auth(async function POST(req) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  // Feature gate: start validation workflows
  const permissionError = checkPermission(req, 'write_ai')
  if (permissionError) return permissionError

  const userEmail = req.auth.user.email?.toLowerCase()
  const userId = req.auth.user.id || req.auth.user.email

  if (!userEmail) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'No email in session' },
      { status: 401 }
    )
  }

  // Rate limiting (per authenticated user)
  const now = Date.now()
  const timestamps = startTimestampsByUser.get(userEmail) || []
  const recent = timestamps.filter((ts) => now - ts < WORKFLOW_START_WINDOW_MS)
  recent.push(now)
  if (recent.length > MAX_WORKFLOWS_PER_WINDOW) {
    return NextResponse.json(
      { error: 'Demasiadas solicitudes', details: 'Rate limit excedido' },
      { status: 429 }
    )
  }
  startTimestampsByUser.set(userEmail, recent)

  try {
    const contentTypeHeader = req.headers.get('content-type') || ''

    let platform
    let contentType
    let draftText
    let goal
    let audience
    let cta
    let hashtags
    let links
    let eventDetails
    let altText
    let images = []

    if (contentTypeHeader.includes('multipart/form-data')) {
      const formData = await req.formData()

      platform = formData.get('platform')
      contentType = formData.get('contentType')
      draftText = formData.get('draftText')

      goal = formData.get('goal')
      audience = formData.get('audience')
      cta = formData.get('cta')
      altText = formData.get('altText')

      hashtags = parseStringArray(formData.get('hashtags'))
      links = parseStringArray(formData.get('links'))

      const eventDetailsStr = formData.get('eventDetails')
      if (eventDetailsStr) {
        try {
          eventDetails = JSON.parse(String(eventDetailsStr))
        } catch {
          return NextResponse.json({ error: 'eventDetails inválido' }, { status: 400 })
        }
      }

      const imageFiles = formData.getAll('images').filter((f) => f && f.size > 0)

      if (imageFiles.length > MAX_IMAGES) {
        return NextResponse.json(
          { error: 'Demasiadas imágenes', details: `Máximo ${MAX_IMAGES}` },
          { status: 400 }
        )
      }

      for (const file of imageFiles) {
        const size = file.size || 0
        const mime = file.type || ''

        if (size > MAX_IMAGE_SIZE_BYTES) {
          return NextResponse.json(
            { error: 'Archivo muy grande', details: `Máximo ${MAX_IMAGE_SIZE_BYTES} bytes` },
            { status: 400 }
          )
        }

        if (mime && !mime.startsWith('image/')) {
          return NextResponse.json(
            { error: 'Archivo inválido', details: 'Se requiere una imagen' },
            { status: 400 }
          )
        }

        const dataUrl = await fileToDataUrl(file)
        images.push({
          dataUrl,
          mimeType: mime || 'image/png',
          fileName: file.name,
          size,
        })
      }
    } else {
      // JSON body (fallback convenience for API clients)
      const body = await req.json()

      platform = body.platform
      contentType = body.contentType
      draftText = body.draftText
      goal = body.goal
      audience = body.audience
      cta = body.cta
      hashtags = parseStringArray(body.hashtags)
      links = parseStringArray(body.links)
      eventDetails = body.eventDetails
      altText = body.altText
      images = body.images || []
    }

    platform = typeof platform === 'string' ? platform : platform?.toString()
    contentType = typeof contentType === 'string' ? contentType : contentType?.toString()
    draftText = typeof draftText === 'string' ? draftText : draftText?.toString()

    if (!platform || !contentType || !draftText || !draftText.trim()) {
      return NextResponse.json(
        {
          error: 'Campos requeridos',
          details: 'platform, contentType y draftText son obligatorios',
        },
        { status: 400 }
      )
    }

    const workflowInput = {
      userId: String(userId),
      userEmail,
      platform,
      contentType,
      draftText,
      goal: goal ? String(goal) : undefined,
      audience: audience ? String(audience) : undefined,
      cta: cta ? String(cta) : undefined,
      hashtags,
      links,
      eventDetails,
      altText: altText ? String(altText) : undefined,
      images,
    }

    const workflowTarget =
      validateAiWorkflow && typeof validateAiWorkflow.workflowId === 'string'
        ? validateAiWorkflow
        : { workflowId: VALIDATE_WORKFLOW_ID }

    const run = await start(workflowTarget, [workflowInput])
    const status = await run.status

    return NextResponse.json({ runId: run.runId, status }, { status: 202 })
  } catch (error) {
    console.error('Error starting AI validation workflow:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: 'No se pudo iniciar la validación' },
      { status: 500 }
    )
  }
})
