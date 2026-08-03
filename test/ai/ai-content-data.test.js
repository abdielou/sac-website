import {
  contentDataToLegacyInput,
  legacyInputToContentData,
  validateContentData,
} from '../../lib/ai-content-data'
import { FIELD_LIBRARY } from '../../lib/ai-guidelines-schema'

const makeField = (key, required = false) => ({
  key,
  label: FIELD_LIBRARY[key].label,
  help: '',
  placeholder: '',
  required,
})

const allFieldsDefinition = {
  id: 'event_promotion',
  label: 'Promoción de evento',
  titleSource: 'event_name',
  fields: Object.keys(FIELD_LIBRARY).map((key) => makeField(key)),
}

const observationNightDefinition = {
  id: 'observation_night',
  label: 'Noche de Observación',
  titleSource: 'type_label',
  fields: [
    makeField('date', true),
    makeField('time', true),
    makeField('location', true),
    makeField('cta'),
    makeField('sponsor'),
  ],
}

const sponsorLogo = {
  dataUrl: 'data:image/png;base64,AAAA',
  mimeType: 'image/png',
  fileName: 'sponsor.png',
}

describe('legacyInputToContentData', () => {
  test('maps all 15 supported keys from the API request shape', () => {
    expect(Object.keys(FIELD_LIBRARY)).toHaveLength(15)

    expect(
      legacyInputToContentData(
        {
          intent: ' Invitar ',
          topic: ' Cielo de agosto ',
          tone: ' cercano ',
          audience: ' familias ',
          cta: ' Regístrate ',
          knownFacts: [' Fecha confirmada ', 'Entrada libre'],
          hashtags: '["#SAC", "#Astronomía"]',
          links: 'https://sac.example, https://registro.example',
          imageStyle: ' ilustración ',
          imageConstraints: ' sin rostros ',
          eventDetails: {
            name: ' Perseidas ',
            date: ' 2026-08-12 ',
            time: ' 20:30 ',
            location: ' Cabo Rojo ',
          },
          sponsorLogo,
        },
        allFieldsDefinition
      )
    ).toEqual({
      intent: 'Invitar',
      topic: 'Cielo de agosto',
      event_name: 'Perseidas',
      date: '2026-08-12',
      time: '20:30',
      location: 'Cabo Rojo',
      cta: 'Regístrate',
      tone: 'cercano',
      audience: 'familias',
      known_facts: ['Fecha confirmada', 'Entrada libre'],
      hashtags: ['#SAC', '#Astronomía'],
      links: ['https://sac.example', 'https://registro.example'],
      image_style: 'ilustración',
      image_constraints: 'sin rostros',
      sponsor: sponsorLogo,
    })
  })

  test('maps flat formState event fields and list text', () => {
    expect(
      legacyInputToContentData(
        {
          eventName: 'Perseidas',
          eventDate: '2026-08-12',
          eventTime: '20:30',
          eventLocation: 'Cabo Rojo',
          eventCta: 'Acompáñanos',
          cta: 'No debe ganar',
          knownFacts: 'Dato uno\nDato dos',
          hashtags: '#SAC, #Cielo',
          links: 'https://sac.example,https://registro.example',
          sponsorLogo,
        },
        allFieldsDefinition
      )
    ).toEqual(
      expect.objectContaining({
        event_name: 'Perseidas',
        date: '2026-08-12',
        time: '20:30',
        location: 'Cabo Rojo',
        cta: 'Acompáñanos',
        known_facts: ['Dato uno', 'Dato dos'],
        hashtags: ['#SAC', '#Cielo'],
        links: ['https://sac.example', 'https://registro.example'],
        sponsor: sponsorLogo,
      })
    )
  })

  test('only emits fields selected by the resolved definition', () => {
    expect(
      legacyInputToContentData(
        {
          intent: 'No seleccionado',
          eventName: 'Intento de reemplazo',
          eventDate: '2026-08-12',
          eventTime: '20:30',
          eventLocation: 'Cabo Rojo',
          privateNotes: 'No soportado',
        },
        observationNightDefinition
      )
    ).toEqual({
      date: '2026-08-12',
      time: '20:30',
      location: 'Cabo Rojo',
    })
  })

  test('uses the generic CTA when an unrelated empty event field remains in formState', () => {
    const definition = {
      id: 'regular_post',
      label: 'Publicación regular',
      titleSource: 'topic',
      fields: [makeField('topic', true), makeField('cta')],
    }

    expect(
      legacyInputToContentData(
        { topic: 'Cielo del mes', cta: 'Conoce más', eventCta: '' },
        definition
      )
    ).toEqual({ topic: 'Cielo del mes', cta: 'Conoce más' })
  })
})

describe('validateContentData', () => {
  const strictDefinition = {
    id: 'strict_type',
    label: 'Tipo estricto',
    titleSource: 'topic',
    fields: [
      makeField('topic', true),
      makeField('date', true),
      makeField('time', true),
      makeField('known_facts', true),
    ],
  }

  test('normalizes a valid document without mutating it', () => {
    const source = Object.freeze({
      topic: '  Eclipse lunar  ',
      date: '2026-08-12',
      time: '20:30',
      known_facts: Object.freeze([' Visible desde PR ']),
    })

    expect(validateContentData(source, strictDefinition)).toEqual({
      ok: true,
      errors: [],
      data: {
        topic: 'Eclipse lunar',
        date: '2026-08-12',
        time: '20:30',
        known_facts: ['Visible desde PR'],
      },
    })
  })

  test('rejects arbitrary and globally supported but unselected keys', () => {
    const result = validateContentData(
      {
        topic: 'Eclipse',
        date: '2026-08-12',
        time: '20:30',
        known_facts: ['Visible'],
        private_notes: 'No soportado',
        audience: 'No seleccionado',
      },
      strictDefinition
    )

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'contentData contiene la clave no permitida "private_notes".',
        'contentData contiene la clave no permitida "audience".',
      ])
    )
  })

  test('enforces required values and text limits', () => {
    const definition = {
      fields: [makeField('topic', true), makeField('tone')],
    }
    const result = validateContentData(
      { topic: ' ', tone: 'x'.repeat(FIELD_LIBRARY.tone.maxLength + 1) },
      definition
    )

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'contentData.topic es obligatorio.',
        `contentData.tone admite hasta ${FIELD_LIBRARY.tone.maxLength} caracteres.`,
      ])
    )
  })

  test.each([
    ['2026-02-30', '20:30', 'fecha válida'],
    ['12/08/2026', '20:30', 'fecha válida'],
    ['2026-08-12', '24:01', 'hora válida'],
    ['2026-08-12', '8:30 PM', 'hora válida'],
  ])('rejects invalid date/time values: %s %s', (date, time, expected) => {
    const result = validateContentData(
      { topic: 'Eclipse', date, time, known_facts: ['Visible'] },
      strictDefinition
    )

    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.includes(expected))).toBe(true)
  })

  test('enforces list type, item type, item limit, and length', () => {
    const listDefinition = { fields: [makeField('known_facts', true)] }
    const wrongType = validateContentData({ known_facts: 'Dato uno' }, listDefinition)
    const invalidItems = validateContentData(
      {
        known_facts: [
          '',
          42,
          'x'.repeat(FIELD_LIBRARY.known_facts.itemMaxLength + 1),
          ...Array(FIELD_LIBRARY.known_facts.maxItems).fill('dato'),
        ],
      },
      listDefinition
    )

    expect(wrongType.errors).toContain('contentData.known_facts debe ser una lista.')
    expect(invalidItems.errors).toEqual(
      expect.arrayContaining([
        `contentData.known_facts admite hasta ${FIELD_LIBRARY.known_facts.maxItems} elementos.`,
        'contentData.known_facts[0] debe ser texto no vacío.',
        'contentData.known_facts[1] debe ser texto no vacío.',
        `contentData.known_facts[2] admite hasta ${FIELD_LIBRARY.known_facts.itemMaxLength} caracteres.`,
      ])
    )
  })

  test('validates sponsor shape, size metadata, and arbitrary properties', () => {
    const definition = { fields: [makeField('sponsor', true)] }
    expect(validateContentData({ sponsor: sponsorLogo }, definition).ok).toBe(true)

    const result = validateContentData(
      {
        sponsor: {
          ...sponsorLogo,
          fileName: 'x'.repeat(256),
          privateNotes: 'No soportado',
        },
      },
      definition
    )
    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'contentData.sponsor contiene la propiedad no permitida "privateNotes".',
        'contentData.sponsor.fileName admite hasta 255 caracteres.',
      ])
    )
  })

  test('rejects fields that are unsupported by the shared library', () => {
    const result = validateContentData({}, { fields: [{ key: 'custom', required: false }] })
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('La definición usa el campo no soportado "custom".')
  })
})

describe('contentDataToLegacyInput', () => {
  test('preserves observation_night identity and canonical title from the definition', () => {
    const legacy = contentDataToLegacyInput(
      {
        date: '2026-08-12',
        time: '20:30',
        location: 'Cabo Rojo',
        cta: 'Acompáñanos',
        sponsor: sponsorLogo,
      },
      observationNightDefinition
    )

    expect(legacy).toEqual({
      contentType: 'observation_night',
      cta: 'Acompáñanos',
      sponsorLogo,
      eventDetails: {
        name: 'Noche de Observación',
        date: '2026-08-12',
        time: '20:30',
        location: 'Cabo Rojo',
      },
      topic: 'Noche de Observación — 2026-08-12 · 20:30 · Cabo Rojo',
      intent: 'Invitar al público a Noche de Observación en Cabo Rojo',
    })
  })

  test('uses event_name only when selected by titleSource', () => {
    const definition = {
      id: 'custom_event',
      label: 'Evento genérico',
      titleSource: 'event_name',
      fields: [
        makeField('event_name', true),
        makeField('date', true),
        makeField('time', true),
        makeField('location', true),
      ],
    }
    expect(
      contentDataToLegacyInput(
        {
          event_name: 'Perseidas',
          date: '2026-08-12',
          time: '20:30',
          location: 'Cabo Rojo',
        },
        definition
      )
    ).toEqual(
      expect.objectContaining({
        contentType: 'custom_event',
        eventDetails: {
          name: 'Perseidas',
          date: '2026-08-12',
          time: '20:30',
          location: 'Cabo Rojo',
        },
      })
    )
  })

  test('builds eventDetails for an event template even without logistics fields', () => {
    const definition = {
      id: 'event_announcement',
      label: 'Anuncio de evento',
      titleSource: 'topic',
      fields: [makeField('topic', true)],
      visual: { template: 'event' },
    }

    expect(contentDataToLegacyInput({ topic: 'Encuentro mensual' }, definition)).toMatchObject({
      contentType: 'event_announcement',
      topic: 'Encuentro mensual',
      eventDetails: { name: 'Encuentro mensual' },
    })
  })

  test('does not build eventDetails from optional event fields alone', () => {
    const definition = {
      id: 'community_update',
      label: 'Actualización comunitaria',
      titleSource: 'topic',
      fields: [makeField('intent', true), makeField('topic', true), makeField('event_name')],
      visual: { template: null },
    }

    expect(
      contentDataToLegacyInput({ intent: 'Informar', topic: 'Reunión del club' }, definition)
    ).toEqual({
      contentType: 'community_update',
      intent: 'Informar',
      topic: 'Reunión del club',
    })
  })

  test('maps snake_case fields back to the current workflow keys', () => {
    const definition = {
      id: 'regular_post',
      label: 'Publicación regular',
      titleSource: 'topic',
      fields: [
        makeField('intent', true),
        makeField('topic', true),
        makeField('known_facts'),
        makeField('image_style'),
        makeField('image_constraints'),
      ],
    }

    expect(
      contentDataToLegacyInput(
        {
          intent: 'Educar',
          topic: 'Eclipse lunar',
          known_facts: ['Visible desde PR'],
          image_style: 'Ilustración',
          image_constraints: 'Sin rostros',
        },
        definition
      )
    ).toEqual({
      contentType: 'regular_post',
      intent: 'Educar',
      topic: 'Eclipse lunar',
      knownFacts: ['Visible desde PR'],
      imageStyle: 'Ilustración',
      imageConstraints: 'Sin rostros',
    })
  })

  test('fails closed when contentData is invalid', () => {
    expect(() =>
      contentDataToLegacyInput(
        { date: '2026-08-12', time: '20:30', location: 'Cabo Rojo', private: true },
        observationNightDefinition
      )
    ).toThrow(/contentData inválido/)
  })
})
