const mockGetObject = jest.fn()
const mockPutObject = jest.fn()
const mockCopyObject = jest.fn()
const mockDeleteObject = jest.fn()

jest.mock('aws-sdk', () => ({
  S3: jest.fn(() => ({
    getObject: mockGetObject,
    putObject: mockPutObject,
    copyObject: mockCopyObject,
    deleteObject: mockDeleteObject,
  })),
}))

const baseEntry = {
  slug: 'observacion-lunar',
  title: 'Observacion lunar',
  description: 'Video de una observacion lunar',
  s3Key: 'media/videos/2026/05/07/observacion-lunar.mp4',
  thumbnail: null,
  duration: null,
  publishedAt: '2026-05-07T12:00:00.000Z',
}

function indexBody(media) {
  return {
    promise: () =>
      Promise.resolve({
        Body: Buffer.from(JSON.stringify({ media, updatedAt: '2026-05-07T12:00:00.000Z' })),
      }),
  }
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

    mockGetObject.mockReturnValue(indexBody([baseEntry]))
    mockCopyObject.mockReturnValue({ promise: () => Promise.resolve({}) })
    mockDeleteObject.mockReturnValue({ promise: () => Promise.resolve({}) })
    mockPutObject.mockReturnValue({ promise: () => Promise.resolve({}) })

    const updated = await renameMediaEntry('observacion-lunar', 'eclipse-lunar')

    expect(mockCopyObject).toHaveBeenCalledWith({
      Bucket: 'sac-images',
      CopySource: 'sac-images/media/videos/2026/05/07/observacion-lunar.mp4',
      Key: 'media/videos/2026/05/07/eclipse-lunar.mp4',
    })
    expect(mockDeleteObject).toHaveBeenCalledWith({
      Bucket: 'sac-images',
      Key: 'media/videos/2026/05/07/observacion-lunar.mp4',
    })
    expect(updated.slug).toBe('eclipse-lunar')
    expect(updated.s3Key).toBe('media/videos/2026/05/07/eclipse-lunar.mp4')
  })

  test('replaces the old slug with the new slug in the persisted index', async () => {
    const { renameMediaEntry } = require('@/lib/media-s3')

    mockGetObject.mockReturnValue(indexBody([baseEntry]))
    mockCopyObject.mockReturnValue({ promise: () => Promise.resolve({}) })
    mockDeleteObject.mockReturnValue({ promise: () => Promise.resolve({}) })
    mockPutObject.mockReturnValue({ promise: () => Promise.resolve({}) })

    await renameMediaEntry('observacion-lunar', 'eclipse-lunar')

    const indexPut = mockPutObject.mock.calls.find((call) => call[0].Key === 'media/index.json')
    expect(indexPut).toBeDefined()
    const persistedIndex = JSON.parse(indexPut[0].Body)
    expect(persistedIndex.media.find((m) => m.slug === 'observacion-lunar')).toBeUndefined()
    expect(persistedIndex.media.find((m) => m.slug === 'eclipse-lunar')).toMatchObject({
      slug: 'eclipse-lunar',
      s3Key: 'media/videos/2026/05/07/eclipse-lunar.mp4',
    })
  })

  test('rejects rename when the requested slug already belongs to another entry', async () => {
    const { renameMediaEntry } = require('@/lib/media-s3')

    mockGetObject.mockReturnValue(
      indexBody([
        baseEntry,
        {
          slug: 'eclipse-lunar',
          title: 'Eclipse lunar',
          s3Key: 'media/videos/2026/05/06/eclipse-lunar.mp4',
          publishedAt: '2026-05-06T00:00:00.000Z',
        },
      ])
    )

    await expect(renameMediaEntry('observacion-lunar', 'eclipse-lunar')).rejects.toThrow(
      /ya existe/i
    )

    expect(mockCopyObject).not.toHaveBeenCalled()
    expect(mockDeleteObject).not.toHaveBeenCalled()
    expect(mockPutObject).not.toHaveBeenCalled()
  })
})
