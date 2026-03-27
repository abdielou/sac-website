import { putGuideJSON, getGuideJSON, deleteGuideJSON, getGuideIndex, putGuideIndex } from '../lib/guides-s3'

// Mock AWS SDK
const mockPutObject = jest.fn()
const mockGetObject = jest.fn()
const mockDeleteObject = jest.fn()

jest.mock('aws-sdk', () => ({
  S3: jest.fn(() => ({
    putObject: mockPutObject,
    getObject: mockGetObject,
    deleteObject: mockDeleteObject,
  })),
}))

beforeEach(() => {
  jest.clearAllMocks()
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
    mockPutObject.mockReturnValue({ promise: () => Promise.resolve({ ETag: '"abc"' }) })

    await putGuideJSON('galaxias-primavera-2026', sampleGuide)

    expect(mockPutObject).toHaveBeenCalledWith({
      Bucket: 'test-bucket',
      Key: 'guides/galaxias-primavera-2026.json',
      Body: JSON.stringify(sampleGuide, null, 2),
      ContentType: 'application/json',
    })
  })
})

describe('getGuideJSON', () => {
  it('reads and parses guide JSON from S3', async () => {
    mockGetObject.mockReturnValue({
      promise: () => Promise.resolve({ Body: Buffer.from(JSON.stringify(sampleGuide)) }),
    })

    const result = await getGuideJSON('galaxias-primavera-2026')

    expect(mockGetObject).toHaveBeenCalledWith({
      Bucket: 'test-bucket',
      Key: 'guides/galaxias-primavera-2026.json',
    })
    expect(result).toEqual(sampleGuide)
  })

  it('throws helpful error for non-existent guide (NoSuchKey)', async () => {
    const noKeyErr = new Error('NoSuchKey')
    noKeyErr.code = 'NoSuchKey'
    mockGetObject.mockReturnValue({ promise: () => Promise.reject(noKeyErr) })

    await expect(getGuideJSON('nonexistent')).rejects.toThrow('Guide not found: nonexistent')
  })

  it('throws error when bucket not configured', async () => {
    delete process.env.S3_ARTICLES_BUCKET_NAME

    await expect(getGuideJSON('some-slug')).rejects.toThrow('S3 not configured')
  })
})

describe('deleteGuideJSON', () => {
  it('removes guide from S3', async () => {
    mockDeleteObject.mockReturnValue({ promise: () => Promise.resolve({}) })

    await deleteGuideJSON('galaxias-primavera-2026')

    expect(mockDeleteObject).toHaveBeenCalledWith({
      Bucket: 'test-bucket',
      Key: 'guides/galaxias-primavera-2026.json',
    })
  })
})

describe('getGuideIndex', () => {
  it('returns empty index when no index exists (NoSuchKey)', async () => {
    const noKeyErr = new Error('NoSuchKey')
    noKeyErr.code = 'NoSuchKey'
    mockGetObject.mockReturnValue({ promise: () => Promise.reject(noKeyErr) })

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
    mockGetObject.mockReturnValue({
      promise: () => Promise.resolve({ Body: Buffer.from(JSON.stringify(indexData)) }),
    })

    const result = await getGuideIndex()

    expect(mockGetObject).toHaveBeenCalledWith({
      Bucket: 'test-bucket',
      Key: 'guides/index.json',
    })
    expect(result).toEqual(indexData)
  })
})

describe('putGuideIndex', () => {
  it('writes index to guides/index.json', async () => {
    mockPutObject.mockReturnValue({ promise: () => Promise.resolve({ ETag: '"abc"' }) })
    const indexData = {
      guides: [{ slug: 'test', title: 'Test' }],
      updatedAt: '2026-03-26T00:00:00Z',
    }

    await putGuideIndex(indexData)

    expect(mockPutObject).toHaveBeenCalledWith({
      Bucket: 'test-bucket',
      Key: 'guides/index.json',
      Body: JSON.stringify(indexData, null, 2),
      ContentType: 'application/json',
    })
  })
})
