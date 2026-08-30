import { buildAiImageDownloadFileName } from '../../lib/ai-image-download-name'

describe('buildAiImageDownloadFileName', () => {
  test('uses the Guidelines label and event primitives for an event file name', () => {
    expect(
      buildAiImageDownloadFileName({
        contentType: 'arbitrary_event',
        contentTypeDefinition: {
          label: 'Noche de Observación',
          fields: [{ key: 'date', required: true }],
          visual: { template: 'event' },
        },
        eventDetails: {
          date: '2026-08-15',
          location: 'Pitahaya, Cabo Rojo',
        },
        mimeType: 'image/png',
      })
    ).toBe('SAC-noche-de-observacion-2026-08-15-pitahaya-cabo-rojo.png')
  })

  test('uses the Guidelines label and generation date for non-event content', () => {
    expect(
      buildAiImageDownloadFileName({
        contentType: 'arbitrary_educational_type',
        contentTypeDefinition: {
          label: 'Educación',
          fields: [{ key: 'topic', required: true }],
          visual: { template: null },
        },
        topic: 'Cómo observar un eclipse lunar',
        mimeType: 'image/jpeg',
        generatedAt: '2026-08-01T18:30:00Z',
      })
    ).toBe('SAC-educacion-como-observar-un-eclipse-lunar-2026-08-01.jpg')
  })

  test('falls back to the Guidelines label safely when metadata is incomplete', () => {
    expect(
      buildAiImageDownloadFileName({
        contentType: 'arbitrary_type',
        contentTypeDefinition: {
          label: 'Publicación',
          fields: [{ key: 'topic', required: true }],
          visual: { template: null },
        },
        mimeType: 'image/webp',
        generatedAt: '2026-08-01T18:30:00Z',
      })
    ).toBe('SAC-publicacion-2026-08-01.webp')
  })
})
