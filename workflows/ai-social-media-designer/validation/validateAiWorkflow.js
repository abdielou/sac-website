import { fetch } from 'workflow'
import { z } from 'zod'
import { resolveGuidelinesForRequest } from '../../../lib/ai-guidelines'

// S3 run-history persistence (`persistRunHistory`) is deferred until Phase 3 —
// we do not currently have the bucket write permissions required to store runs.

// ---------- Validation output schema (must match PRD) ----------

const IssueSchema = z.object({
  severity: z.enum(['minor', 'major', 'critical']),
  category: z.enum([
    'brand_voice',
    'guideline_compliance',
    'platform_fit',
    'clarity',
    'completeness',
    'uncertainty_factual_risk',
    'accessibility',
    'safety',
    'formatting',
    'privacy',
    'image_text_alignment',
    'image_suitability',
  ]),
  message: z.string(),
  suggestedFix: z.string().optional(),
  affectedPlatform: z.string().optional(),
})

export const AiValidationResultSchema = z.object({
  overallOutcome: z.enum(['pass', 'warning', 'fail']),
  approvalRecommendation: z.enum(['ready_for_review', 'needs_edits', 'do_not_publish']),
  summary: z.string(),
  issues: z.array(IssueSchema),
  platformNotes: z.string().optional(),
  imageNotes: z.string().optional(),
  suggestedRevision: z.string().optional(),
  humanReviewRequired: z.literal(true),
})

const ImageInputSchema = z.object({
  dataUrl: z.string(),
  mimeType: z.string(),
  fileName: z.string().optional(),
  size: z.number().optional(),
})

const ValidateInputSchema = z.object({
  userId: z.string(),
  userEmail: z.string().email(),
  platform: z.string(),
  contentType: z.string(),
  draftText: z.string(),
  goal: z.string().optional(),
  audience: z.string().optional(),
  cta: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  links: z.array(z.string()).optional(),
  eventDetails: z.record(z.any()).optional(),
  altText: z.string().optional(),
  images: z.array(ImageInputSchema).optional(),
})

function extractFirstJsonObject(text) {
  const cleaned = text
    .replace(/```(?:json)?/g, '')
    .replace(/```/g, '')
    .trim()

  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) return null

  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

export function buildFallbackResult(input, reason) {
  return AiValidationResultSchema.parse({
    overallOutcome: 'fail',
    approvalRecommendation: 'do_not_publish',
    summary: `No fue posible validar automáticamente: ${reason}. Se requiere revisión humana.`,
    issues: [
      {
        severity: 'major',
        category: 'uncertainty_factual_risk',
        message: `Validación fallida: ${reason}`,
        suggestedFix: 'Revisar el borrador y, si aplica, contrastar detalles con fuentes internas.',
        affectedPlatform: input.platform,
      },
    ],
    platformNotes: 'La validación automática falló; no bloquea el flujo manual.',
    imageNotes:
      input.images && input.images.length > 0
        ? 'Incluiste imágenes, pero la validación automática no pudo completarse.'
        : undefined,
    suggestedRevision: input.draftText,
    humanReviewRequired: true,
  })
}

async function validatePayloadStep(input) {
  'use step'
  const parsed = ValidateInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'Input inválido (schema)',
      fallback: buildFallbackResult(
        {
          userId: input.userId || 'unknown',
          userEmail: input.userEmail || 'unknown@example.com',
          platform: input.platform || 'unknown',
          contentType: input.contentType || 'unknown',
          draftText: input.draftText || '',
          images: input.images,
          goal: input.goal,
          audience: input.audience,
          cta: input.cta,
          hashtags: input.hashtags,
          links: input.links,
          eventDetails: input.eventDetails,
          altText: input.altText,
        },
        'Input inválido'
      ),
    }
  }

  return { ok: true, value: parsed.data }
}

async function loadGuidelinesStep(input) {
  'use step'
  return resolveGuidelinesForRequest({
    platform: input.platform,
    contentType: input.contentType,
  })
}

/**
 * Extract OpenRouter usage metadata from a chat/completions response.
 * Returns null when the response has no usable usage fields.
 */
export function extractOpenRouterUsage(data, model) {
  const usage = data?.usage
  if (!usage || typeof usage !== 'object') return null

  const promptTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : undefined
  const completionTokens =
    typeof usage.completion_tokens === 'number' ? usage.completion_tokens : undefined
  const totalTokens = typeof usage.total_tokens === 'number' ? usage.total_tokens : undefined
  const costAmount = typeof usage.cost === 'number' ? usage.cost : undefined

  if (
    promptTokens === undefined &&
    completionTokens === undefined &&
    totalTokens === undefined &&
    costAmount === undefined
  ) {
    return null
  }

  return {
    openRouterGenerationId: typeof data?.id === 'string' ? data.id : undefined,
    model: typeof data?.model === 'string' ? data.model : model,
    promptTokens,
    completionTokens,
    totalTokens,
    cost:
      costAmount !== undefined
        ? {
            amount: costAmount,
            currency: 'USD',
          }
        : undefined,
  }
}

/**
 * Merge usage from multiple OpenRouter attempts (e.g. retries).
 * Sums tokens/cost; keeps the latest successful generation id/model.
 */
export function mergeOpenRouterUsage(a, b) {
  if (!a) return b || null
  if (!b) return a

  const sumOptional = (x, y) => {
    if (typeof x !== 'number' && typeof y !== 'number') return undefined
    return (typeof x === 'number' ? x : 0) + (typeof y === 'number' ? y : 0)
  }

  const amountA = a.cost?.amount
  const amountB = b.cost?.amount
  const mergedAmount = sumOptional(amountA, amountB)

  return {
    openRouterGenerationId: b.openRouterGenerationId || a.openRouterGenerationId,
    model: b.model || a.model,
    promptTokens: sumOptional(a.promptTokens, b.promptTokens),
    completionTokens: sumOptional(a.completionTokens, b.completionTokens),
    totalTokens: sumOptional(a.totalTokens, b.totalTokens),
    cost:
      mergedAmount !== undefined
        ? {
            amount: mergedAmount,
            currency: b.cost?.currency || a.cost?.currency || 'USD',
          }
        : undefined,
  }
}

async function callOpenRouterStep(input, guidelines) {
  'use step'

  const apiKey = process.env.OPENROUTER_API_KEY
  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'

  if (!apiKey) {
    return {
      ok: false,
      reason: 'Falta OPENROUTER_API_KEY',
      model,
      result: buildFallbackResult(input, 'Falta configuración del provider'),
      usage: null,
    }
  }

  const siteUrl = process.env.OPENROUTER_SITE_URL
  const openRouterTitle = process.env.OPENROUTER_TITLE

  const systemPrompt = `Eres un validador de publicaciones para SAC.
Devuelve EXACTAMENTE un objeto JSON (sin texto adicional, sin markdown) con esta forma:

{
  "overallOutcome": "pass" | "warning" | "fail",
  "approvalRecommendation": "ready_for_review" | "needs_edits" | "do_not_publish",
  "summary": string,
  "issues": [
    {
      "severity": "minor" | "major" | "critical",
      "category": "brand_voice" | "guideline_compliance" | "platform_fit" | "clarity" | "completeness" | "uncertainty_factual_risk" | "accessibility" | "safety" | "formatting" | "privacy" | "image_text_alignment" | "image_suitability",
      "message": string,
      "suggestedFix": string (opcional),
      "affectedPlatform": string (opcional)
    }
  ],
  "platformNotes": string (opcional),
  "imageNotes": string (opcional),
  "suggestedRevision": string (opcional),
  "humanReviewRequired": true
}

Reglas:
- Usa EXACTAMENTE esas claves y esos valores permitidos. "humanReviewRequired" debe ser siempre true.
- "issues" siempre es un arreglo (usa [] si no hay problemas).
- No inventes datos no provistos (fechas, lugares, costos, enlaces, hechos científicos verificables).
- Astronomía: NO verificas hechos; si hay riesgo de afirmaciones no verificables, marca uncertainty_factual_risk.
`

  const userText = {
    platform: input.platform,
    contentType: input.contentType,
    draftText: input.draftText,
    goal: input.goal,
    audience: input.audience,
    cta: input.cta,
    hashtags: input.hashtags,
    links: input.links,
    eventDetails: input.eventDetails,
    altText: input.altText,
    guidelines: guidelines,
    imageCount: input.images?.length || 0,
  }

  const messageContent = [
    {
      type: 'text',
      text: `Validar el borrador y retornar AiValidationResult.
Input (JSON): ${JSON.stringify(userText)}`,
    },
  ]

  if (input.images && input.images.length > 0) {
    for (const img of input.images) {
      messageContent.push({
        type: 'image_url',
        image_url: {
          url: img.dataUrl,
        },
      })
    }
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: messageContent },
  ]

  const attempt = async () => {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(siteUrl ? { 'HTTP-Referer': siteUrl } : null),
        ...(openRouterTitle ? { 'X-OpenRouter-Title': openRouterTitle } : null),
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`OpenRouter HTTP ${res.status}: ${text}`)
    }

    const data = await res.json()
    const usage = extractOpenRouterUsage(data, model)
    const assistantText = data?.choices?.[0]?.message?.content
    if (!assistantText || typeof assistantText !== 'string') {
      const err = new Error('Respuesta del provider sin contenido')
      err.usage = usage
      throw err
    }

    const json = extractFirstJsonObject(assistantText)
    if (!json) {
      const err = new Error('No se pudo extraer JSON del contenido')
      err.usage = usage
      throw err
    }

    const validated = AiValidationResultSchema.parse(json)
    return { result: validated, usage }
  }

  let accumulatedUsage = null

  try {
    const first = await attempt()
    return { ok: true, model, result: first.result, usage: first.usage }
  } catch (err1) {
    accumulatedUsage = mergeOpenRouterUsage(accumulatedUsage, err1?.usage || null)
    try {
      const second = await attempt()
      return {
        ok: true,
        model,
        result: second.result,
        usage: mergeOpenRouterUsage(accumulatedUsage, second.usage),
      }
    } catch (err2) {
      accumulatedUsage = mergeOpenRouterUsage(accumulatedUsage, err2?.usage || null)
      return {
        ok: false,
        model,
        reason: err1?.message || 'Fallo provider/modelo',
        result: buildFallbackResult(input, err1?.message || 'Fallo provider/modelo'),
        usage: accumulatedUsage,
      }
    }
  }
}

export async function validateAiWorkflow(input) {
  'use workflow'

  const validatedInputResult = await validatePayloadStep(input)
  if (!validatedInputResult.ok) {
    return { result: validatedInputResult.fallback, usage: null }
  }

  const validatedInput = validatedInputResult.value
  const guidelines = await loadGuidelinesStep(validatedInput)
  const modelResult = await callOpenRouterStep(validatedInput, guidelines)

  return {
    result: modelResult.result,
    usage: modelResult.usage ?? null,
  }
}
