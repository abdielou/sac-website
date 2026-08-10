/**
 * @jest-environment node
 */

const mockPutObject = jest.fn()
const mockGetObject = jest.fn()
const mockS3 = {
  putObject: mockPutObject,
  getObject: mockGetObject,
}

jest.mock('aws-sdk', () => ({
  S3: jest.fn(() => mockS3),
}))

const {
  buildAiRunFailureKey,
  persistAiRunFailure,
  readAiRunFailure,
} = require('../../lib/run-history-store')

describe('AI run failure S3 sidecars', () => {
  const previousBucket = process.env.S3_ARTICLES_BUCKET_NAME

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.S3_ARTICLES_BUCKET_NAME = 'test-bucket'
  })

  afterAll(() => {
    if (previousBucket === undefined) delete process.env.S3_ARTICLES_BUCKET_NAME
    else process.env.S3_ARTICLES_BUCKET_NAME = previousBucket
  })

  test('writes only AiRunFailureV1 to the deterministic key', async () => {
    mockPutObject.mockReturnValueOnce({ promise: jest.fn().mockResolvedValue({}) })

    await persistAiRunFailure('wrun_s3_failure', {
      code: 'wrong_modality',
      stage: 'request',
      retryable: false,
      message: 'Formato incorrecto.',
      stack: 'secret stack',
      prompt: 'secret prompt',
      rawResponse: { images: ['secret'] },
    })

    expect(buildAiRunFailureKey('wrun_s3_failure')).toBe(
      'workflow-run-failures/wrun_s3_failure.json'
    )
    expect(mockPutObject).toHaveBeenCalledTimes(1)
    const request = mockPutObject.mock.calls[0][0]
    expect(request).toMatchObject({
      Bucket: 'test-bucket',
      Key: 'workflow-run-failures/wrun_s3_failure.json',
      ContentType: 'application/json',
    })
    expect(JSON.parse(request.Body)).toEqual({
      schemaVersion: 1,
      code: 'wrong_modality',
      stage: 'request',
      retryable: false,
      message: 'Formato incorrecto.',
    })
    expect(request.Body).not.toMatch(/secret|stack|prompt|rawResponse/)
  })

  test('reads and validates an existing S3 sidecar', async () => {
    const failure = {
      schemaVersion: 1,
      code: 'network_error',
      stage: 'request',
      retryable: true,
      message: 'La revisión no está disponible temporalmente.',
    }
    mockGetObject.mockReturnValueOnce({
      promise: jest.fn().mockResolvedValue({ Body: Buffer.from(JSON.stringify(failure)) }),
    })

    await expect(readAiRunFailure('wrun_s3_read')).resolves.toEqual(failure)
    expect(mockGetObject).toHaveBeenCalledWith({
      Bucket: 'test-bucket',
      Key: 'workflow-run-failures/wrun_s3_read.json',
    })
  })
})
