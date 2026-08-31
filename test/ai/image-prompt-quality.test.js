import {
  IMAGE_PROMPT_ASSET_ROLES,
  AiImagePromptPlanResponseSchema,
  buildDeterministicImagePromptFallback,
  buildImagePromptPlanInstructions,
  compileImagePromptFromVisualBrief,
  resolveImagePromptResponse,
} from '../../lib/ai-image-prompt'

function makeVisualBrief(overrides = {}) {
  return {
    concept: 'A quiet moment of discovery beneath a Caribbean night sky',
    subject:
      'A complete amateur telescope on its tripod points upward while two anonymous observers study the sky from behind',
    environment:
      'An open dark-sky field with restrained tropical vegetation and an unobstructed horizon',
    composition:
      'The telescope anchors the lower-left third, the observers form a secondary silhouette, and broad open sky creates a clear visual hierarchy',
    perspectiveAndDepth:
      'Eye-level wide view with foreground grass, a readable midground subject, and layered stars receding into the background',
    lighting:
      'Soft moonless ambient light with a subtle warm practical glow and controlled rim light on the equipment',
    colorPalette:
      'Deep indigo and violet dominate, with muted teal shadows and a small warm amber accent',
    styleAndMedium:
      'Editorial cinematic illustration with natural textures, crisp silhouettes, restrained detail, and a polished finish',
    textTreatment: { mode: 'unspecified' },
    mustInclude: ['A physically complete telescope and tripod', 'Generous edge-safe margins'],
    mustAvoid: ['Split-screen comparison', 'Invented branded equipment'],
    ...overrides,
  }
}

describe('AiImagePromptPlanResponseSchema', () => {
  test('accepts a complete strict visual brief', () => {
    expect(
      AiImagePromptPlanResponseSchema.safeParse({
        visualBrief: makeVisualBrief(),
        sharedImageRationale:
          'Construye una escena narrativa clara y coherente con una publicación educativa de SAC.',
      }).success
    ).toBe(true)
  })

  test('requires literal copy for exact text treatment', () => {
    const result = AiImagePromptPlanResponseSchema.safeParse({
      visualBrief: makeVisualBrief({ textTreatment: { mode: 'exact' } }),
      sharedImageRationale: 'La composición reserva un lugar legible para el mensaje requerido.',
    })

    expect(result.success).toBe(false)
  })

  test.each(['none', 'unspecified'])(
    'rejects ignored text layout fields when mode is %s',
    (mode) => {
      const result = AiImagePromptPlanResponseSchema.safeParse({
        visualBrief: makeVisualBrief({
          textTreatment: { mode, placement: 'Centered in the upper third' },
        }),
        sharedImageRationale: 'No corresponde definir tipografía cuando no existe copy literal.',
      })

      expect(result.success).toBe(false)
    }
  )

  test('normalizes empty optional text fields emitted by a JSON model', () => {
    const result = AiImagePromptPlanResponseSchema.safeParse({
      visualBrief: makeVisualBrief({
        textTreatment: {
          mode: 'unspecified',
          content: '',
          placement: null,
          typography: '   ',
        },
      }),
      sharedImageRationale:
        'La escena mantiene el tratamiento de texto sin especificar, conforme a las Guidelines.',
    })

    expect(result.success).toBe(true)
    expect(result.data.visualBrief.textTreatment).toEqual({ mode: 'unspecified' })
  })
})

describe('compileImagePromptFromVisualBrief', () => {
  test('compiles every art-direction dimension in a stable order', () => {
    const prompt = compileImagePromptFromVisualBrief(
      makeVisualBrief({
        textTreatment: {
          mode: 'exact',
          content: 'Mira hacia arriba',
          placement: 'Centered in the upper third',
          typography: 'Large geometric sans serif with high contrast',
        },
      })
    )

    expect(prompt).toMatch(/^Create one polished/)
    expect(prompt).toContain('Core concept: A quiet moment of discovery')
    expect(prompt).toContain('Primary subject and action: A complete amateur telescope')
    expect(prompt).toContain('Composition and visual hierarchy:')
    expect(prompt).toContain('Perspective and depth:')
    expect(prompt).toContain('Lighting: Soft moonless ambient light')
    expect(prompt).toContain('Color palette: Deep indigo and violet')
    expect(prompt).toContain('Style and finish: Editorial cinematic illustration')
    expect(prompt).toContain('render exactly "Mira hacia arriba"')
    expect(prompt).toContain('Must include: A physically complete telescope and tripod')
    expect(prompt).toContain('Avoid: Split-screen comparison')
  })

  test('does not invent a text directive when Guidelines leave it unspecified', () => {
    const prompt = compileImagePromptFromVisualBrief(makeVisualBrief())

    expect(prompt).not.toMatch(/On-image copy|Typography:/)
  })

  test('requires no text and adds overlay-safe composition for template backdrops', () => {
    const prompt = compileImagePromptFromVisualBrief(
      makeVisualBrief({ textTreatment: { mode: 'none' } }),
      { assetRole: IMAGE_PROMPT_ASSET_ROLES.TEMPLATE_BACKDROP }
    )

    expect(prompt).toMatch(/clean background plate/i)
    expect(prompt).toMatch(/render no text, letters, numbers/i)
    expect(prompt).toMatch(/central and lower text zones calm/i)

    expect(() =>
      compileImagePromptFromVisualBrief(makeVisualBrief(), {
        assetRole: IMAGE_PROMPT_ASSET_ROLES.TEMPLATE_BACKDROP,
      })
    ).toThrow(/textTreatment\.mode "none"/)
  })
})

describe('resolveImagePromptResponse', () => {
  test('compiles the structured response and preserves its rationale', () => {
    const resolved = resolveImagePromptResponse({
      visualBrief: makeVisualBrief(),
      sharedImageRationale:
        'Convierte el tema en una escena única con jerarquía, profundidad y acabado definidos.',
    })

    expect(resolved.format).toBe('visual_brief')
    expect(resolved.sharedPrompt).toContain('Core concept:')
    expect(resolved.sharedRationale).toMatch(/escena única/)
  })

  test('does not hide an invalid visual brief behind a legacy prompt', () => {
    expect(() =>
      resolveImagePromptResponse({
        visualBrief: { concept: 'Incomplete' },
        sharedImagePrompt: 'A generic fallback image.',
        sharedImageRationale: 'Este brief está incompleto y debe provocar un reintento.',
      })
    ).toThrow(/Brief visual inválido/)
  })

  test('keeps the previous provider response shape as a compatibility fallback', () => {
    expect(
      resolveImagePromptResponse({
        sharedImagePrompt: 'A physically plausible telescope under a clear night sky.',
        sharedImageRationale: 'Apoya el tema sin añadir información nueva.',
      })
    ).toEqual({
      sharedPrompt: 'A physically plausible telescope under a clear night sky.',
      sharedRationale: 'Apoya el tema sin añadir información nueva.',
      format: 'legacy_prompt',
    })
  })
})

describe('buildImagePromptPlanInstructions', () => {
  test('requires concrete art direction and a silent quality review', () => {
    const instructions = buildImagePromptPlanInstructions()

    expect(instructions).toContain('visualBrief')
    expect(instructions).toMatch(/microhistoria visual/i)
    expect(instructions).toMatch(/perspectiveAndDepth, lighting, colorPalette/i)
    expect(instructions).toMatch(/revisa silenciosamente/i)
  })

  test('pins backdrop output to a no-text intermediate asset', () => {
    const instructions = buildImagePromptPlanInstructions({
      assetRole: IMAGE_PROMPT_ASSET_ROLES.TEMPLATE_BACKDROP,
    })

    expect(instructions).toContain('textTreatment.mode DEBE ser "none"')
    expect(instructions).toMatch(/zona central y baja amplia/i)
  })
})

describe('buildDeterministicImagePromptFallback', () => {
  test('uses Guidelines-defined fields and validated values without branching on a type id', () => {
    const fallback = buildDeterministicImagePromptFallback({
      topic: 'Binoculares vs. telescopios',
      contentData: {
        topic: 'Binoculares vs. telescopios',
        confirmed: 'La luz nos ayuda a ver mejor las estrellas.',
      },
      knownFacts: ['Los binoculares son una opción accesible para comenzar.'],
      imageStyle: 'Ilustración editorial limpia',
      imageConstraints: 'Sin comparativa partida ni marcas comerciales',
      contentTypeDefinition: {
        id: 'any-guideline-defined-id',
        label: 'Contenido educativo',
        fields: [
          { key: 'topic', label: 'Tema' },
          { key: 'confirmed', label: 'Datos confirmados' },
        ],
        generation: { rules: 'Representar únicamente los datos provistos.' },
      },
    })

    expect(fallback.sharedPrompt).toContain('Binoculares vs. telescopios')
    expect(fallback.sharedPrompt).toContain('Datos confirmados: La luz nos ayuda')
    expect(fallback.sharedPrompt).toContain('Representar únicamente los datos provistos')
    expect(fallback.sharedPrompt).toContain('Ilustración editorial limpia')
    expect(fallback.sharedPrompt).not.toContain('any-guideline-defined-id')
    expect(fallback.sharedRationale).toMatch(/reconstruyó un brief visual seguro/i)
  })

  test('does not inject astronomy semantics into an arbitrary Guidelines-defined type', () => {
    const fallback = buildDeterministicImagePromptFallback({
      topic: 'Taller de escritura',
      contentData: { topic: 'Taller de escritura' },
      contentTypeDefinition: {
        id: 'arbitrary_type',
        label: 'Anuncio comunitario',
        fields: [{ key: 'topic', label: 'Tema' }],
        generation: { rules: 'Representar únicamente un cuaderno y un lápiz.' },
      },
    })

    expect(fallback.sharedPrompt).toContain('Representar únicamente un cuaderno y un lápiz')
    expect(fallback.sharedPrompt).not.toMatch(/astronomy|telescope|celestial|branded equipment/i)
  })
})
