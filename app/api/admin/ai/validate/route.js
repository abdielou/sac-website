import { auth } from '../../../../../auth'
import { NextResponse } from 'next/server'
import { checkPermission } from '../../../../../lib/api-permissions'
import { AI_BASE_POLICY_VERSION } from '../../../../../lib/ai-agent'
import {
  MAX_IMAGE_SIZE_BYTES,
  MAX_VALIDATION_IMAGES,
  contentTypeAcceptsImages,
  contentTypeRequiresImages,
} from '../../../../../lib/ai-constants'
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
import {
  VALIDATION_IMAGE_MIME_TYPES,
  normalizeSerializedValidationImages,
} from '../../../../../lib/ai-validation-images'
import { start } from 'workflow/api'
import {
  ValidateInputSchema,
  validateAiWorkflow,
} from '../../../../../workflows/ai-social-media-designer/validation/validateAiWorkflow'

const VALIDATE_WORKFLOW_ID =
  'workflow//./workflows/ai-social-media-designer/validation/validateAiWorkflow//validateAiWorkflow'

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

function formatSchemaIssues(error) {
  return error.issues
    .slice(0, 5)
    .map((issue) => {
      const path = issue.path.length ? `${issue.path.join('.')}: ` : ''
      return `${path}${issue.message}`
    })
    .join('; ')
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

  const rateLimitError = checkWorkflowStartRateLimit(userEmail)
  if (rateLimitError) return rateLimitError

  try {
    const contentTypeHeader = req.headers.get('content-type') || ''

    let platform
    let platforms
    let contentType
    let draftText
    let goal
    let audience
    let cta
    let hashtags
    let links
    let eventDetails
    let altText
    let contentData
    let legacySource
    let images = []

    if (contentTypeHeader.includes('multipart/form-data')) {
      const formData = await req.formData()

      platform = formData.get('platform')
      platforms = parseStringArray(formData.get('platforms'))
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

      const contentDataStr = formData.get('contentData')
      if (contentDataStr) {
        try {
          contentData = JSON.parse(String(contentDataStr))
        } catch {
          return NextResponse.json({ error: 'contentData inválido' }, { status: 400 })
        }
      }

      legacySource = {
        intent: goal,
        topic: goal,
        audience,
        cta,
        hashtags,
        links,
        eventDetails,
      }

      const imageFiles = formData.getAll('images').filter((f) => f && f.size > 0)

      if (imageFiles.length > MAX_VALIDATION_IMAGES) {
        return NextResponse.json(
          { error: 'Demasiadas imágenes', details: `Máximo ${MAX_VALIDATION_IMAGES}` },
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

        if (!VALIDATION_IMAGE_MIME_TYPES.includes(mime.toLowerCase())) {
          return NextResponse.json(
            { error: 'Archivo inválido', details: 'Se requiere una imagen PNG, JPEG o WebP' },
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
      platforms = parseStringArray(body.platforms)
      contentType = body.contentType
      draftText = body.draftText
      goal = body.goal
      audience = body.audience
      cta = body.cta
      hashtags = parseStringArray(body.hashtags)
      links = parseStringArray(body.links)
      eventDetails = body.eventDetails
      altText = body.altText
      contentData = body.contentData
      legacySource = body
      images = body.images || []
    }

    const normalizedImages = normalizeSerializedValidationImages(images)
    if (!normalizedImages.ok) {
      return NextResponse.json(
        { error: 'Imágenes inválidas', details: normalizedImages.error },
        { status: 400 }
      )
    }
    images = normalizedImages.images

    platform =
      typeof platform === 'string'
        ? platform.trim().toLowerCase()
        : platform?.toString().trim().toLowerCase()
    platforms = (platforms?.length ? platforms : platform ? [platform] : []).map((value) =>
      String(value).trim().toLowerCase()
    )
    platforms = [...new Set(platforms)]
    platform = platforms[0]
    contentType =
      typeof contentType === 'string' ? contentType.trim() : contentType?.toString().trim()
    draftText = typeof draftText === 'string' ? draftText : draftText?.toString()

    if (!platforms.length || !contentType || !draftText || !draftText.trim()) {
      return NextResponse.json(
        {
          error: 'Campos requeridos',
          details: 'platforms, contentType y draftText son obligatorios',
        },
        { status: 400 }
      )
    }

    let activeGuidelines
    try {
      activeGuidelines = await getActiveGuidelinesStrict()
    } catch (error) {
      console.error('POST /api/admin/ai/validate: active Guidelines unavailable', error)
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
          details: `El tipo de contenido "${contentType}" no existe en Guidelines.`,
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

    const unavailableRequestedPlatform = platforms.find(
      (id) => !Object.prototype.hasOwnProperty.call(activeGuidelines.platforms || {}, id)
    )
    if (unavailableRequestedPlatform) {
      return NextResponse.json(
        {
          error: 'Plataforma no disponible',
          details: `La plataforma "${unavailableRequestedPlatform}" ya no está configurada en Guidelines.`,
        },
        { status: 400 }
      )
    }

    platforms = resolveContentTypePlatforms(
      contentTypeDefinition,
      Object.keys(activeGuidelines.platforms || {})
    )
    platform = platforms[0]
    if (!platforms.length) {
      return NextResponse.json(
        {
          error: 'Plataforma no disponible',
          details: `El tipo de contenido "${contentTypeDefinition.label}" no tiene redes disponibles.`,
        },
        { status: 400 }
      )
    }

    const requestedContentData =
      contentData === undefined
        ? legacyInputToContentData(
            {
              ...legacySource,
              intent: legacySource?.intent || goal || 'Validar borrador existente',
              topic: legacySource?.topic || goal || draftText.trim().slice(0, 600),
              audience,
              cta,
              hashtags,
              links,
              eventDetails,
            },
            contentTypeDefinition
          )
        : contentData
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

    if (
      (images?.length > 0 || normalizedLegacyInput.sponsorLogo?.dataUrl) &&
      !platforms.some((id) =>
        contentTypeAcceptsImages(id, contentTypeDefinition.id, contentTypeDefinition)
      )
    ) {
      return NextResponse.json(
        {
          error: 'Imagen no permitida',
          details: 'Este tipo de contenido no admite imágenes en las redes configuradas',
        },
        { status: 400 }
      )
    }

    if (
      platforms.some((id) =>
        contentTypeRequiresImages(id, contentTypeDefinition.id, contentTypeDefinition)
      ) &&
      (!images || images.length === 0)
    ) {
      return NextResponse.json(
        {
          error: 'Imagen requerida',
          details: 'Se requiere al menos una imagen para este paquete y tipo de contenido',
        },
        { status: 400 }
      )
    }

    const workflowInput = {
      userId: String(userId),
      userEmail,
      platform,
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
      draftText,
      goal: normalizedLegacyInput.intent || normalizedLegacyInput.topic,
      topic: normalizedLegacyInput.topic,
      audience: normalizedLegacyInput.audience,
      cta: normalizedLegacyInput.cta,
      tone: normalizedLegacyInput.tone,
      knownFacts: normalizedLegacyInput.knownFacts,
      hashtags: normalizedLegacyInput.hashtags,
      links: normalizedLegacyInput.links,
      eventDetails: normalizedLegacyInput.eventDetails,
      imageStyle: normalizedLegacyInput.imageStyle,
      imageConstraints: normalizedLegacyInput.imageConstraints,
      altText: altText ? String(altText) : undefined,
      images,
    }

    const parsedInput = ValidateInputSchema.safeParse(workflowInput)
    if (!parsedInput.success) {
      return NextResponse.json(
        {
          error: 'Solicitud inválida',
          details: formatSchemaIssues(parsedInput.error),
        },
        { status: 400 }
      )
    }

    const workflowTarget =
      validateAiWorkflow && typeof validateAiWorkflow.workflowId === 'string'
        ? validateAiWorkflow
        : { workflowId: VALIDATE_WORKFLOW_ID }

    const run = await start(workflowTarget, [parsedInput.data])
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
