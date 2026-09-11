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
import { GenerateInputSchema } from '../../lib/ai-generation-schemas'

const completeEventDetails = {
  name: 'Noche de Observación',
  date: '2026-07-11',
  time: '19:15',
  location: 'Pitahaya, Cabo Rojo',
}

const defaultGuidelines = getDefaultGuidelines()
const observationDefinition = resolveContentTypeDefinition(defaultGuidelines, 'observation_night')
const eventPromotionDefinition = {
  ...observationDefinition,
  id: 'event_promotion',
  label: 'Promoción de evento',
  titleSource: 'event_name',
  fields: [
    ...(observationDefinition.fields || []),
    { key: 'event_name', label: 'Nombre del evento', help: '', placeholder: '', required: true },
  ],
}
const educationalDefinition = {
  id: 'educational_astronomy',
  label: 'Educación astronómica',
  fields: [{ key: 'topic', label: 'Tema', required: true }],
  titleSource: 'topic',
  visual: { mode: 'template', template: 'simple' },
}
const regularDefinition = resolveContentTypeDefinition(defaultGuidelines, 'post_educativo')

function inputWithDefinition(input, definition) {
  return {
    ...input,
    contentTypeDefinition: definition,
    contentData: legacyInputToContentData(input, definition),
  }
}

function buildObservationPayload(overrides = {}) {
  return buildGenerationPayload(
    {
      ...DEFAULT_GENERATION_FORM,
      contentType: observationDefinition.id,
      ...overrides,
    },
    observationDefinition,
    Object.keys(defaultGuidelines.platforms)
  )
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
    const derived = deriveEventTopicAndIntent(
      {
        contentType: 'observation_night',
        eventName: 'No debe reemplazar la identidad',
        eventDate: '2026-07-11',
        eventTime: '19:15',
        eventLocation: 'Pitahaya, Cabo Rojo',
      },
      observationDefinition
    )
    expect(derived.topic).toContain('Noche de Observación')
    expect(derived.topic).toContain('Pitahaya, Cabo Rojo')
    expect(derived.intent).toContain('Pitahaya, Cabo Rojo')
  })

  test('buildEventDetails preserves the observation-night identity', () => {
    expect(
      buildEventDetails(
        {
          contentType: 'observation_night',
          eventName: 'Otro evento',
          eventDate: '2026-07-11',
          eventTime: '19:15',
          eventLocation: 'Pitahaya, Cabo Rojo',
        },
        observationDefinition
      )
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
  test('defaults wait for the first active Guidelines content type', () => {
    expect(DEFAULT_GENERATION_FORM.platforms).toBeUndefined()
    expect(DEFAULT_GENERATION_FORM.contentType).toBe('')
    expect(DEFAULT_GENERATION_FORM.generationMode).toBe('text_and_image')
    expect(DEFAULT_GENERATION_FORM.publicationText).toBe('')
    expect(DEFAULT_GENERATION_FORM.eventName).toBe('')
    expect(DEFAULT_GENERATION_FORM.backgroundMode).toBe('stock')
    expect(DEFAULT_GENERATION_FORM.backgroundId).toBe('telescope-nebula')
    expect(DEFAULT_GENERATION_FORM.templatePresentation).toBe('rail')
  })

  test('derives topic/intent and includes sponsor for events', () => {
    const payload = buildObservationPayload({
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
    const imageOnlyPayload = buildObservationPayload({
      generationMode: 'image_only',
      publicationText,
      eventDate: '2026-07-11',
      eventTime: '19:15',
      eventLocation: 'Pitahaya, Cabo Rojo',
    })
    const fullPayload = buildObservationPayload({
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
    const payload = buildObservationPayload({
      templatePresentation: 'pills',
      eventDate: '2026-07-11',
      eventTime: '19:15',
      eventLocation: 'Pitahaya, Cabo Rojo',
    })

    expect(payload.templatePresentation).toBe('pills')
  })

  test('template background selection must be allowed by Guidelines', () => {
    const emptyMode = buildObservationPayload({
      backgroundMode: '',
      backgroundId: 'telescope-nebula',
    })
    expect(emptyMode.backgroundMode).toBeUndefined()

    const aiMode = buildObservationPayload({
      backgroundMode: 'ai_generated',
    })
    expect(aiMode.backgroundMode).toBe('ai_generated')
  })

  test('non-event template types preserve an explicit no-template choice', () => {
    const payload = buildGenerationPayload(
      {
        ...DEFAULT_GENERATION_FORM,
        contentType: regularDefinition.id,
        intent: 'Educar',
        topic: 'El cielo del mes',
        backgroundMode: '',
        backgroundId: '',
      },
      regularDefinition,
      Object.keys(defaultGuidelines.platforms)
    )
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
        contentType: definition.id,
        eventDate: '2026-08-15',
        eventTime: '19:30',
        eventLocation: 'Cabo Rojo',
        sponsorLogo: {
          dataUrl: 'data:image/png;base64,aaaa',
          mimeType: 'image/png',
          fileName: 'sponsor.png',
        },
      },
      definition,
      Object.keys(defaultGuidelines.platforms)
    )

    expect(payload.backgroundMode).toBeUndefined()
    expect(payload.sponsorLogo).toBeUndefined()
    expect(payload.contentData.sponsor).toBeUndefined()
  })
})

describe('buildTemplateTextFields', () => {
  test('observation_night preserves its approved label during one execution', () => {
    const fields = buildTemplateTextFields({
      input: inputWithDefinition(
        {
          contentType: 'observation_night',
          topic: 'Otro nombre',
          eventDetails: {
            name: 'Nombre enviado por una instancia',
            date: '2026-08-12',
            time: '20:00',
            location: 'Guánica',
          },
        },
        observationDefinition
      ),
    })

    expect(fields).toMatchObject({
      layout: 'event',
      headline: 'Noche de Observación',
      locationLabel: 'Guánica',
    })
    expect(resolveTemplateLayoutId('observation_night', observationDefinition)).toBe('event')
  })

  test('event_promotion uses public poster copy, formatted pills, and weather disclaimer', () => {
    const fields = buildTemplateTextFields({
      input: inputWithDefinition(
        {
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
        eventPromotionDefinition
      ),
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
      input: inputWithDefinition(
        {
          contentType: 'event_promotion',
          topic: 'T',
          intent: 'Fallback intent',
          eventDetails: { name: 'Noche', date: '2026-07-11', time: '19:00', location: 'PR' },
        },
        eventPromotionDefinition
      ),
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
      input: inputWithDefinition(
        {
          contentType: 'observation_night',
          eventDetails: {
            name: 'Noche de Observación',
            date: '2026-07-11',
            time: '19:15',
            location: 'Pitahaya, Cabo Rojo',
          },
        },
        observationDefinition
      ),
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
      input: inputWithDefinition(
        {
          contentType: 'observation_night',
          eventDetails: { name: 'Noche de Observación' },
        },
        observationDefinition
      ),
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
    const topicEventDefinition = {
      id: 'configured_event',
      label: 'Evento configurado',
      fields: [
        { key: 'topic', label: 'Tema', required: true },
        { key: 'date', label: 'Fecha', required: false },
      ],
      titleSource: 'topic',
      visual: { mode: 'template', template: 'event' },
    }
    const fields = buildTemplateTextFields({
      input: inputWithDefinition(
        {
          contentType: topicEventDefinition.id,
          topic: 'Observación lunar',
          intent: 'Promover',
          eventDetails: { date: 'mañana' },
        },
        topicEventDefinition
      ),
    })
    expect(fields.headline).toBe('Observación lunar')
    expect(fields.dateLabel).toBe('mañana')
    expect(fields.locationLabel).toBeUndefined()
    expect(fields.weatherDisclaimer).toBe(EVENT_WEATHER_DISCLAIMER)
  })

  test('simple layout for educational posts', () => {
    const fields = buildTemplateTextFields({
      input: inputWithDefinition(
        {
          contentType: 'educational_astronomy',
          topic: 'Qué es una supernova',
          intent: 'Educar',
        },
        educationalDefinition
      ),
    })
    expect(fields).toEqual({
      layout: 'simple',
      headline: 'Qué es una supernova',
    })
  })

  test('uses exact titleSource contentData as the headline without rewriting it', () => {
    const definition = {
      id: 'holiday_greeting',
      label: 'Día festivo',
      fields: [{ key: 'event_name', label: 'Felicitación', required: true }],
      titleSource: 'event_name',
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
        contentData: { event_name: 'Día del Padre' },
        backgroundMode: 'stock',
      },
      contentTypeDefinition: definition,
    })

    expect(fields).toEqual({ layout: 'simple', headline: 'Día del Padre' })
    expect(fields.headline).not.toBe('Feliz Día del Padre')
  })

  test('returns null without a Guidelines template definition regardless of id', () => {
    expect(
      buildTemplateTextFields({
        input: { contentType: 'caption', topic: 'Hola' },
      })
    ).toBeNull()
    expect(resolveTemplateLayoutId('reel_caption')).toBeNull()
    expect(
      resolveTemplateLayoutId('anything', {
        visual: { mode: 'none', template: null },
      })
    ).toBeNull()
  })
})

describe('attachTemplateRequestsToResult', () => {
  test('keeps the same fixed overlay and SAC logo across every stock background', () => {
    const result = {
      drafts: [{ platform: 'instagram', contentType: 'observation_night', draftText: 'Hola' }],
      recommendedNextStep: 'Validar',
      humanReviewRequired: true,
    }
    const input = inputWithDefinition(
      {
        contentType: 'observation_night',
        topic: 'Noche de Observación',
        backgroundMode: 'stock',
        eventDetails: completeEventDetails,
      },
      observationDefinition
    )
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
      inputWithDefinition(
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
        eventPromotionDefinition
      ),
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
      downloadFileName: 'SAC-promocion-de-evento-2026-08-12-pr.jpg',
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
      inputWithDefinition(
        {
          contentType: 'event_promotion',
          topic: 'Meteoros',
          intent: 'Invitar',
          backgroundMode: 'stock',
          backgroundId: 'telescope-nebula',
          templatePresentation: 'pills',
          eventDetails: { name: 'Perseidas', date: '2026-08-12', time: '8 PM', location: 'PR' },
        },
        eventPromotionDefinition
      )
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
    const root = parseTemplateSvg(svg)
    const textValues = getSvgTextValues(root)
    const sponsorLabel = root.querySelector('[data-role="sponsor-label"]')

    expect(root.localName).toBe('svg')
    expect(textValues).toEqual(
      expect.arrayContaining([
        'Noche de',
        'estrellas',
        'Observación pública',
        'Una noche para mirar al cielo.',
        '15 AGO',
        '8 PM',
        'Arecibo',
        'FECHA',
        'HORA',
        'LUGAR',
        EVENT_WEATHER_DISCLAIMER,
        'Auspicia',
      ])
    )
    expect(root.querySelector('[data-role="info-rail"]')).not.toBeNull()
    expect(sponsorLabel).not.toBeNull()
    expect(sponsorLabel.getAttribute('data-logo-left')).toBe('820.00')
    expect(sponsorLabel.getAttribute('data-logo-top')).toBe('1210.00')
  })

  test('renders the historical separated pills with the violet time pill', () => {
    const canvas = getSocialCanvas()
    const svg = buildTemplateSvg({
      layout: getTemplateLayout('event', canvas, 'pills'),
      canvas,
      textFields: {
        headline: 'Noche de Observación',
        subtitle: 'Acompáñanos bajo las estrellas.',
        body: 'Una noche para mirar al cielo.',
        dateLabel: 'SÁB 11 JUL',
        timeLabel: '7:15 PM',
        locationLabel: 'Pitahaya, Cabo Rojo',
        weatherDisclaimer: EVENT_WEATHER_DISCLAIMER,
      },
    })

    const root = parseTemplateSvg(svg)
    const cards = [...root.querySelectorAll('[data-role="info-card"]')]
    const cardFills = cards.map((card) => card.querySelector('rect')?.getAttribute('fill'))
    const locationCard = root.querySelector('[data-role="info-card"][data-kind="location"]')
    const locationLines = [
      ...locationCard.querySelectorAll('[data-role="info-card-value"] > tspan'),
    ].map((line) => line.textContent)
    const cardWidths = Object.fromEntries(
      cards.map((card) => [
        card.getAttribute('data-kind'),
        getNumericAttribute(card, 'data-card-width'),
      ])
    )

    expect(root.querySelector('[data-role="info-rail"]')).toBeNull()
    expect(getSvgTextValues(root)).not.toContain('FECHA')
    expect(cardFills).toEqual(['#FFFFFF', '#560647', 'rgba(0,0,0,0.72)'])
    expect(cards).toHaveLength(3)
    expect(locationLines).toEqual(['PITAHAYA', 'CABO', 'ROJO'])
    expect(locationLines).not.toContain('PITA')
    expect(locationLines).not.toContain('HAYA')
    expect(locationCard.textContent).not.toContain('…')
    expect(locationCard.textContent).not.toContain(',')
    expect(getNumericAttribute(locationCard, 'data-line-count')).toBe(3)
    expect(getNumericAttribute(locationCard, 'data-font-size')).toBeGreaterThanOrEqual(35)
    expect(cardWidths.location).toBeGreaterThan(cardWidths.date)
    expect(cardWidths.location).toBeGreaterThan(cardWidths.time)
    expect(
      locationCard.querySelector('[data-role="info-card-value"]').getAttribute('font-weight')
    ).toBe('800')
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

    const root = parseTemplateSvg(svg)
    expect(root.getAttribute('data-layout-orientation')).toBe('portrait')
    const contentBottom = getNumericAttribute(root, 'data-content-bottom')
    const pillsTop = getNumericAttribute(root, 'data-pills-top')
    expect(contentBottom).toBeLessThan(pillsTop)

    const cards = [...root.querySelectorAll('[data-role="info-card"]')]
    expect(cards).toHaveLength(3)
    for (const card of cards) {
      const cardTop = getNumericAttribute(card, 'data-card-top')
      const cardBottom = getNumericAttribute(card, 'data-card-bottom')
      const textTop = getNumericAttribute(card, 'data-text-top')
      const textBottom = getNumericAttribute(card, 'data-text-bottom')
      expect(cardTop).toBeGreaterThanOrEqual(0)
      expect(cardBottom).toBeLessThanOrEqual(canvas.height)
      expect(textTop).toBeGreaterThanOrEqual(cardTop)
      expect(textBottom).toBeLessThanOrEqual(cardBottom)
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

    const root = parseTemplateSvg(svg)
    const textElements = [...root.querySelectorAll('text')]
    const headline = textElements.find(
      (element) =>
        element.getAttribute('font-weight') === '800' && element.textContent.includes('Noche de')
    )
    const subtitle = textElements.find(
      (element) =>
        element.getAttribute('font-weight') === '700' && element.textContent.includes('Acompáñanos')
    )
    const body = textElements.find(
      (element) =>
        element.getAttribute('font-weight') === '400' && element.textContent.includes('Una noche')
    )
    const cardWidths = Object.fromEntries(
      [...root.querySelectorAll('[data-role="info-card"]')].map((card) => [
        card.getAttribute('data-kind'),
        getNumericAttribute(card, 'data-card-width'),
      ])
    )

    expect(headline).toBeDefined()
    expect(subtitle).toBeDefined()
    expect(body).toBeDefined()
    expect(getNumericAttribute(headline, 'font-size')).toBeLessThan(120)
    expect(getNumericAttribute(subtitle, 'font-size')).toBeLessThan(50)
    expect(getNumericAttribute(body, 'font-size')).toBeLessThan(36)
    expect(getNumericAttribute(headline, 'y')).toBeLessThan(getNumericAttribute(subtitle, 'y'))
    expect(getNumericAttribute(subtitle, 'y')).toBeLessThan(getNumericAttribute(body, 'y'))
    expect(cardWidths.location).toBeGreaterThan(cardWidths.date * 2)
    expect(cardWidths.location).toBeGreaterThan(cardWidths.time * 2)
    expect(getSvgTextValues(root)).toContain('Pitahaya, Cabo Rojo')
    expect(getSvgTextValues(root)).not.toContain('PITA')
    expect(getSvgTextValues(root)).not.toContain('HAYA')
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

    const root = parseTemplateSvg(svg)
    const textValues = getSvgTextValues(root)
    expect(root.textContent).not.toContain('PITAHAYACABO')
    expect(textValues).toContain('Pitahaya, Cabo Rojo')
    expect(textValues).not.toContain('PITA')
    expect(textValues).not.toContain('HAYA')
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

    const root = parseTemplateSvg(svg)
    const locationCard = root.querySelector('[data-role="info-card"][data-kind="location"]')
    expect(locationCard).not.toBeNull()
    const textValues = getSvgTextValues(locationCard)
    expect(getNumericAttribute(locationCard, 'data-line-count')).toBeLessThanOrEqual(2)
    expect(getNumericAttribute(locationCard, 'data-font-size')).toBeGreaterThanOrEqual(22)
    expect(getNumericAttribute(locationCard, 'data-card-width')).toBeGreaterThan(470)
    expect(locationCard.textContent).toContain('Castillo San Felipe')
    expect(textValues).toContain('Morro, San Juan')
    expect(locationCard.textContent).not.toContain('…')
  })

  test('preserves XML special characters as text content', () => {
    const svg = buildTemplateSvg({
      layout: 'simple',
      canvas: { width: 400, height: 500 },
      textFields: { headline: 'A < B & C > "D"' },
    })
    const root = parseTemplateSvg(svg)
    expect(getSvgTextValues(root)).toContain('A < B & C > "D"')
  })

  test('renders script-like user input only as inert SVG text', () => {
    const userText = '<script>alert("xss")</script>'
    const root = parseTemplateSvg(
      buildTemplateSvg({
        layout: 'simple',
        canvas: getSocialCanvas(),
        textFields: { headline: userText },
      })
    )

    expect(root.querySelector('script')).toBeNull()
    expect(getSvgTextValues(root)).toContain(userText)
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
    contentType: 'observation_night',
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

  test('rejects observation_night missing location', () => {
    const parsed = GenerateInputSchema.safeParse(
      withRuntimeMetadata({
        ...base,
        eventDetails: { name: 'X', date: '2026-07-11', time: '19:00' },
      })
    )
    expect(parsed.success).toBe(false)
  })
})
