import { auth } from '../../../../../auth'
import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { checkPermission } from '../../../../../lib/api-permissions'
import {
  PLATFORMS,
  contentTypeRequiresEventCta,
  isEventContentType,
} from '../../../../../lib/ai-constants'
import { checkWorkflowStartRateLimit } from '../../../../../lib/ai-rate-limit'
import {
  missingEventLogistics,
  validateSponsorLogo,
} from '../../../../../lib/social-template/eventFormHelpers'
import { start } from 'workflow/api'
import {
  GenerateInputSchema,
  generateAiWorkflow,
} from '../../../../../workflows/ai-social-media-designer/generation/generateAiWorkflow'

const GENERATE_WORKFLOW_ID =
  'workflow//./workflows/ai-social-media-designer/generation/generateAiWorkflow//generateAiWorkflow'

function parseStringArray(value) {
  if (value === undefined || value === null) return undefined

  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === 'string' ? item.trim() : item))
  }

  if (typeof value !== 'string') return value
  const str = value.trim()
  if (!str) return undefined

  try {
    const parsed = JSON.parse(str)
    if (Array.isArray(parsed)) {
      const list = parsed.map((item) => (typeof item === 'string' ? item.trim() : item))
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

function normalizeSponsorLogo(value) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) return value

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      typeof entry === 'string' ? entry.trim() : entry,
    ])
  )
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') return value
  const normalized = value.trim()
  return normalized || undefined
}

function normalizeEventDetails(value) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) return value

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      typeof entry === 'string' ? entry.trim() : entry,
    ])
  )
}

function formatSchemaIssues(error) {
  return error.issues
    .slice(0, 5)
    .map((issue) => {
      const path = issue.path.length ? `${issue.path.join('.')}: ` : ''
      return `${path}${issue.message}`
    })
    .join('; ')
}

function normalizeImageMime(value) {
  const mime = String(value || '')
    .trim()
    .toLowerCase()
  return mime === 'image/jpg' ? 'image/jpeg' : mime
}

async function validateSponsorImageBytes(sponsorLogo) {
  const match = sponsorLogo.dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/)
  if (!match) return { ok: false, error: 'Logo de auspiciador inválido' }

  const buffer = Buffer.from(match[2], 'base64')
  try {
    const options = { failOn: 'error', limitInputPixels: 40_000_000 }
    const metadata = await sharp(buffer, options).metadata()
    await sharp(buffer, options).resize({ width: 1, height: 1, fit: 'inside' }).toBuffer()

    const mimeByFormat = {
      png: 'image/png',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
    }
    const actualMime = mimeByFormat[metadata.format]
    const declaredMime = normalizeImageMime(sponsorLogo.mimeType || match[1])
    const headerMime = normalizeImageMime(match[1])

    if (!actualMime || actualMime !== declaredMime || actualMime !== headerMime) {
      return {
        ok: false,
        error: 'El tipo del archivo no coincide con la imagen decodificada',
      }
    }

    if (!metadata.width || !metadata.height) {
      return { ok: false, error: 'La imagen no tiene dimensiones válidas' }
    }
  } catch {
    return { ok: false, error: 'El archivo de imagen está corrupto o no es compatible' }
  }

  return { ok: true }
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

  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'JSON inválido', details: 'El cuerpo de la solicitud no contiene JSON válido' },
      { status: 400 }
    )
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json(
      { error: 'Solicitud inválida', details: 'El cuerpo debe ser un objeto JSON' },
      { status: 400 }
    )
  }

  const rateLimitError = checkWorkflowStartRateLimit(userEmail)
  if (rateLimitError) return rateLimitError

  const contentType = normalizeOptionalString(body.contentType)
  const eventDetails = normalizeEventDetails(body.eventDetails)
  const cta = normalizeOptionalString(body.cta)
  const sponsorLogo = normalizeSponsorLogo(body.sponsorLogo)

  if (isEventContentType(contentType)) {
    const missing = missingEventLogistics(eventDetails, cta, {
      requireCta: contentTypeRequiresEventCta(contentType),
    })
    if (missing.length) {
      return NextResponse.json(
        {
          error: 'Datos del evento incompletos',
          details: `Faltan: ${missing.join(', ')}`,
        },
        { status: 400 }
      )
    }
  }

  if (sponsorLogo) {
    const sponsorCheck = validateSponsorLogo(sponsorLogo)
    if (!sponsorCheck.ok) {
      return NextResponse.json(
        { error: 'Logo de auspiciador inválido', details: sponsorCheck.error },
        { status: 400 }
      )
    }
  }

  const workflowInput = {
    userId: String(userId),
    userEmail,
    intent: normalizeOptionalString(body.intent),
    topic: normalizeOptionalString(body.topic),
    platforms: [...PLATFORMS],
    contentType,
    tone: normalizeOptionalString(body.tone),
    audience: normalizeOptionalString(body.audience),
    cta,
    knownFacts: parseStringArray(body.knownFacts),
    eventDetails,
    hashtags: parseStringArray(body.hashtags),
    links: parseStringArray(body.links),
    imageStyle: normalizeOptionalString(body.imageStyle),
    imageConstraints: normalizeOptionalString(body.imageConstraints),
    backgroundMode: normalizeOptionalString(body.backgroundMode),
    backgroundId: normalizeOptionalString(body.backgroundId),
    sponsorLogo,
  }

  const parsedInput = GenerateInputSchema.safeParse(workflowInput)
  if (!parsedInput.success) {
    return NextResponse.json(
      {
        error: 'Solicitud inválida',
        details: formatSchemaIssues(parsedInput.error),
      },
      { status: 400 }
    )
  }

  if (parsedInput.data.sponsorLogo) {
    const imageCheck = await validateSponsorImageBytes(parsedInput.data.sponsorLogo)
    if (!imageCheck.ok) {
      return NextResponse.json(
        { error: 'Logo de auspiciador inválido', details: imageCheck.error },
        { status: 400 }
      )
    }
  }

  try {
    const workflowTarget =
      generateAiWorkflow && typeof generateAiWorkflow.workflowId === 'string'
        ? generateAiWorkflow
        : { workflowId: GENERATE_WORKFLOW_ID }

    const run = await start(workflowTarget, [parsedInput.data])
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
