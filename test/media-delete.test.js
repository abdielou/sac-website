const mockDeleteObjects = jest.fn()

jest.mock('aws-sdk', () => ({
  S3: jest.fn(() => ({
    deleteObjects: mockDeleteObjects,
  })),
}))

describe('media delete cleanup', () => {
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

  test('deletes the uploaded video and owned poster thumbnail from S3', async () => {
    const { deleteMediaAssetObjects } = require('@/lib/media-s3')
    mockDeleteObjects.mockReturnValue({ promise: () => Promise.resolve({}) })

    await deleteMediaAssetObjects({
      slug: 'observacion-lunar',
      s3Key: 'media/videos/2026/05/07/observacion-lunar.mp4',
      thumbnail: 'https://sac-images.s3.amazonaws.com/media/posters/2026/05/07/poster.jpg',
    })

    expect(mockDeleteObjects).toHaveBeenCalledWith({
      Bucket: 'sac-images',
      Delete: {
        Objects: [
          { Key: 'media/videos/2026/05/07/observacion-lunar.mp4' },
          { Key: 'media/posters/2026/05/07/poster.jpg' },
        ],
        Quiet: true,
      },
    })
  })

  test('deletes the old owned poster when thumbnail is replaced', async () => {
    const { deleteReplacedMediaThumbnail } = require('@/lib/media-s3')
    mockDeleteObjects.mockReturnValue({ promise: () => Promise.resolve({}) })

    await deleteReplacedMediaThumbnail(
      {
        slug: 'observacion-lunar',
        thumbnail: 'https://sac-images.s3.amazonaws.com/media/posters/2026/05/07/old.jpg',
      },
      {
        slug: 'observacion-lunar',
        thumbnail: 'https://sac-images.s3.amazonaws.com/media/posters/2026/05/07/new.jpg',
      }
    )

    expect(mockDeleteObjects).toHaveBeenCalledWith({
      Bucket: 'sac-images',
      Delete: {
        Objects: [{ Key: 'media/posters/2026/05/07/old.jpg' }],
        Quiet: true,
      },
    })
  })
})
