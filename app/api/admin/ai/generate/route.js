import { auth } from '../../../../../auth'
import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { checkPermission } from '../../../../../lib/api-permissions'
import { AI_BASE_POLICY_VERSION } from '../../../../../lib/ai-agent'
import { shouldGenerateImagePrompt } from '../../../../../lib/ai-constants'
import {
  contentDataToLegacyInput,
  legacyInputToContentData,
  validateContentData,
} from '../../../../../lib/ai-content-data'
import { getActiveGuidelinesStrict } from '../../../../../lib/ai-guidelines'
import {
  resolveContentTypeDefinition,
  resolveContentTypePlatforms,
} from '../../../../../lib/ai-guidelines-schema'
import { checkWorkflowStartRateLimit } from '../../../../../lib/ai-rate-limit'
import { listBackgroundOptions } from '../../../../../lib/social-template/backgroundCatalog'
import { validateSponsorLogo } from '../../../../../lib/social-template/eventFormHelpers'
import { resolveTemplateLayoutId } from '../../../../../lib/social-template/templateLayouts'
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
  const requestedSponsorLogo = normalizeSponsorLogo(body.sponsorLogo)
  let activeGuidelines
  try {
    activeGuidelines = await getActiveGuidelinesStrict()
  } catch (error) {
    console.error('POST /api/admin/ai/generate: active Guidelines unavailable', error)
    return NextResponse.json(
      {
        error: 'Guías no disponibles',
        details: 'No se pudo fijar la versión activa de Guidelines. Intenta nuevamente.',
      },
      { status: 503 }
    )
  }
  const contentTypeDefinition = resolveContentTypeDefinition(activeGuidelines, contentType, {
    includeArchived: true,
  })

  if (!contentTypeDefinition) {
    return NextResponse.json(
      {
        error: 'Tipo de contenido inválido',
        details: `El tipo de contenido "${contentType || ''}" no existe en Guidelines.`,
      },
      { status: 400 }
    )
  }

  if (contentTypeDefinition.status !== 'active') {
    return NextResponse.json(
      {
        error: 'Tipo de contenido archivado',
        details: `El tipo de contenido "${contentTypeDefinition.label}" ya no admite ejecuciones nuevas.`,
      },
      { status: 400 }
    )
  }

  const legacySource = {
    ...body,
    contentType: contentTypeDefinition.id,
    cta,
    eventDetails,
    knownFacts: parseStringArray(body.knownFacts),
    hashtags: parseStringArray(body.hashtags),
    links: parseStringArray(body.links),
    sponsorLogo: requestedSponsorLogo,
  }
  const requestedContentData = Object.prototype.hasOwnProperty.call(body, 'contentData')
    ? body.contentData
    : legacyInputToContentData(legacySource, contentTypeDefinition)
  const contentDataValidation = validateContentData(requestedContentData, contentTypeDefinition)

  if (!contentDataValidation.ok) {
    return NextResponse.json(
      {
        error: 'Datos del contenido inválidos',
        details: contentDataValidation.errors.slice(0, 5).join(' '),
      },
      { status: 400 }
    )
  }

  const normalizedLegacyInput = contentDataToLegacyInput(
    contentDataValidation.data,
    contentTypeDefinition
  )
  const sponsorLogo = normalizedLegacyInput.sponsorLogo
  const configuredPlatforms = Object.keys(activeGuidelines.platforms || {})
  const platforms = resolveContentTypePlatforms(contentTypeDefinition, configuredPlatforms)
  if (!platforms.length) {
    return NextResponse.json(
      {
        error: 'Plataforma no disponible',
        details: `El tipo de contenido "${contentTypeDefinition.label}" no tiene redes disponibles.`,
      },
      { status: 400 }
    )
  }
  if (
    platforms.some(
      (platform) =>
        !Object.prototype.hasOwnProperty.call(activeGuidelines.platforms || {}, platform)
    )
  ) {
    return NextResponse.json(
      {
        error: 'Plataforma no disponible',
        details: 'Todas las plataformas solicitadas deben existir en Guidelines activas.',
      },
      { status: 400 }
    )
  }
  const templateLayout = resolveTemplateLayoutId(contentTypeDefinition.id, contentTypeDefinition)
  const supportsImageForPlatforms = shouldGenerateImagePrompt(
    contentTypeDefinition.id,
    { platforms },
    contentTypeDefinition
  )
  const requestedBackgroundMode = normalizeOptionalString(body.backgroundMode)
  const allowedBackgroundSources = contentTypeDefinition.visual?.backgroundSources || []
  const backgroundMode =
    templateLayout && supportsImageForPlatforms
      ? requestedBackgroundMode ||
        (allowedBackgroundSources.includes('stock')
          ? 'stock'
          : allowedBackgroundSources.includes('ai_generated')
            ? 'ai_generated'
            : undefined)
      : requestedBackgroundMode
  const backgroundId =
    backgroundMode === 'stock'
      ? normalizeOptionalString(body.backgroundId) || listBackgroundOptions()[0]?.id
      : normalizeOptionalString(body.backgroundId)

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
    intent: normalizedLegacyInput.intent,
    topic: normalizedLegacyInput.topic,
    platforms,
    contentType: contentTypeDefinition.id,
    contentData: contentDataValidation.data,
    contentTypeDefinition,
    contentTypeIdentity: {
      id: contentTypeDefinition.id,
      label: contentTypeDefinition.label,
      guidelineVersion: activeGuidelines.version,
    },
    guidelineVersion: activeGuidelines.version,
    policyVersion: AI_BASE_POLICY_VERSION,
    tone: normalizedLegacyInput.tone,
    audience: normalizedLegacyInput.audience,
    cta: normalizedLegacyInput.cta,
    knownFacts: normalizedLegacyInput.knownFacts,
    eventDetails: normalizedLegacyInput.eventDetails,
    hashtags: normalizedLegacyInput.hashtags,
    links: normalizedLegacyInput.links,
    imageStyle: normalizedLegacyInput.imageStyle,
    imageConstraints: normalizedLegacyInput.imageConstraints,
    backgroundMode,
    backgroundId,
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
