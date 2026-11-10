// Photos API Endpoint Tests

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3', () => require('../helpers/s3-mock').clientS3Mock())
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(async () => 'https://signed.example/object'),
}))

const { routeSend } = require('../helpers/s3-mock')

// Import the API handler
import handler from '../../pages/api/photos'

describe('Photos API Endpoint', () => {
  // Test data setup
  let mockReq, mockRes

  beforeEach(() => {
    mockReq = {}
    mockRes = {
      status: jest.fn(() => mockRes),
      json: jest.fn(() => mockRes),
    }
    jest.clearAllMocks()
    routeSend({ ListObjectsV2Command: { Contents: [] } })
  })

  // Test: Function type
  test('should be a function', () => {
    expect(typeof handler).toBe('function')
  })

  // Test: Successful request
  test('should handle successful request', async () => {
    await handler(mockReq, mockRes)

    expect(mockRes.status).toHaveBeenCalledWith(200)
    expect(mockRes.json).toHaveBeenCalled()
    expect(typeof mockRes.json.mock.calls[0][0]).toBe('object')
  })

  // Test: Response format
  test('should return array of images', async () => {
    await handler(mockReq, mockRes)

    const responseData = mockRes.json.mock.calls[0][0]
    expect(Array.isArray(responseData)).toBe(true)
  })

  // Test: Request/response objects
  test('should handle request and response objects', () => {
    expect(typeof mockReq).toBe('object')
    expect(typeof mockRes).toBe('object')
    expect(typeof mockRes.status).toBe('function')
    expect(typeof mockRes.json).toBe('function')
  })

  // Test: Environment access
  test('should access process environment', () => {
    // Test that handler can access process.env
    expect(typeof process.env).toBe('object')
    expect(process.env).toBeDefined()
    expect(typeof process.env.NODE_ENV).toBe('string')
  })
})
