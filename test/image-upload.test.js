/**
 * @jest-environment node
 */
const mockPutObject = jest.fn()

jest.mock('aws-sdk', () => ({
  S3: jest.fn(() => ({ putObject: mockPutObject })),
}))

jest.mock('../lib/s3-client', () => {
  const actual = jest.requireActual('../lib/s3-client')
  return { ...actual, saveStubPublicFile: jest.fn(async (key) => `/local-s3/${key}`) }
})

import { saveStubPublicFile } from '../lib/s3-client'
import { sanitizeFilename, uploadPublicImage } from '../lib/image-upload'

const env = { ...process.env }

const imageFile = (overrides = {}) => ({
  name: 'Mi Foto (1).JPG',
  type: 'image/jpeg',
  size: 1234,
  arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  ...overrides,
})

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers().setSystemTime(new Date('2026-11-10T12:00:00Z'))
  mockPutObject.mockReturnValue({ promise: () => Promise.resolve({}) })
  delete process.env.S3_STUB_DIR
  process.env.S3_IMAGES_BUCKET_NAME = 'sac-images'
})

afterEach(() => {
  jest.useRealTimers()
  process.env = { ...env }
})

test('sanitizeFilename keeps the article rules', () => {
  expect(sanitizeFilename('Mi Foto (1).JPG')).toBe('mi-foto-1.jpg')
  expect(sanitizeFilename('a  b--c.png')).toBe('a-b-c.png')
})

test('keeps the article key and URL format', async () => {
  const result = await uploadPublicImage(imageFile(), { keyPrefix: 'images/blog' })

  expect(result).toEqual({
    ok: true,
    key: 'images/blog/2026/11/10/mi-foto-1.jpg',
    url: 'https://sac-images.s3.amazonaws.com/images/blog/2026/11/10/mi-foto-1.jpg',
  })
  expect(mockPutObject).toHaveBeenCalledWith({
    Bucket: 'sac-images',
    Key: 'images/blog/2026/11/10/mi-foto-1.jpg',
    Body: Buffer.from([1, 2, 3]),
    ContentType: 'image/jpeg',
  })
})

test('adds a timestamp to the file name when asked', async () => {
  const result = await uploadPublicImage(imageFile(), {
    keyPrefix: 'images/guides',
    uniqueName: true,
  })
  expect(result.key).toBe(`images/guides/2026/11/10/${Date.now()}-mi-foto-1.jpg`)
})

test('rejects a missing file, a non-image, and a large file', async () => {
  expect(await uploadPublicImage(null, { keyPrefix: 'x' })).toEqual({
    ok: false,
    status: 400,
    error: 'No se proporciono un archivo',
  })
  expect(await uploadPublicImage('text', { keyPrefix: 'x' })).toMatchObject({ status: 400 })
  expect(
    await uploadPublicImage(imageFile({ type: 'application/pdf' }), { keyPrefix: 'x' })
  ).toEqual({ ok: false, status: 400, error: 'El archivo debe ser una imagen' })
  expect(
    await uploadPublicImage(imageFile({ size: 10 * 1024 * 1024 + 1 }), { keyPrefix: 'x' })
  ).toEqual({ ok: false, status: 400, error: 'El archivo excede el tamano maximo (10MB)' })
  expect(mockPutObject).not.toHaveBeenCalled()
})

test('fails with 500 when the images bucket is not set', async () => {
  delete process.env.S3_IMAGES_BUCKET_NAME
  expect(await uploadPublicImage(imageFile(), { keyPrefix: 'x' })).toEqual({
    ok: false,
    status: 500,
    error: 'S3_IMAGES_BUCKET_NAME no esta configurado',
  })
})

test('writes to the local public folder in stub mode, with no bucket needed', async () => {
  process.env.S3_STUB_DIR = '.local-s3'
  delete process.env.S3_IMAGES_BUCKET_NAME

  const result = await uploadPublicImage(imageFile(), { keyPrefix: 'images/guides' })

  expect(result).toEqual({
    ok: true,
    key: 'images/guides/2026/11/10/mi-foto-1.jpg',
    url: '/local-s3/images/guides/2026/11/10/mi-foto-1.jpg',
  })
  expect(saveStubPublicFile).toHaveBeenCalledWith(
    'images/guides/2026/11/10/mi-foto-1.jpg',
    Buffer.from([1, 2, 3])
  )
  expect(mockPutObject).not.toHaveBeenCalled()
})
