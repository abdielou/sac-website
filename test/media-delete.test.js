jest.mock('@aws-sdk/client-s3', () => require('./helpers/s3-mock').clientS3Mock())

const { routeSend, lastInput, sentCount } = require('./helpers/s3-mock')

describe('media delete cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    routeSend({})
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

    await deleteMediaAssetObjects({
      slug: 'observacion-lunar',
      s3Key: 'media/videos/2026/05/07/observacion-lunar.mp4',
      thumbnail: 'https://sac-images.s3.amazonaws.com/media/posters/2026/05/07/poster.jpg',
    })

    expect(sentCount('DeleteObjectsCommand')).toBe(1)
    expect(lastInput('DeleteObjectsCommand')).toEqual({
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

    expect(lastInput('DeleteObjectsCommand')).toEqual({
      Bucket: 'sac-images',
      Delete: {
        Objects: [{ Key: 'media/posters/2026/05/07/old.jpg' }],
        Quiet: true,
      },
    })
  })
})
