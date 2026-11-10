jest.mock('@aws-sdk/client-s3', () => require('./helpers/s3-mock').clientS3Mock())

const { routeSend, lastInput, sentInputs, sentCount, jsonBody } = require('./helpers/s3-mock')

const baseEntry = {
  slug: 'observacion-lunar',
  title: 'Observacion lunar',
  description: 'Video de una observacion lunar',
  s3Key: 'media/videos/2026/05/07/observacion-lunar.mp4',
  thumbnail: null,
  duration: null,
  publishedAt: '2026-05-07T12:00:00.000Z',
}

function serveIndex(media) {
  routeSend({
    GetObjectCommand: jsonBody({ media, updatedAt: '2026-05-07T12:00:00.000Z' }),
  })
}

describe('media rename', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.S3_IMAGES_BUCKET_NAME = 'sac-images'
    process.env.AWS_REGION = 'us-east-1'
  })

  afterEach(() => {
    delete process.env.S3_IMAGES_BUCKET_NAME
    delete process.env.AWS_REGION
    delete process.env.AWS_S3_ENDPOINT
  })

  test('moves the S3 video object to a new key in the same directory and extension', async () => {
    const { renameMediaEntry } = require('@/lib/media-s3')

    serveIndex([baseEntry])

    const updated = await renameMediaEntry('observacion-lunar', 'eclipse-lunar')

    expect(lastInput('CopyObjectCommand')).toEqual({
      Bucket: 'sac-images',
      CopySource: 'sac-images/media/videos/2026/05/07/observacion-lunar.mp4',
      Key: 'media/videos/2026/05/07/eclipse-lunar.mp4',
    })
    expect(lastInput('DeleteObjectCommand')).toEqual({
      Bucket: 'sac-images',
      Key: 'media/videos/2026/05/07/observacion-lunar.mp4',
    })
    expect(updated.slug).toBe('eclipse-lunar')
    expect(updated.s3Key).toBe('media/videos/2026/05/07/eclipse-lunar.mp4')
  })

  test('replaces the old slug with the new slug in the persisted index', async () => {
    const { renameMediaEntry } = require('@/lib/media-s3')

    serveIndex([baseEntry])

    await renameMediaEntry('observacion-lunar', 'eclipse-lunar')

    const indexPut = sentInputs('PutObjectCommand').find((i) => i.Key === 'media/index.json')
    expect(indexPut).toBeDefined()
    const persistedIndex = JSON.parse(indexPut.Body)
    expect(persistedIndex.media.find((m) => m.slug === 'observacion-lunar')).toBeUndefined()
    expect(persistedIndex.media.find((m) => m.slug === 'eclipse-lunar')).toMatchObject({
      slug: 'eclipse-lunar',
      s3Key: 'media/videos/2026/05/07/eclipse-lunar.mp4',
    })
  })

  test('rejects rename when the requested slug already belongs to another entry', async () => {
    const { renameMediaEntry } = require('@/lib/media-s3')

    serveIndex([
      baseEntry,
      {
        slug: 'eclipse-lunar',
        title: 'Eclipse lunar',
        s3Key: 'media/videos/2026/05/06/eclipse-lunar.mp4',
        publishedAt: '2026-05-06T00:00:00.000Z',
      },
    ])

    await expect(renameMediaEntry('observacion-lunar', 'eclipse-lunar')).rejects.toThrow(
      /ya existe/i
    )

    expect(sentCount('CopyObjectCommand')).toBe(0)
    expect(sentCount('DeleteObjectCommand')).toBe(0)
    expect(sentCount('PutObjectCommand')).toBe(0)
  })
})
