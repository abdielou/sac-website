import sharp from 'sharp'
import { AI_BASE_POLICY_VERSION } from '../../lib/ai-agent'
import { legacyInputToContentData } from '../../lib/ai-content-data'
import { getDefaultGuidelines } from '../../lib/ai-guidelines'
import { resolveContentTypeDefinition } from '../../lib/ai-guidelines-schema'
import {
  DEFAULT_GENERATION_FORM,
  buildGenerationPayload,
} from '../../lib/social-template/buildGenerationPayload'
import {
  getBackgroundById,
  listBackgroundOptions,
} from '../../lib/social-template/backgroundCatalog'
import {
  EVENT_POSTER_BODY_FALLBACK,
  EVENT_POSTER_SUBTITLE_FALLBACK,
  attachTemplateRequestsToResult,
  buildTemplateTextFields,
} from '../../lib/social-template/buildTemplateTextFields'
import { buildTemplateSvg } from '../../lib/social-template/buildTemplateSvg'
import {
  EVENT_WEATHER_DISCLAIMER,
  buildEventDetails,
  deriveEventTopicAndIntent,
  formatEventDateLabel,
  formatEventTimeLabel,
  missingEventLogistics,
  validateSponsorLogo,
} from '../../lib/social-template/eventFormHelpers'
import {
  getPlatformCanvas,
  getSocialCanvas,
  PLATFORM_CANVAS,
  SOCIAL_CANVAS,
} from '../../lib/social-template/platformCanvas'
import { renderSocialTemplateImage } from '../../lib/social-template/renderSocialTemplateImage'
import {
  getTemplateLayout,
  resolveTemplateLayoutId,
} from '../../lib/social-template/templateLayouts'
import { fitAndWrapText, wrapText } from '../../lib/social-template/textWrap'
import { GenerateInputSchema } from '../../workflows/ai-social-media-designer/generation/generateAiWorkflow'

const completeEventDetails = {
  name: 'Noche de Observación',
  date: '2026-07-11',
  time: '19:15',
  location: 'Pitahaya, Cabo Rojo',
}

function parseTemplateSvg(svg) {
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml')
  expect(document.querySelector('parsererror')).toBeNull()
  return document.documentElement
}

function getSvgTextValues(root) {
  return [...root.querySelectorAll('text, tspan')].map((node) => node.textContent).filter(Boolean)
}

function getNumericAttribute(element, attribute) {
  return Number(element.getAttribute(attribute))
}

describe('socialCanvas', () => {
  test('canonical canvas is 1080x1440 (3:4)', () => {
    expect(SOCIAL_CANVAS).toEqual({ width: 1080, height: 1440, label: expect.any(String) })
    expect(getSocialCanvas()).toEqual(SOCIAL_CANVAS)
  })

  test('all platform entries point to the canonical canvas', () => {
    expect(PLATFORM_CANVAS.instagram).toBe(SOCIAL_CANVAS)
    expect(PLATFORM_CANVAS.facebook).toBe(SOCIAL_CANVAS)
    expect(PLATFORM_CANVAS.x).toBe(SOCIAL_CANVAS)
  })

  test('deprecated getPlatformCanvas returns canonical canvas', () => {
    expect(getPlatformCanvas('instagram')).toEqual(SOCIAL_CANVAS)
    expect(getPlatformCanvas('facebook')).toEqual(SOCIAL_CANVAS)
  })
})

describe('backgroundCatalog', () => {
  test('lists the three stock backgrounds', () => {
    const options = listBackgroundOptions()
    expect(options).toHaveLength(3)
    expect(options.map((o) => o.id)).toEqual([
      'telescope-nebula',
      'moon-diagrams',
      'palms-milky-way',
    ])
    expect(getBackgroundById('moon-diagrams')?.fileName).toBe('moon-diagrams.jpg')
  })
})

describe('event form helpers', () => {
  test('uses the approved weather disclaimer verbatim', () => {
    expect(EVENT_WEATHER_DISCLAIMER).toBe('*Actividad sujeta a condiciones del tiempo')
  })

  test('formats ISO dates and 24h times for Puerto Rico cards', () => {
    expect(formatEventDateLabel('2026-07-11')).toBe('SÁB 11 JUL')
    expect(formatEventTimeLabel('19:15')).toBe('7:15 PM')
    expect(formatEventDateLabel('mañana')).toBe('mañana')
    expect(formatEventTimeLabel('8 PM')).toBe('8 PM')
  })

  test('derives topic and intent from event logistics', () => {
    const derived = deriveEventTopicAndIntent({
      contentType: 'observation_night',
      eventName: 'No debe reemplazar la identidad',
      eventDate: '2026-07-11',
      eventTime: '19:15',
      eventLocation: 'Pitahaya, Cabo Rojo',
    })
    expect(derived.topic).toContain('Noche de Observación')
    expect(derived.topic).toContain('Pitahaya, Cabo Rojo')
    expect(derived.intent).toContain('Pitahaya, Cabo Rojo')
  })

  test('buildEventDetails preserves the observation-night identity', () => {
    expect(
      buildEventDetails({
        contentType: 'observation_night',
        eventName: 'Otro evento',
        eventDate: '2026-07-11',
        eventTime: '19:15',
        eventLocation: 'Pitahaya, Cabo Rojo',
      })
    ).toEqual(completeEventDetails)
  })

  test('missingEventLogistics reports incomplete fields', () => {
    expect(missingEventLogistics({}, '')).toEqual(['nombre', 'fecha', 'hora', 'lugar', 'CTA'])
    expect(missingEventLogistics({}, '', { requireCta: false })).toEqual([
      'nombre',
      'fecha',
      'hora',
      'lugar',
    ])
    expect(missingEventLogistics(completeEventDetails, 'Regístrate')).toEqual([])
  })

  test('validateSponsorLogo enforces mime and size', () => {
    expect(validateSponsorLogo(null).ok).toBe(true)
    expect(
      validateSponsorLogo({
        dataUrl: 'data:image/png;base64,aaaa',
        mimeType: 'image/png',
      }).ok
    ).toBe(true)
    expect(
      validateSponsorLogo({
        dataUrl: 'data:image/gif;base64,aaaa',
        mimeType: 'image/gif',
      }).ok
    ).toBe(false)
  })
})

describe('buildGenerationPayload', () => {
  test('defaults are event-first with a stock template', () => {
    expect(DEFAULT_GENERATION_FORM.platforms).toBeUndefined()
    expect(DEFAULT_GENERATION_FORM.contentType).toBe('observation_night')
    expect(DEFAULT_GENERATION_FORM.generationMode).toBe('text_and_image')
    expect(DEFAULT_GENERATION_FORM.publicationText).toBe('')
    expect(DEFAULT_GENERATION_FORM.eventName).toBe('')
    expect(DEFAULT_GENERATION_FORM.backgroundMode).toBe('stock')
    expect(DEFAULT_GENERATION_FORM.backgroundId).toBe('telescope-nebula')
    expect(DEFAULT_GENERATION_FORM.templatePresentation).toBe('rail')
  })

  test('derives topic/intent and includes sponsor for events', () => {
    const payload = buildGenerationPayload({
      ...DEFAULT_GENERATION_FORM,
      eventName: 'Intento de reemplazo',
      eventDate: '2026-07-11',
      eventTime: '19:15',
      eventLocation: 'Pitahaya, Cabo Rojo',
      eventCta: 'Acompáñanos',
      sponsorLogo: {
        dataUrl: 'data:image/png;base64,aaaa',
        mimeType: 'image/png',
        fileName: 'sponsor.png',
      },
    })
    expect(payload.contentType).toBe('observation_night')
    expect(payload.platforms).toEqual(['x', 'instagram', 'facebook'])
    expect(payload.intent).toContain('Pitahaya')
    expect(payload.topic).toContain('Noche de Observación')
    expect(payload.cta).toBe('Acompáñanos')
    expect(payload.eventDetails).toEqual(completeEventDetails)
    expect(payload.sponsorLogo.fileName).toBe('sponsor.png')
    expect(payload.backgroundMode).toBe('stock')
    expect(payload.templatePresentation).toBe('rail')
    expect(payload.generationMode).toBe('text_and_image')
    expect(payload).not.toHaveProperty('publicationText')
  })

  test('preserves raw publication text only for image-only generation', () => {
    const publicationText = '  **Mira el cielo** 🔭\n\n- Esta noche  '
    const imageOnlyPayload = buildGenerationPayload({
      ...DEFAULT_GENERATION_FORM,
      generationMode: 'image_only',
      publicationText,
      eventDate: '2026-07-11',
      eventTime: '19:15',
      eventLocation: 'Pitahaya, Cabo Rojo',
    })
    const fullPayload = buildGenerationPayload({
      ...DEFAULT_GENERATION_FORM,
      publicationText,
      eventDate: '2026-07-11',
      eventTime: '19:15',
      eventLocation: 'Pitahaya, Cabo Rojo',
    })

    expect(imageOnlyPayload.generationMode).toBe('image_only')
    expect(imageOnlyPayload.publicationText).toBe(publicationText)
    expect(fullPayload.generationMode).toBe('text_and_image')
    expect(fullPayload).not.toHaveProperty('publicationText')
  })

  test('coerces image-only payloads when Guidelines prohibit images', () => {
    const definition = {
      id: 'reel_caption',
      label: 'Caption de reel',
      fields: [],
      platforms: ['facebook'],
      visual: {
        mode: 'none',
        imagePolicyByPlatform: { facebook: 'prohibited' },
      },
    }
    const payload = buildGenerationPayload(
      {
        ...DEFAULT_GENERATION_FORM,
        contentType: definition.id,
        generationMode: 'image_only',
        publicationText: '  Texto intacto  ',
      },
      definition,
      ['facebook']
    )

    expect(payload.generationMode).toBe('text_and_image')
    expect(payload).not.toHaveProperty('publicationText')
  })

  test('includes the selected pills presentation for event templates', () => {
    const payload = buildGenerationPayload({
      ...DEFAULT_GENERATION_FORM,
      templatePresentation: 'pills',
      eventDate: '2026-07-11',
      eventTime: '19:15',
      eventLocation: 'Pitahaya, Cabo Rojo',
    })

    expect(payload.templatePresentation).toBe('pills')
  })

  test('events always use template mode (stock default, ai_generated preserved)', () => {
    const emptyMode = buildGenerationPayload({
      ...DEFAULT_GENERATION_FORM,
      backgroundMode: '',
      backgroundId: 'telescope-nebula',
    })
    expect(emptyMode.backgroundMode).toBe('stock')

    const aiMode = buildGenerationPayload({
      ...DEFAULT_GENERATION_FORM,
      backgroundMode: 'ai_generated',
    })
    expect(aiMode.backgroundMode).toBe('ai_generated')
  })

  test('non-event template types preserve an explicit no-template choice', () => {
    const payload = buildGenerationPayload({
      ...DEFAULT_GENERATION_FORM,
      contentType: 'regular_post',
      intent: 'Educar',
      topic: 'El cielo del mes',
      backgroundMode: '',
      backgroundId: '',
    })
    expect(payload.backgroundMode).toBeUndefined()
    expect(payload.backgroundId).toBeUndefined()
  })

  test('keeps a selected event_name in contentData when the canonical title is the type label', () => {
    const definition = {
      id: 'club_event',
      label: 'Evento del club',
      status: 'active',
      platforms: ['instagram'],
      fields: [
        { key: 'event_name', label: 'Nombre', required: true },
        { key: 'date', label: 'Fecha', required: true },
      ],
      titleSource: 'type_label',
      visual: {
        mode: 'template',
        template: 'event',
        backgroundSources: ['stock'],
        sponsorAllowed: false,
        imagePolicyByPlatform: { x: 'optional', instagram: 'optional', facebook: 'optional' },
      },
    }
    const payload = buildGenerationPayload(
      {
        ...DEFAULT_GENERATION_FORM,
        contentType: definition.id,
        eventName: 'Encuentro mensual',
        eventDate: '2026-08-15',
        platforms: ['x', 'instagram', 'facebook'],
      },
      definition
    )

    expect(payload.eventDetails.name).toBe('Evento del club')
    expect(payload.platforms).toEqual(['instagram'])
    expect(payload.contentData).toMatchObject({
      event_name: 'Encuentro mensual',
      date: '2026-08-15',
    })
  })

  test('omits an optional sponsor when every platform prohibits images', () => {
    const definition = JSON.parse(
      JSON.stringify(resolveContentTypeDefinition(getDefaultGuidelines(), 'observation_night'))
    )
    definition.visual.imagePolicyByPlatform = {
      x: 'prohibited',
      instagram: 'prohibited',
      facebook: 'prohibited',
    }
    const payload = buildGenerationPayload(
      {
        ...DEFAULT_GENERATION_FORM,
        eventDate: '2026-08-15',
        eventTime: '19:30',
        eventLocation: 'Cabo Rojo',
        sponsorLogo: {
          dataUrl: 'data:image/png;base64,aaaa',
          mimeType: 'image/png',
          fileName: 'sponsor.png',
        },
      },
      definition
    )

    expect(payload.backgroundMode).toBeUndefined()
    expect(payload.sponsorLogo).toBeUndefined()
    expect(payload.contentData.sponsor).toBeUndefined()
  })
})

describe('buildTemplateTextFields', () => {
  test('observation_night preserves its approved label during one execution', () => {
    const fields = buildTemplateTextFields({
      input: {
        contentType: 'observation_night',
        topic: 'Otro nombre',
        eventDetails: {
          name: 'Nombre enviado por una instancia',
          date: '2026-08-12',
          time: '20:00',
          location: 'Guánica',
        },
      },
    })

    expect(fields).toMatchObject({
      layout: 'event',
      headline: 'Noche de Observación',
      locationLabel: 'Guánica',
    })
    expect(resolveTemplateLayoutId('observation_night')).toBe('event')
  })

  test('event_promotion uses public poster copy, formatted pills, and weather disclaimer', () => {
    const fields = buildTemplateTextFields({
      input: {
        contentType: 'event_promotion',
        topic: 'Fallback topic',
        intent: 'Invitar al público',
        eventDetails: {
          name: 'Noche de Perseidas',
          date: '2026-08-12',
          time: '20:00',
          location: 'Guánica',
        },
      },
    })
    expect(fields).toMatchObject({
      layout: 'event',
      headline: 'Noche de Perseidas',
      subtitle: EVENT_POSTER_SUBTITLE_FALLBACK,
      body: EVENT_POSTER_BODY_FALLBACK,
      dateLabel: 'MIÉ 12 AGO',
      timeLabel: '8:00 PM',
      locationLabel: 'Guánica',
      weatherDisclaimer: EVENT_WEATHER_DISCLAIMER,
    })
  })

  test('posterText overrides subtitle and adds body', () => {
    const fields = buildTemplateTextFields({
      input: {
        contentType: 'event_promotion',
        topic: 'T',
        intent: 'Fallback intent',
        eventDetails: { name: 'Noche', date: '2026-07-11', time: '19:00', location: 'PR' },
      },
      posterText: {
        subtitle: 'Acompáñanos bajo las estrellas.',
        body: 'Una noche para mirar al cielo.',
      },
    })
    expect(fields.subtitle).toBe('Acompáñanos bajo las estrellas.')
    expect(fields.body).toBe('Una noche para mirar al cielo.')
  })

  test('replaces repeated logistics or invented date/time details with safe copy', () => {
    const fields = buildTemplateTextFields({
      input: {
        contentType: 'observation_night',
        eventDetails: {
          name: 'Noche de Observación',
          date: '2026-07-11',
          time: '19:15',
          location: 'Pitahaya, Cabo Rojo',
        },
      },
      posterText: {
        subtitle: 'Ven a la Noche de Observación el 15 de agosto.',
        body: 'Nos vemos a las 8:30 PM en Pitahaya, Cabo Rojo.',
      },
    })

    expect(fields.subtitle).toBe(EVENT_POSTER_SUBTITLE_FALLBACK)
    expect(fields.body).toBe(EVENT_POSTER_BODY_FALLBACK)
  })

  test('enforces poster copy length limits', () => {
    const fields = buildTemplateTextFields({
      input: {
        contentType: 'observation_night',
        eventDetails: { name: 'Noche de Observación' },
      },
      posterText: {
        subtitle:
          'Ven a descubrir el universo con nosotros y comparte una experiencia inolvidable bajo un cielo lleno de estrellas.',
        body: 'Mira hacia arriba y déjate sorprender por una experiencia de astronomía compartida que despierta la curiosidad y nos conecta con la inmensidad del universo visible.',
      },
    })

    expect(fields.subtitle.length).toBeLessThanOrEqual(80)
    expect(fields.body.length).toBeLessThanOrEqual(140)
  })

  test('falls back to topic when event name missing', () => {
    const fields = buildTemplateTextFields({
      input: {
        contentType: 'event_promotion',
        topic: 'Observación lunar',
        intent: 'Promover',
        eventDetails: { date: 'mañana' },
      },
    })
    expect(fields.headline).toBe('Observación lunar')
    expect(fields.dateLabel).toBe('mañana')
    expect(fields.locationLabel).toBeUndefined()
    expect(fields.weatherDisclaimer).toBe(EVENT_WEATHER_DISCLAIMER)
  })

  test('simple layout for educational posts', () => {
    const fields = buildTemplateTextFields({
      input: {
        contentType: 'educational_astronomy',
        topic: 'Qué es una supernova',
        intent: 'Educar',
      },
    })
    expect(fields).toEqual({
      layout: 'simple',
      headline: 'Qué es una supernova',
    })
  })

  test('uses the required holiday greeting as the headline composed by a template', () => {
    const definition = {
      id: 'holiday_greeting',
      label: 'Día festivo',
      visual: { mode: 'template', template: 'simple' },
      generation: {
        rules:
          'Debe generar una felicitación de acuerdo al día festivo. La imagen generada debe incluir la felicitación.',
      },
    }
    const fields = buildTemplateTextFields({
      input: {
        contentType: 'holiday_greeting',
        contentTypeDefinition: definition,
        topic: 'Día del Padre',
        backgroundMode: 'stock',
      },
      contentTypeDefinition: definition,
    })

    expect(fields).toEqual({ layout: 'simple', headline: 'Feliz Día del Padre' })
  })

  test('returns null for caption / reel_caption', () => {
    expect(
      buildTemplateTextFields({
        input: { contentType: 'caption', topic: 'Hola' },
      })
    ).toBeNull()
    expect(resolveTemplateLayoutId('reel_caption')).toBeNull()
  })
})

describe('attachTemplateRequestsToResult', () => {
  test('keeps the same fixed overlay and SAC logo across every stock background', () => {
    const result = {
      drafts: [{ platform: 'instagram', contentType: 'observation_night', draftText: 'Hola' }],
      recommendedNextStep: 'Validar',
      humanReviewRequired: true,
    }
    const input = {
      contentType: 'observation_night',
      topic: 'Noche de Observación',
      backgroundMode: 'stock',
      eventDetails: completeEventDetails,
    }
    const posterText = {
      subtitle: 'Ven a mirar el cielo con nosotros.',
      body: 'Descubre una experiencia que despierta la curiosidad bajo las estrellas.',
    }

    const generated = listBackgroundOptions().map(({ id }) =>
      attachTemplateRequestsToResult(result, { ...input, backgroundId: id }, { posterText })
    )
    const [first, ...rest] = generated

    for (const item of rest) {
      expect(item.templateRequest).toEqual(first.templateRequest)
    }
    expect(generated.map((item) => item.templateAssets.backgroundSource.backgroundId)).toEqual(
      listBackgroundOptions().map(({ id }) => id)
    )
    expect(first.templateRequest.textFields).toMatchObject({
      headline: 'Noche de Observación',
      dateLabel: 'SÁB 11 JUL',
      timeLabel: '7:15 PM',
      locationLabel: 'Pitahaya, Cabo Rojo',
      weatherDisclaimer: '*Actividad sujeta a condiciones del tiempo',
    })
    expect(getTemplateLayout(first.templateRequest.layout).logo.asset).toBe('short')
  })

  test('attaches one top-level template request and shared assets', () => {
    const result = attachTemplateRequestsToResult(
      {
        drafts: [
          { platform: 'instagram', contentType: 'event_promotion', draftText: 'Hola' },
          { platform: 'x', contentType: 'event_promotion', draftText: 'Hi' },
        ],
        recommendedNextStep: 'Validar',
        humanReviewRequired: true,
      },
      {
        contentType: 'event_promotion',
        topic: 'Meteoros',
        intent: 'Invitar',
        backgroundMode: 'stock',
        backgroundId: 'telescope-nebula',
        eventDetails: { name: 'Perseidas', date: '2026-08-12', time: '8 PM', location: 'PR' },
        sponsorLogo: {
          dataUrl: 'data:image/png;base64,aaaa',
          mimeType: 'image/png',
        },
      },
      { posterText: { subtitle: 'Ven a vernos.', body: 'Noche especial.' } }
    )
    expect(result.templateRequest).toMatchObject({
      layout: 'event',
      templatePresentation: 'rail',
      textFields: {
        headline: 'Perseidas',
        subtitle: 'Ven a vernos.',
        body: 'Noche especial.',
        dateLabel: 'MIÉ 12 AGO',
        weatherDisclaimer: EVENT_WEATHER_DISCLAIMER,
      },
    })
    expect(result.templateAssets).toMatchObject({
      backgroundSource: { mode: 'stock', backgroundId: 'telescope-nebula' },
      downloadFileName: 'SAC-evento-2026-08-12-pr.jpg',
      sponsorLogo: { mimeType: 'image/png' },
    })
    expect(result.drafts[0]).not.toHaveProperty('templateRequest')
    expect(result.drafts[1]).not.toHaveProperty('templateRequest')
  })

  test('keeps the selected pills presentation in the template request', () => {
    const result = attachTemplateRequestsToResult(
      {
        drafts: [{ platform: 'instagram', contentType: 'event_promotion', draftText: 'Hola' }],
        recommendedNextStep: 'Validar',
        humanReviewRequired: true,
      },
      {
        contentType: 'event_promotion',
        topic: 'Meteoros',
        intent: 'Invitar',
        backgroundMode: 'stock',
        backgroundId: 'telescope-nebula',
        templatePresentation: 'pills',
        eventDetails: { name: 'Perseidas', date: '2026-08-12', time: '8 PM', location: 'PR' },
      }
    )

    expect(result.templateRequest.templatePresentation).toBe('pills')
  })

  test('is a no-op when backgroundMode is omitted', () => {
    const input = {
      drafts: [{ platform: 'x', contentType: 'regular_post', draftText: 'Hi' }],
    }
    expect(attachTemplateRequestsToResult(input, { contentType: 'regular_post', topic: 'T' })).toBe(
      input
    )
  })
})

describe('textWrap', () => {
  test('wraps long text into multiple lines', () => {
    const lines = wrapText('Uno dos tres cuatro cinco seis', 80, 20, { maxLines: 3 })
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.length).toBeLessThanOrEqual(3)
  })

  test('fitAndWrapText shrinks font for long headlines', () => {
    const { fontSize, lines } = fitAndWrapText(
      'Una noche de observación astronómica bajo las Perseidas en Puerto Rico',
      400,
      48,
      18,
      { maxLines: 3 }
    )
    expect(fontSize).toBeLessThanOrEqual(48)
    expect(fontSize).toBeGreaterThanOrEqual(18)
    expect(lines.length).toBeGreaterThan(0)
  })

  test('does not add an ellipsis when all copy fills the final allowed line', () => {
    expect(wrapText('Noche de Observación', 820, 132, { maxLines: 2, charRatio: 0.535 })).toEqual([
      'Noche de',
      'Observación',
    ])
  })

  test('balances centered two-line poster copy', () => {
    const { lines } = fitAndWrapText(
      'Una noche para mirar al cielo, aprender y disfrutar la astronomía en comunidad.',
      702,
      38,
      24,
      { maxLines: 2, charRatio: 0.46, balanceLines: true }
    )
    expect(lines).toEqual([
      'Una noche para mirar al cielo, aprender',
      'y disfrutar la astronomía en comunidad.',
    ])
  })
})

describe('buildTemplateSvg', () => {
  test('emits SVG with headline, subtitle, body, cards, and weather disclaimer', () => {
    const svg = buildTemplateSvg({
      layout: 'event',
      canvas: getSocialCanvas(),
      textFields: {
        headline: 'Noche de estrellas',
        subtitle: 'Observación pública',
        body: 'Una noche para mirar al cielo.',
        dateLabel: '15 ago',
        timeLabel: '8 PM',
        locationLabel: 'Arecibo',
        weatherDisclaimer: EVENT_WEATHER_DISCLAIMER,
      },
      hasSponsor: true,
      sponsorPlacement: { left: 820, top: 1210, width: 160, height: 60 },
    })
    expect(svg).toContain('<svg')
    expect(svg).toContain('>Noche de<')
    expect(svg).toContain('>estrellas<')
    expect(svg).toContain('Observación pública')
    expect(svg).toContain('Una noche para mirar al cielo.')
    expect(svg).toContain('>15 AGO<')
    expect(svg).toContain('>8 PM<')
    expect(svg).toContain('Arecibo')
    expect(svg).toContain('FECHA')
    expect(svg).toContain('HORA')
    expect(svg).toContain('LUGAR')
    expect(svg).toContain('data-role="info-rail"')
    expect(svg).toContain(EVENT_WEATHER_DISCLAIMER)
    expect(svg).toContain('Auspicia')
    expect(svg).toContain('data-logo-left="820.00"')
    expect(svg).toContain('data-logo-top="1210.00"')
  })

  test('keeps long production copy and info-card text inside their regions', () => {
    const canvas = getSocialCanvas()
    const svg = buildTemplateSvg({
      layout: 'event',
      canvas,
      textFields: {
        headline: 'Una noche de observación astronómica bajo el cielo de Puerto Rico',
        subtitle:
          'Acompáñanos a descubrir planetas, cúmulos estelares y las maravillas del cielo profundo.',
        body: 'Actividad abierta al público general y a familias con niñas y niños.',
        dateLabel: 'MIÉ 12 AGO',
        timeLabel: '8:00 PM',
        locationLabel: 'Centro Convenciones Cabo Rojo',
        weatherDisclaimer: EVENT_WEATHER_DISCLAIMER,
      },
    })

    expect(svg).toContain('data-layout-orientation="portrait"')
    const contentBottom = Number(svg.match(/data-content-bottom="([\d.]+)"/)?.[1])
    const pillsTop = Number(svg.match(/data-pills-top="([\d.]+)"/)?.[1])
    expect(contentBottom).toBeLessThan(pillsTop)

    const cardMetrics = [
      ...svg.matchAll(
        /data-role="info-card"[^>]*data-card-top="([\d.]+)" data-card-bottom="([\d.]+)" data-text-top="([\d.]+)" data-text-bottom="([\d.]+)"/g
      ),
    ]
    expect(cardMetrics).toHaveLength(3)
    for (const [, cardTop, cardBottom, textTop, textBottom] of cardMetrics) {
      expect(Number(cardTop)).toBeGreaterThanOrEqual(0)
      expect(Number(cardBottom)).toBeLessThanOrEqual(canvas.height)
      expect(Number(textTop)).toBeGreaterThanOrEqual(Number(cardTop))
      expect(Number(textBottom)).toBeLessThanOrEqual(Number(cardBottom))
    }
  })

  test('keeps an editorial hierarchy and gives the location the dominant width', () => {
    const svg = buildTemplateSvg({
      layout: 'event',
      canvas: getSocialCanvas(),
      textFields: {
        headline: 'Noche de Observación',
        subtitle: 'Acompáñanos bajo las estrellas en Pitahaya, Cabo Rojo.',
        body: 'Una noche para mirar al cielo, aprender y disfrutar la astronomía en comunidad.',
        dateLabel: 'SÁB 11 JUL',
        timeLabel: '7:15 PM',
        locationLabel: 'Pitahaya, Cabo Rojo',
        weatherDisclaimer: EVENT_WEATHER_DISCLAIMER,
      },
    })

    const headlineMetrics = svg.match(
      /<text x="540" y="([\d.]+)"[^>]*font-size="([\d.]+)" font-weight="800"[^>]*><tspan[^>]*>Noche de</
    )
    const subtitleMetrics = svg.match(
      /<text x="540" y="([\d.]+)"[^>]*font-size="([\d.]+)" font-weight="700"[^>]*><tspan[^>]*>Acompáñanos/
    )
    const bodyMetrics = svg.match(
      /<text x="540" y="([\d.]+)"[^>]*font-size="([\d.]+)" font-weight="400"[^>]*><tspan[^>]*>Una noche/
    )
    const cardWidths = Object.fromEntries(
      [...svg.matchAll(/data-kind="(date|time|location)"[^>]*data-card-width="([\d.]+)"/g)].map(
        ([, kind, cardWidth]) => [kind, Number(cardWidth)]
      )
    )

    expect(Number(headlineMetrics[2])).toBeLessThan(120)
    expect(Number(subtitleMetrics[2])).toBeLessThan(50)
    expect(Number(bodyMetrics[2])).toBeLessThan(36)
    expect(Number(headlineMetrics[1])).toBeLessThan(Number(subtitleMetrics[1]))
    expect(Number(subtitleMetrics[1])).toBeLessThan(Number(bodyMetrics[1]))
    expect(cardWidths.location).toBeGreaterThan(cardWidths.date * 2)
    expect(cardWidths.location).toBeGreaterThan(cardWidths.time * 2)
    expect(svg).toContain('>Pitahaya, Cabo Rojo<')
    expect(svg).not.toContain('>PITA<')
    expect(svg).not.toContain('>HAYA<')
  })

  test('preserves location word boundaries when punctuation has no following space', () => {
    const svg = buildTemplateSvg({
      layout: 'event',
      canvas: getSocialCanvas(),
      textFields: {
        headline: 'Noche de Observación',
        subtitle: 'Acompáñanos bajo las estrellas.',
        body: 'Una noche para mirar al cielo.',
        dateLabel: 'SÁB 11 JUL',
        timeLabel: '7:15 PM',
        locationLabel: 'Pitahaya,Cabo Rojo',
        weatherDisclaimer: EVENT_WEATHER_DISCLAIMER,
      },
    })

    expect(svg).not.toContain('PITAHAYACABO')
    expect(svg).toContain('>Pitahaya, Cabo Rojo<')
    expect(svg).not.toContain('>PITA<')
    expect(svg).not.toContain('>HAYA<')
  })

  test('fits a real long venue without truncating or breaking place names', () => {
    const svg = buildTemplateSvg({
      layout: 'event',
      canvas: getSocialCanvas(),
      textFields: {
        headline: 'Noche de Observación',
        subtitle: 'Acompáñanos bajo las estrellas.',
        body: 'Una noche para mirar al cielo.',
        dateLabel: 'SÁB 08 AGO',
        timeLabel: '7:00 PM',
        locationLabel: 'Castillo San Felipe del Morro, San Juan',
        weatherDisclaimer: EVENT_WEATHER_DISCLAIMER,
      },
    })

    const locationMetrics = svg.match(
      /data-kind="location"[^>]*data-line-count="([\d.]+)" data-font-size="([\d.]+)"[^>]*data-card-width="([\d.]+)"/
    )
    expect(locationMetrics).not.toBeNull()
    expect(Number(locationMetrics[1])).toBeLessThanOrEqual(2)
    expect(Number(locationMetrics[2])).toBeGreaterThanOrEqual(22)
    expect(Number(locationMetrics[3])).toBeGreaterThan(470)
    expect(svg).toContain('Castillo San Felipe')
    expect(svg).toContain('>Morro, San Juan<')
    expect(svg).not.toContain('…')
  })

  test('escapes XML special characters', () => {
    const svg = buildTemplateSvg({
      layout: 'simple',
      canvas: { width: 400, height: 500 },
      textFields: { headline: 'A < B & C > "D"' },
    })
    expect(svg).toContain('A &lt; B &amp; C &gt; &quot;D&quot;')
    expect(svg).not.toContain('A < B')
  })
})

describe('renderSocialTemplateImage', () => {
  test('composites one payload-safe canonical JPEG with an anchored sponsor', async () => {
    const sponsorPng = await sharp({
      create: {
        width: 80,
        height: 40,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer()

    const rendered = await renderSocialTemplateImage({
      platform: 'x',
      templateRequest: {
        layout: 'event',
        backgroundSource: { mode: 'stock', backgroundId: 'telescope-nebula' },
        textFields: {
          headline: 'Noche de Observación',
          dateLabel: 'SÁB 11 JUL',
          timeLabel: '7:15 PM',
          locationLabel: 'Cabo Rojo',
          weatherDisclaimer: EVENT_WEATHER_DISCLAIMER,
        },
        sponsorLogo: {
          dataUrl: `data:image/png;base64,${sponsorPng.toString('base64')}`,
          mimeType: 'image/png',
        },
      },
    })

    expect(rendered.mimeType).toBe('image/jpeg')
    expect(rendered.dataUrl).toMatch(/^data:image\/jpeg;base64,/)
    expect(rendered.width).toBe(1080)
    expect(rendered.height).toBe(1440)
    expect(Buffer.byteLength(rendered.dataUrl, 'utf8')).toBeLessThan(4 * 1024 * 1024)

    const base64 = rendered.dataUrl.replace(/^data:image\/jpeg;base64,/, '')
    const meta = await sharp(Buffer.from(base64, 'base64')).metadata()
    expect(meta.format).toBe('jpeg')
    expect(meta.width).toBe(1080)
    expect(meta.height).toBe(1440)
    expect(meta.chromaSubsampling).toBe('4:4:4')
  }, 30000)

  test('rasterizes the separated-pills event presentation as a canonical JPEG', async () => {
    const rendered = await renderSocialTemplateImage({
      templateRequest: {
        layout: 'event',
        templatePresentation: 'pills',
        backgroundSource: { mode: 'stock', backgroundId: 'telescope-nebula' },
        textFields: {
          headline: 'Noche de Observación',
          subtitle: 'Acompáñanos bajo las estrellas.',
          body: 'Una noche para mirar al cielo.',
          dateLabel: 'SÁB 11 JUL',
          timeLabel: '7:15 PM',
          locationLabel: 'Pitahaya, Cabo Rojo',
          weatherDisclaimer: EVENT_WEATHER_DISCLAIMER,
        },
      },
    })

    const image = Buffer.from(rendered.dataUrl.replace(/^data:image\/jpeg;base64,/, ''), 'base64')
    const metadata = await sharp(image).metadata()
    expect(rendered).toMatchObject({ mimeType: 'image/jpeg', width: 1080, height: 1440 })
    expect(metadata).toMatchObject({ format: 'jpeg', width: 1080, height: 1440 })
  }, 30000)

  test('rasterizes the simple layout from an in-memory AI backdrop data URL', async () => {
    const tinyPng = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: { r: 20, g: 30, b: 80 },
      },
    })
      .png()
      .toBuffer()

    const rendered = await renderSocialTemplateImage({
      templateRequest: {
        layout: 'simple',
        backgroundSource: {
          mode: 'ai_generated',
          dataUrl: `data:image/png;base64,${tinyPng.toString('base64')}`,
        },
        textFields: { headline: 'Supernova' },
      },
    })

    expect(rendered.width).toBe(1080)
    expect(rendered.height).toBe(1440)
    expect(rendered.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true)
  }, 30000)

  test('preserves both side edges when an AI backdrop ignores the 3:4 aspect ratio', async () => {
    const edgeWidth = 8
    const squareBackdrop = await sharp({
      create: {
        width: 80,
        height: 80,
        channels: 3,
        background: { r: 0, g: 180, b: 0 },
      },
    })
      .composite([
        {
          input: {
            create: {
              width: edgeWidth,
              height: 80,
              channels: 3,
              background: { r: 240, g: 0, b: 0 },
            },
          },
          left: 0,
          top: 0,
        },
        {
          input: {
            create: {
              width: edgeWidth,
              height: 80,
              channels: 3,
              background: { r: 0, g: 0, b: 240 },
            },
          },
          left: 80 - edgeWidth,
          top: 0,
        },
      ])
      .png()
      .toBuffer()

    const rendered = await renderSocialTemplateImage({
      templateRequest: {
        layout: 'simple',
        backgroundSource: {
          mode: 'ai_generated',
          dataUrl: `data:image/png;base64,${squareBackdrop.toString('base64')}`,
        },
        textFields: { headline: 'Supernova' },
      },
    })

    const image = Buffer.from(rendered.dataUrl.replace(/^data:image\/jpeg;base64,/, ''), 'base64')
    const [leftRegion, rightRegion] = await Promise.all([
      sharp(image).extract({ left: 10, top: 250, width: 40, height: 100 }).png().toBuffer(),
      sharp(image).extract({ left: 1030, top: 250, width: 40, height: 100 }).png().toBuffer(),
    ])
    const [leftStats, rightStats] = await Promise.all([
      sharp(leftRegion).stats(),
      sharp(rightRegion).stats(),
    ])

    expect(rendered).toMatchObject({ mimeType: 'image/jpeg', width: 1080, height: 1440 })
    expect(leftStats.channels[0].mean).toBeGreaterThan(leftStats.channels[1].mean + 80)
    expect(leftStats.channels[0].mean).toBeGreaterThan(leftStats.channels[2].mean + 80)
    expect(rightStats.channels[2].mean).toBeGreaterThan(rightStats.channels[0].mean + 80)
    expect(rightStats.channels[2].mean).toBeGreaterThan(rightStats.channels[1].mean + 80)
  }, 30000)

  test('rejects corrupt image bytes instead of rendering partial input', async () => {
    await expect(
      renderSocialTemplateImage({
        templateRequest: {
          layout: 'simple',
          backgroundSource: {
            mode: 'ai_generated',
            dataUrl: 'data:image/png;base64,bm90LWltYWdl',
          },
          textFields: { headline: 'Supernova' },
        },
      })
    ).rejects.toThrow()
  })
})

describe('GenerateInputSchema background fields', () => {
  const guidelineDocument = getDefaultGuidelines()
  const withRuntimeMetadata = (input) => {
    const definition = resolveContentTypeDefinition(guidelineDocument, input.contentType)
    return {
      ...input,
      contentData: legacyInputToContentData(input, definition),
      contentTypeDefinition: definition,
      contentTypeIdentity: {
        id: definition.id,
        label: definition.label,
        guidelineVersion: guidelineDocument.version,
      },
      guidelineVersion: guidelineDocument.version,
      policyVersion: AI_BASE_POLICY_VERSION,
    }
  }
  const base = withRuntimeMetadata({
    userId: 'u1',
    userEmail: 'a@b.com',
    intent: 'Promover',
    topic: 'Evento',
    platforms: ['instagram'],
    contentType: 'event_promotion',
    cta: 'Regístrate',
    eventDetails: completeEventDetails,
  })

  test('accepts stock backgroundMode + backgroundId', () => {
    const parsed = GenerateInputSchema.safeParse({
      ...base,
      backgroundMode: 'stock',
      backgroundId: 'telescope-nebula',
    })
    expect(parsed.success).toBe(true)
  })

  test('accepts ai_generated with sponsor logo', () => {
    const parsed = GenerateInputSchema.safeParse({
      ...base,
      backgroundMode: 'ai_generated',
      sponsorLogo: {
        dataUrl: 'data:image/png;base64,aaaa',
        mimeType: 'image/png',
      },
    })
    expect(parsed.success).toBe(true)
  })

  test('rejects invalid backgroundMode', () => {
    const parsed = GenerateInputSchema.safeParse({
      ...base,
      backgroundMode: 'custom',
    })
    expect(parsed.success).toBe(false)
  })

  test('rejects event_promotion missing location', () => {
    const parsed = GenerateInputSchema.safeParse(
      withRuntimeMetadata({
        ...base,
        eventDetails: { name: 'X', date: '2026-07-11', time: '19:00' },
      })
    )
    expect(parsed.success).toBe(false)
  })
})
