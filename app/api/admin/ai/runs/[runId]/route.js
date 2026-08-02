import { auth } from '../../../../../../auth'
import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { checkReadAccess } from '../../../../../../lib/api-permissions'
import { buildGeneratedImageAsset } from '../../../../../../lib/ai-image-generation'
import { renderSocialTemplateImage } from '../../../../../../lib/social-template/renderSocialTemplateImage'
import { getWorld } from 'workflow/runtime'
import { getRun } from 'workflow/api'
import { hydrateResourceIO, observabilityRevivers } from 'workflow/observability'

const SOCIAL_IMAGE_WIDTH = 1080
const SOCIAL_IMAGE_HEIGHT = 1440
const MAX_NORMALIZED_IMAGE_BYTES = 2_750_000
const MAX_PROVIDER_DATA_URL_LENGTH = 20_000_000

function extractOwnerFromHydratedInput(hydrated) {
  const input = hydrated?.input

  if (input && typeof input === 'object' && !Array.isArray(input)) {
    if (typeof input.userId === 'string' || typeof input.userEmail === 'string') {
      return { userId: input.userId, userEmail: input.userEmail }
    }
  }

  if (
    Array.isArray(input) &&
    input.length > 0 &&
    typeof input[0] === 'object' &&
    input[0] !== null
  ) {
    const first = input[0]
    if (typeof first.userId === 'string' || typeof first.userEmail === 'string') {
      return { userId: first.userId, userEmail: first.userEmail }
    }
  }

  return null
}

async function getRunOwner(runId) {
  const world = await getWorld()
  const run = await world.runs.get(runId, { resolveData: 'all' })
  const hydrated = hydrateResourceIO(run, observabilityRevivers)
  return extractOwnerFromHydratedInput(hydrated)
}

function safeWorkflowErrorMessage(error) {
  // Avoid leaking internals; PRD says safe failures.
  const message = error?.message ? String(error.message) : ''
  if (!message) return 'La generación falló'
  return message.length > 200 ? `${message.slice(0, 200)}...` : message
}

function imageBufferFromDataUrl(dataUrl) {
  const value = String(dataUrl || '')
  if (value.length > MAX_PROVIDER_DATA_URL_LENGTH) {
    throw new Error('La imagen generada excede el tamaño máximo de entrada')
  }
  const match = value.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/]+={0,2})$/)
  if (!match || match[2].length % 4 !== 0) {
    throw new Error('La imagen generada no tiene un formato válido')
  }
  return Buffer.from(match[2], 'base64')
}

async function normalizeGeneratedImageAsset(asset) {
  if (!asset?.dataUrl) return asset

  const input = imageBufferFromDataUrl(asset.dataUrl)
  const normalized = await sharp(input, {
    failOn: 'error',
    limitInputPixels: 40_000_000,
  })
    .rotate()
    .resize({
      width: SOCIAL_IMAGE_WIDTH,
      height: SOCIAL_IMAGE_HEIGHT,
      fit: 'cover',
      position: 'centre',
    })
    .flatten({ background: '#0B081C' })
    .jpeg({
      quality: 90,
      mozjpeg: true,
      chromaSubsampling: '4:4:4',
    })
    .toBuffer()

  if (normalized.length > MAX_NORMALIZED_IMAGE_BYTES) {
    throw new Error('La imagen generada excede el tamaño seguro de descarga')
  }

  const currentName = asset.downloadFileName || 'sac-borrador-social.jpg'
  return {
    ...asset,
    mimeType: 'image/jpeg',
    dataUrl: `data:image/jpeg;base64,${normalized.toString('base64')}`,
    downloadFileName: currentName.replace(/\.[^.]+$/, '') + '.jpg',
  }
}

/**
 * Render a shared template once and normalize any generated image before returning it.
 * Renders once — SAC publishes the same 3:4 art on every platform.
 * Soft-fail so text results still return.
 */
export async function applyTemplateRendersToWorkflowResult(workflowPayload) {
  if (!workflowPayload || typeof workflowPayload !== 'object') return workflowPayload

  const generationResult = workflowPayload.result
  if (!generationResult || !Array.isArray(generationResult.drafts)) {
    return workflowPayload
  }

  const templateRequest = generationResult.templateRequest
  const templateAssets = generationResult.templateAssets
  let generatedImage = generationResult.generatedImage || null
  let shouldNormalizeGeneratedImage = Boolean(generatedImage?.dataUrl)
  let renderError = null

  if (templateRequest) {
    try {
      if (!templateAssets?.backgroundSource) {
        throw new Error('faltan los assets compartidos de la plantilla')
      }
      const rendered = await renderSocialTemplateImage({
        templateRequest: {
          ...templateRequest,
          backgroundSource: templateAssets.backgroundSource,
          ...(templateAssets.sponsorLogo ? { sponsorLogo: templateAssets.sponsorLogo } : null),
        },
      })
      if (imageBufferFromDataUrl(rendered.dataUrl).length > MAX_NORMALIZED_IMAGE_BYTES) {
        throw new Error('la imagen renderizada excede el tamaño seguro de descarga')
      }
      generatedImage = buildGeneratedImageAsset({
        dataUrl: rendered.dataUrl,
        mimeType: rendered.mimeType,
        downloadFileName: templateAssets.downloadFileName,
        rationale:
          templateAssets.backgroundSource.mode === 'stock'
            ? 'Imagen de plantilla con fondo seleccionado.'
            : 'Imagen de plantilla con fondo generado por IA.',
      })
      shouldNormalizeGeneratedImage = false
    } catch (error) {
      console.error('applyTemplateRendersToWorkflowResult: render failed', error)
      renderError = 'No se pudo preparar la imagen de la plantilla. Intenta nuevamente.'
      generatedImage = null
    }
  }

  if (shouldNormalizeGeneratedImage && generatedImage?.dataUrl) {
    try {
      generatedImage = await normalizeGeneratedImageAsset(generatedImage)
    } catch (error) {
      console.error('applyTemplateRendersToWorkflowResult: image normalization failed', error)
      renderError = 'No se pudo preparar la imagen generada para descarga. Intenta nuevamente.'
      generatedImage = null
    }
  }

  const drafts = generationResult.drafts.map((draft) => {
    const {
      templateRequest: _legacyTemplate,
      generatedImages: _legacyImages,
      ...publicDraft
    } = draft
    const missingInformation = Array.isArray(draft.missingInformation)
      ? [...draft.missingInformation]
      : []
    if (renderError && !missingInformation.includes(renderError)) {
      missingInformation.push(renderError)
    }
    return renderError ? { ...publicDraft, missingInformation } : publicDraft
  })

  const {
    templateRequest: _templateRequest,
    templateAssets: _templateAssets,
    generatedImage: _unnormalizedImage,
    ...publicResult
  } = generationResult

  return {
    ...workflowPayload,
    result: {
      ...publicResult,
      drafts,
      ...(generatedImage ? { generatedImage } : null),
    },
  }
}

export const GET = auth(async function GET(req, { params }) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  // Feature gate: view AI runs (read-only)
  const readError = checkReadAccess(req, 'ai')
  if (readError) return readError

  const userEmail = req.auth.user.email?.toLowerCase()
  const userId = req.auth.user.id || req.auth.user.email

  if (!userEmail) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'No email en sesión' },
      { status: 401 }
    )
  }

  const resolvedParams = await params
  const runId = resolvedParams?.runId
  if (!runId || typeof runId !== 'string') {
    return NextResponse.json({ error: 'runId requerido' }, { status: 400 })
  }

  // Ownership must be checked before returning any status/result to avoid leaking info.
  let owner
  try {
    owner = await getRunOwner(runId)
  } catch {
    // If run doesn't exist or can't be inspected, respond generically.
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  const matches = owner?.userId === String(userId) || owner?.userEmail?.toLowerCase() === userEmail

  if (!matches) {
    // PRD: 403/404 without leaking status/result/error details for forbidden/cross-user runId.
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  const run = getRun(runId)

  // If the run doesn't exist, keep response generic.
  try {
    if (!(await run.exists)) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    }
  } catch {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  const status = await run.status

  if (status === 'completed') {
    const result = await run.returnValue
    const withTemplates = await applyTemplateRendersToWorkflowResult(result)
    return NextResponse.json({ runId, status, result: withTemplates }, { status: 200 })
  }

  if (status === 'failed') {
    try {
      await run.returnValue
    } catch (error) {
      return NextResponse.json(
        { runId, status, error: safeWorkflowErrorMessage(error) },
        { status: 200 }
      )
    }
    return NextResponse.json({ runId, status }, { status: 200 })
  }

  // pending / running / cancelled: just return status.
  return NextResponse.json({ runId, status }, { status: 200 })
})
