import { shouldGenerateImagePrompt } from '../../lib/ai-constants'
import { resolveGenerationGuidelinesForRequest } from '../../lib/ai-guidelines'
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

  test('still returns true when image style or constraints are provided', () => {
    expect(shouldGenerateImagePrompt('regular_post', { imageStyle: 'ilustración' })).toBe(true)
    expect(
      shouldGenerateImagePrompt('member_update', { imageConstraints: 'sin rostros' })
    ).toBe(true)
  })
})

describe('resolveGenerationGuidelinesForRequest image prompts', () => {
  test('includes imagePrompt generation rules', () => {
    const resolved = resolveGenerationGuidelinesForRequest({
      platform: 'instagram',
      contentType: 'image_post',
    })

    expect(resolved.imagePrompt).toMatch(/prompts de imagen/i)
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

    expect(
      draft.missingInformation.some((item) => /aprobación oficial de SAC/i.test(item))
    ).toBe(true)
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

  test('flags risky patterns such as minors', () => {
    const draft = applyImagePromptGuardrailsToDraft(
      {
        platform: 'instagram',
        contentType: 'image_post',
        draftText: 'Texto',
        imagePrompt: 'Children looking through telescopes at night.',
        missingInformation: [],
      },
      baseInput
    )

    expect(draft.missingInformation.some((item) => /menores/i.test(item))).toBe(true)
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
