import { buildAiImageDownloadFileName } from '../../lib/ai-image-download-name'

describe('buildAiImageDownloadFileName', () => {
  test('uses the event date and a filesystem-safe location for observation nights', () => {
    expect(
      buildAiImageDownloadFileName({
        contentType: 'observation_night',
        eventDetails: {
          date: '2026-08-15',
          location: 'Pitahaya, Cabo Rojo',
        },
        mimeType: 'image/png',
      })
    ).toBe('SAC-noche-observacion-2026-08-15-pitahaya-cabo-rojo.png')
  })

  test('uses the generation date and topic for non-event content', () => {
    expect(
      buildAiImageDownloadFileName({
        contentType: 'educational_astronomy',
        topic: 'Cómo observar un eclipse lunar',
        mimeType: 'image/jpeg',
        generatedAt: '2026-08-01T18:30:00Z',
      })
    ).toBe('SAC-educacion-como-observar-un-eclipse-lunar-2026-08-01.jpg')
  })

  test('falls back safely when metadata is incomplete', () => {
    expect(
      buildAiImageDownloadFileName({
        contentType: 'regular_post',
        mimeType: 'image/webp',
        generatedAt: '2026-08-01T18:30:00Z',
      })
    ).toBe('SAC-publicacion-2026-08-01.webp')
  })
})
