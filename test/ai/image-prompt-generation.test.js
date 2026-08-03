import { shouldGenerateImagePrompt } from '../../lib/ai-constants'
import { resolveGenerationGuidelinesForRequest } from '../../lib/ai-guidelines'
import { resolveImageTextPolicy, stripNoTextInstructions } from '../../lib/ai-image-text-policy'
import {
  AiGenerationResultSchema,
  AiImagePromptsResultSchema,
  applyImagePromptGuardrailsToDraft,
  mergeImagePromptsIntoResult,
} from '../../workflows/ai-social-media-designer/generation/generateAiWorkflow'

describe('shouldGenerateImagePrompt', () => {
  test('returns true by default for all content types', () => {
    expect(shouldGenerateImagePrompt('image_post')).toBe(true)
    expect(shouldGenerateImagePrompt('carousel')).toBe(true)
    expect(shouldGenerateImagePrompt('event_promotion')).toBe(true)
    expect(shouldGenerateImagePrompt('educational_astronomy')).toBe(true)
    expect(shouldGenerateImagePrompt('regular_post')).toBe(true)
    expect(shouldGenerateImagePrompt('caption')).toBe(true)
    expect(shouldGenerateImagePrompt('member_update')).toBe(true)
  })

  test('returns false for reel captions (text only)', () => {
    expect(shouldGenerateImagePrompt('reel_caption')).toBe(false)
  })

  test('returns false when an existing template background supplies the visual', () => {
    expect(shouldGenerateImagePrompt('event_promotion', { backgroundMode: 'stock' })).toBe(false)
  })

  test('still returns true when image style or constraints are provided', () => {
    expect(shouldGenerateImagePrompt('regular_post', { imageStyle: 'ilustración' })).toBe(true)
    expect(shouldGenerateImagePrompt('member_update', { imageConstraints: 'sin rostros' })).toBe(
      true
    )
  })
})

describe('resolveGenerationGuidelinesForRequest image prompts', () => {
  const originalBucket = process.env.S3_ARTICLES_BUCKET_NAME

  beforeAll(() => {
    delete process.env.S3_ARTICLES_BUCKET_NAME
  })

  afterAll(() => {
    if (originalBucket === undefined) {
      delete process.env.S3_ARTICLES_BUCKET_NAME
    } else {
      process.env.S3_ARTICLES_BUCKET_NAME = originalBucket
    }
  })

  test('includes imagePrompt generation rules', async () => {
    const resolved = await resolveGenerationGuidelinesForRequest({
      platform: 'instagram',
      contentType: 'image_post',
    })

    expect(resolved.imagePrompt).toMatch(/la imagen debe representar el tema/i)
    expect(resolved.imageValidation).toBeTruthy()
  })
})

describe('AiImagePromptsResultSchema', () => {
  test('accepts valid image prompt entries', () => {
    const valid = {
      imagePrompts: [
        {
          platform: 'instagram',
          imagePrompt:
            'Family-friendly astronomy outreach at night; no identifiable faces, no text overlay.',
          imageRationale: 'Apoya la promoción del evento sin inventar detalles.',
        },
      ],
    }
    expect(AiImagePromptsResultSchema.safeParse(valid).success).toBe(true)
  })
})

describe('applyImagePromptGuardrailsToDraft', () => {
  const baseInput = {
    contentType: 'event_promotion',
    knownFacts: ['Observación nocturna'],
    eventDetails: { name: 'Noche estelar', date: '15 de agosto' },
  }

  test('appends standard safety suffix when missing', () => {
    const draft = applyImagePromptGuardrailsToDraft(
      {
        platform: 'instagram',
        contentType: 'event_promotion',
        draftText: 'Texto',
        imagePrompt: 'Telescopes under a starry sky in Puerto Rico.',
      },
      baseInput
    )

    expect(draft.imagePrompt).toMatch(/no identifiable faces/i)
    expect(draft.imagePrompt).toMatch(/no unrequested text overlay/i)
  })

  test('allows required greeting typography and removes a conflicting no-text clause', () => {
    const requiredTextInput = {
      ...baseInput,
      topic: 'Día del Padre',
      contentType: 'holiday_greeting',
      contentTypeDefinition: {
        id: 'holiday_greeting',
        generation: {
          rules:
            'Debe generar una felicitación de acuerdo al día festivo. La imagen generada debe incluir la felicitación.',
        },
      },
    }
    const draft = applyImagePromptGuardrailsToDraft(
      {
        platform: 'instagram',
        contentType: 'holiday_greeting',
        draftText: 'Feliz Día del Padre.',
        imagePrompt:
          'Father and child observing the stars; no identifiable faces; no text overlay.',
      },
      requiredTextInput
    )

    expect(draft.imagePrompt).not.toMatch(/no text overlay/i)
    expect(draft.imagePrompt).toContain('Required on-image text: "Feliz Día del Padre"')
    expect(draft.imagePrompt).toMatch(/clearly legible/i)
    expect(draft.imagePrompt).toContain('aligned with the publication topic, occasion, and caption')
    expect(draft.imagePrompt).not.toMatch(/astronomy anchor/i)
  })

  test('flags approval claims in image prompts', () => {
    const draft = applyImagePromptGuardrailsToDraft(
      {
        platform: 'facebook',
        contentType: 'event_promotion',
        draftText: 'Texto',
        imagePrompt: 'Event poster aprobado oficialmente por SAC.',
        missingInformation: [],
      },
      baseInput
    )

    expect(draft.missingInformation.some((item) => /aprobación oficial de SAC/i.test(item))).toBe(
      true
    )
  })

  test('flags unprovided dates in image prompts', () => {
    const draft = applyImagePromptGuardrailsToDraft(
      {
        platform: 'instagram',
        contentType: 'event_promotion',
        draftText: 'Texto',
        imagePrompt: 'Poster for event on 20 de diciembre with telescopes.',
        missingInformation: [],
      },
      baseInput
    )

    expect(draft.missingInformation.some((item) => /20 de diciembre/i.test(item))).toBe(true)
  })

  test('flags identifiable portrait prompts', () => {
    const draft = applyImagePromptGuardrailsToDraft(
      {
        platform: 'instagram',
        contentType: 'image_post',
        draftText: 'Texto',
        imagePrompt: 'Portrait of a child looking through a telescope at night.',
        missingInformation: [],
      },
      baseInput
    )

    expect(draft.missingInformation.some((item) => /retrato identificable/i.test(item))).toBe(true)
  })

  test('allows a non-identifiable family scene when it is relevant to the theme', () => {
    const draft = applyImagePromptGuardrailsToDraft(
      {
        platform: 'instagram',
        contentType: 'regular_post',
        draftText: 'Feliz Día del Padre.',
        imagePrompt:
          'Silhouettes of a father and child seen from behind, observing stars through a telescope.',
        missingInformation: [],
      },
      baseInput
    )

    expect(draft.missingInformation).toEqual([])
    expect(draft.imagePrompt).toMatch(/non-identifiably, fully clothed/i)
  })
})

describe('image text policy', () => {
  test('derives a supplied holiday greeting from natural-language type rules', () => {
    const policy = resolveImageTextPolicy({
      topic: 'Día del Padre',
      contentTypeDefinition: {
        generation: {
          rules:
            'Debe generar una felicitación de acuerdo al día festivo. La imagen generada debe incluir la felicitación.',
        },
      },
    })

    expect(policy).toMatchObject({ required: true, suggestedText: 'Feliz Día del Padre' })
  })

  test('removes persisted English and Spanish no-text instructions', () => {
    expect(
      stripNoTextInstructions(
        'Astronomy greeting; no text overlay; sin tipografía; no identifiable faces.'
      )
    ).toBe('Astronomy greeting; no identifiable faces')
  })
})

describe('mergeImagePromptsIntoResult', () => {
  const input = {
    platforms: ['instagram', 'x'],
    contentType: 'image_post',
    imageConstraints: 'sin rostros identificables',
  }

  test('merges prompts by platform and validates schema', () => {
    const textResult = {
      drafts: [
        {
          platform: 'instagram',
          contentType: 'image_post',
          draftText: 'Caption IG',
          missingInformation: [],
        },
        {
          platform: 'x',
          contentType: 'image_post',
          draftText: 'Caption X',
          missingInformation: [],
        },
      ],
      recommendedNextStep: 'Validar.',
      humanReviewRequired: true,
    }

    const merged = mergeImagePromptsIntoResult(
      textResult,
      [
        {
          platform: 'instagram',
          imagePrompt: 'Starry sky over observatory in Puerto Rico.',
          imageRationale: 'Complementa el caption.',
        },
      ],
      input
    )

    expect(AiGenerationResultSchema.safeParse(merged).success).toBe(true)
    const ig = merged.drafts.find((d) => d.platform === 'instagram')
    expect(ig.imagePrompt).toMatch(/no identifiable faces/i)
    expect(ig.imageRationale).toBe('Complementa el caption.')
    const xDraft = merged.drafts.find((d) => d.platform === 'x')
    expect(xDraft.imagePrompt).toBeUndefined()
  })
})
