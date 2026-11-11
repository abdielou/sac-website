import {
  putGuideJSON,
  getGuideJSON,
  deleteGuideJSON,
  getGuideIndex,
  putGuideIndex,
} from '../lib/guides-s3'

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3', () => require('./helpers/s3-mock').clientS3Mock())

const { routeSend, lastInput, jsonBody, noSuchKey } = require('./helpers/s3-mock')

beforeEach(() => {
  jest.clearAllMocks()
  routeSend({})
  process.env.S3_ARTICLES_BUCKET_NAME = 'test-bucket'
  process.env.AWS_REGION = 'us-east-1'
})

afterEach(() => {
  delete process.env.S3_ARTICLES_BUCKET_NAME
  delete process.env.AWS_REGION
  delete process.env.AWS_S3_ENDPOINT
})

const sampleGuide = {
  title: 'Galaxias de Primavera 2026',
  type: 'galaxies',
  slug: 'galaxias-primavera-2026',
  status: 'draft',
  publishedAt: null,
  createdAt: '2026-03-26T00:00:00Z',
  updatedAt: '2026-03-26T00:00:00Z',
  author: 'admin@sac.org',
  entries: [
    {
      objectId: 'NGC0224',
      difficulty: 'easy',
      equipment: 'binoculars',
      location: 'urban',
      optimalTime: '20:00-23:00',
      notes: 'Visible a simple vista en cielos oscuros',
    },
  ],
}

describe('putGuideJSON', () => {
  it('writes guide JSON to S3 at guides/{slug}.json', async () => {
    routeSend({ PutObjectCommand: { ETag: '"abc"' } })

    await putGuideJSON('galaxias-primavera-2026', sampleGuide)

    expect(lastInput('PutObjectCommand')).toEqual({
      Bucket: 'test-bucket',
      Key: 'guides/galaxias-primavera-2026.json',
      Body: JSON.stringify(sampleGuide, null, 2),
      ContentType: 'application/json',
    })
  })
})

describe('getGuideJSON', () => {
  it('reads and parses guide JSON from S3', async () => {
    routeSend({ GetObjectCommand: jsonBody(sampleGuide) })

    const result = await getGuideJSON('galaxias-primavera-2026')

    expect(lastInput('GetObjectCommand')).toEqual({
      Bucket: 'test-bucket',
      Key: 'guides/galaxias-primavera-2026.json',
    })
    expect(result).toEqual(sampleGuide)
  })

  it('throws helpful error for non-existent guide (NoSuchKey)', async () => {
    routeSend({
      GetObjectCommand: () => {
        throw noSuchKey()
      },
    })

    await expect(getGuideJSON('nonexistent')).rejects.toThrow('Guide not found: nonexistent')
  })

  it('throws error when bucket not configured', async () => {
    delete process.env.S3_ARTICLES_BUCKET_NAME

    await expect(getGuideJSON('some-slug')).rejects.toThrow('S3 not configured')
  })
})

describe('deleteGuideJSON', () => {
  it('removes guide from S3', async () => {
    await deleteGuideJSON('galaxias-primavera-2026')

    expect(lastInput('DeleteObjectCommand')).toEqual({
      Bucket: 'test-bucket',
      Key: 'guides/galaxias-primavera-2026.json',
    })
  })
})

describe('getGuideIndex', () => {
  it('returns empty index when no index exists (NoSuchKey)', async () => {
    routeSend({
      GetObjectCommand: () => {
        throw noSuchKey()
      },
    })

    const result = await getGuideIndex()

    expect(result).toEqual({ guides: [], updatedAt: null })
  })

  it('returns empty index when bucket not configured', async () => {
    delete process.env.S3_ARTICLES_BUCKET_NAME

    const result = await getGuideIndex()

    expect(result).toEqual({ guides: [], updatedAt: null })
  })

  it('reads and parses existing index', async () => {
    const indexData = {
      guides: [{ slug: 'test', title: 'Test', type: 'galaxies', status: 'published' }],
      updatedAt: '2026-03-26T00:00:00Z',
    }
    routeSend({ GetObjectCommand: jsonBody(indexData) })

    const result = await getGuideIndex()

    expect(lastInput('GetObjectCommand')).toEqual({
      Bucket: 'test-bucket',
      Key: 'guides/index.json',
    })
    expect(result).toEqual(indexData)
  })
})

describe('putGuideIndex', () => {
  it('writes index to guides/index.json', async () => {
    routeSend({ PutObjectCommand: { ETag: '"abc"' } })
    const indexData = {
      guides: [{ slug: 'test', title: 'Test' }],
      updatedAt: '2026-03-26T00:00:00Z',
    }

    await putGuideIndex(indexData)

    expect(lastInput('PutObjectCommand')).toEqual({
      Bucket: 'test-bucket',
      Key: 'guides/index.json',
      Body: JSON.stringify(indexData, null, 2),
      ContentType: 'application/json',
    })
  })
})
