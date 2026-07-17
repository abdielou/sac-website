import { auth } from '../../../../../auth'
import { NextResponse } from 'next/server'
import { checkPermission } from '../../../../../lib/api-permissions'
import { CONTENT_TYPES, PLATFORMS } from '../../../../../lib/ai-constants'
import { checkWorkflowStartRateLimit } from '../../../../../lib/ai-rate-limit'
import { start } from 'workflow/api'
import { generateAiWorkflow } from '../../../../../workflows/ai-social-media-designer/generation/generateAiWorkflow'

const GENERATE_WORKFLOW_ID =
  'workflow//./workflows/ai-social-media-designer/generation/generateAiWorkflow//generateAiWorkflow'

function parseStringArray(value) {
  if (value === undefined || value === null) return undefined

  if (Array.isArray(value)) {
    const list = value.map((v) => String(v).trim()).filter(Boolean)
    return list.length ? list : undefined
  }

  const str = String(value).trim()
  if (!str) return undefined

  try {
    const parsed = JSON.parse(str)
    if (Array.isArray(parsed)) {
      const list = parsed.map((v) => String(v).trim()).filter(Boolean)
      return list.length ? list : undefined
    }
  } catch {
    // ignore
  }

  const list = str
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return list.length ? list : undefined
}

function normalizePlatforms(value) {
  const list = parseStringArray(value)
  if (!list) return null
  return list.map((p) => String(p).toLowerCase())
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

  const userEmail = req.auth.user.email?.toLowerCase()
  const userId = req.auth.user.id || req.auth.user.email

  if (!userEmail) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'No email in session' },
      { status: 401 }
    )
  }

  const rateLimitError = checkWorkflowStartRateLimit(userEmail)
  if (rateLimitError) return rateLimitError

  try {
    const body = await req.json()

    const intent = typeof body.intent === 'string' ? body.intent.trim() : ''
    const topic = typeof body.topic === 'string' ? body.topic.trim() : ''
    const contentType =
      typeof body.contentType === 'string' ? body.contentType.trim() : String(body.contentType || '')
    const platforms = normalizePlatforms(body.platforms)

    if (!intent || !topic || !contentType || !platforms?.length) {
      return NextResponse.json(
        {
          error: 'Campos requeridos',
          details: 'intent, topic, platforms y contentType son obligatorios',
        },
        { status: 400 }
      )
    }

    if (platforms.length > 3) {
      return NextResponse.json(
        { error: 'Demasiadas plataformas', details: 'Máximo 3 plataformas' },
        { status: 400 }
      )
    }

    const invalidPlatform = platforms.find((p) => !PLATFORMS.includes(p))
    if (invalidPlatform) {
      return NextResponse.json(
        {
          error: 'Plataforma inválida',
          details: `Plataformas permitidas: ${PLATFORMS.join(', ')}`,
        },
        { status: 400 }
      )
    }

    if (!CONTENT_TYPES.includes(contentType)) {
      return NextResponse.json(
        {
          error: 'Tipo de contenido inválido',
          details: `Tipos permitidos: ${CONTENT_TYPES.join(', ')}`,
        },
        { status: 400 }
      )
    }

    const workflowInput = {
      userId: String(userId),
      userEmail,
      intent,
      topic,
      platforms,
      contentType,
      tone: body.tone ? String(body.tone) : undefined,
      audience: body.audience ? String(body.audience) : undefined,
      cta: body.cta ? String(body.cta) : undefined,
      knownFacts: parseStringArray(body.knownFacts),
      eventDetails: body.eventDetails && typeof body.eventDetails === 'object' ? body.eventDetails : undefined,
      hashtags: parseStringArray(body.hashtags),
      links: parseStringArray(body.links),
      imageStyle: body.imageStyle ? String(body.imageStyle) : undefined,
      imageConstraints: body.imageConstraints ? String(body.imageConstraints) : undefined,
    }

    const workflowTarget =
      generateAiWorkflow && typeof generateAiWorkflow.workflowId === 'string'
        ? generateAiWorkflow
        : { workflowId: GENERATE_WORKFLOW_ID }

    const run = await start(workflowTarget, [workflowInput])
    const status = await run.status

    return NextResponse.json({ runId: run.runId, status }, { status: 202 })
  } catch (error) {
    console.error('Error starting AI generation workflow:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: 'No se pudo iniciar la generación' },
      { status: 500 }
    )
  }
})
