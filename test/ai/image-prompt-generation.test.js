import { shouldGenerateImagePrompt } from '../../lib/ai-constants'
import {
  getActiveGuidelines,
  resolveGenerationGuidelinesFromDocument,
} from '../../lib/ai-guidelines'
import {
  applyImagePromptGuardrailsToDraft,
  mergeImagePromptsIntoResult,
} from '../../lib/ai-generation-guardrails'
import {
  AiGenerationResultSchema,
  AiImagePromptsResultSchema,
} from '../../lib/ai-generation-schemas'

describe('shouldGenerateImagePrompt', () => {
  const visualDefinition = {
    id: 'arbitrary_type',
    visual: {
      mode: 'ai_image',
      imagePolicyByPlatform: { x: 'optional', instagram: 'required', facebook: 'prohibited' },
    },
  }

  test('uses only the Guidelines visual definition, never the content type id', () => {
    for (const id of ['image_post', 'reel_caption', 'anything_else']) {
      expect(
        shouldGenerateImagePrompt(
          id,
          { platforms: ['instagram'], contentTypeDefinition: visualDefinition },
          visualDefinition
        )
      ).toBe(true)
    }
    expect(shouldGenerateImagePrompt('image_post')).toBe(false)
  })

  test('returns false when Guidelines prohibit images for every destination', () => {
    expect(
      shouldGenerateImagePrompt(
        'arbitrary_type',
        { platforms: ['facebook'], contentTypeDefinition: visualDefinition },
        visualDefinition
      )
    ).toBe(false)
  })

  test('returns false when Guidelines define a text-only type', () => {
    const textOnlyDefinition = {
      ...visualDefinition,
      visual: {
        mode: 'none',
        imagePolicyByPlatform: { x: 'prohibited', instagram: 'prohibited' },
      },
    }
    expect(shouldGenerateImagePrompt('anything', {}, textOnlyDefinition)).toBe(false)
  })
})

describe('resolveGenerationGuidelinesFromDocument image prompts', () => {
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
    const resolved = resolveGenerationGuidelinesFromDocument(await getActiveGuidelines(), {
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

  test('rejects an image prompt without its rationale', () => {
    expect(
      AiImagePromptsResultSchema.safeParse({
        imagePrompts: [{ platform: 'instagram', imagePrompt: 'Cielo nocturno seguro.' }],
      }).success
    ).toBe(false)
  })
})

describe('applyImagePromptGuardrailsToDraft', () => {
  const baseInput = {
    contentType: 'event_promotion',
    knownFacts: ['Observación nocturna'],
    eventDetails: { name: 'Noche estelar', date: '15 de agosto' },
  }

  test('appends safety and composition suffixes without adding a text directive', () => {
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
    expect(draft.imagePrompt).toMatch(/vertical 3:4 canvas/i)
    expect(draft.imagePrompt).toMatch(/fully inside the frame/i)
    expect(draft.imagePrompt).toMatch(/side-by-side product lineup/i)
    expect(draft.imagePrompt).not.toMatch(/no unrequested text overlay/i)
    expect(draft.imagePrompt).not.toMatch(/required on-image text/i)
    expect(draft.imagePrompt).not.toMatch(/include the greeting or message required/i)
  })

  test.each([
    [
      'visible text',
      'Starry Caribbean sky; no identifiable faces; render the exact headline "Celebremos a papá" in readable type.',
      'render the exact headline "Celebremos a papá" in readable type',
    ],
    ['no text', 'Starry Caribbean sky; no identifiable faces; no text overlay.', 'no text overlay'],
  ])(
    'preserves an arbitrary %s instruction without adding a text policy',
    (_label, prompt, copy) => {
      const draft = applyImagePromptGuardrailsToDraft(
        {
          platform: 'instagram',
          contentType: 'regular_post',
          draftText: 'Texto',
          imagePrompt: prompt,
        },
        baseInput
      )

      expect(draft.imagePrompt).toContain(copy)
      expect(draft.imagePrompt).not.toMatch(/no unrequested text overlay/i)
      expect(draft.imagePrompt).not.toMatch(/required on-image text/i)
      expect(draft.imagePrompt).not.toMatch(/include the greeting or message required/i)
    }
  )

  test('fills every missing safety clause instead of treating one clause as the whole policy', () => {
    const draft = applyImagePromptGuardrailsToDraft(
      {
        platform: 'instagram',
        contentType: 'regular_post',
        draftText: 'Texto',
        imagePrompt: 'Starry sky; no identifiable faces.',
      },
      baseInput
    )

    expect(draft.imagePrompt).toMatch(/No private information/i)
    expect(draft.imagePrompt).toMatch(/No official logos/i)
    expect(draft.imagePrompt).toMatch(/No copyrighted art styles/i)
    expect(draft.imagePrompt).toMatch(/physically plausible/i)
  })

  test('is idempotent when a prompt already contains every deterministic guardrail', () => {
    const once = applyImagePromptGuardrailsToDraft(
      {
        platform: 'instagram',
        contentType: 'regular_post',
        draftText: 'Texto',
        imagePrompt: 'A complete telescope beneath a quiet night sky.',
      },
      baseInput
    )
    const twice = applyImagePromptGuardrailsToDraft(once, baseInput)

    expect(twice.imagePrompt).toBe(once.imagePrompt)
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

describe('mergeImagePromptsIntoResult', () => {
  const input = {
    platforms: ['instagram', 'x'],
    contentType: 'image_post',
    imageConstraints: 'sin rostros identificables',
    contentTypeDefinition: {
      id: 'image_post',
      visual: {
        mode: 'ai_image',
        imagePolicyByPlatform: { instagram: 'required', x: 'prohibited' },
      },
    },
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
