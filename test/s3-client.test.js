/**
 * @jest-environment node
 */
import fs from 'fs'
import os from 'os'
import path from 'path'

jest.mock('aws-sdk', () => ({
  S3: jest.fn(function S3(options) {
    this.options = options
  }),
}))

import AWS from 'aws-sdk'
import { createS3Client, isS3Stubbed, saveStubPublicFile } from '../lib/s3-client'

let dir
const env = { ...process.env }

beforeEach(() => {
  jest.clearAllMocks()
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 's3-stub-'))
})

afterEach(() => {
  process.env = { ...env }
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('createS3Client', () => {
  test('returns the real client with the current options when the stub is off', () => {
    delete process.env.S3_STUB_DIR
    process.env.AWS_S3_ENDPOINT = 'https://s3.example.com'
    process.env.AWS_REGION = 'us-east-1'

    const client = createS3Client()

    expect(isS3Stubbed()).toBe(false)
    expect(AWS.S3).toHaveBeenCalledWith({
      endpoint: 'https://s3.example.com',
      s3ForcePathStyle: true,
      region: 'us-east-1',
    })
    expect(client.options.region).toBe('us-east-1')
  })

  test('refuses to run the stub in production', () => {
    process.env.S3_STUB_DIR = dir
    process.env.NODE_ENV = 'production'
    expect(() => createS3Client()).toThrow(/S3_STUB_DIR/)
    expect(isS3Stubbed()).toBe(false)
  })
})

describe('file-system stub', () => {
  beforeEach(() => {
    process.env.S3_STUB_DIR = dir
    process.env.NODE_ENV = 'development'
  })

  test('is active when S3_STUB_DIR is set outside production', () => {
    expect(isS3Stubbed()).toBe(true)
    createS3Client()
    expect(AWS.S3).not.toHaveBeenCalled()
  })

  test('writes, reads, and deletes an object', async () => {
    const s3 = createS3Client()
    await s3.putObject({ Bucket: 'b', Key: 'guides/a.json', Body: '{"x":1}' }).promise()

    expect(fs.readFileSync(path.join(dir, 'b', 'guides', 'a.json'), 'utf8')).toBe('{"x":1}')

    const result = await s3.getObject({ Bucket: 'b', Key: 'guides/a.json' }).promise()
    expect(Buffer.isBuffer(result.Body)).toBe(true)
    expect(result.Body.toString()).toBe('{"x":1}')

    await s3.deleteObject({ Bucket: 'b', Key: 'guides/a.json' }).promise()
    expect(fs.existsSync(path.join(dir, 'b', 'guides', 'a.json'))).toBe(false)
  })

  test('gives NoSuchKey for a missing object', async () => {
    const s3 = createS3Client()
    await expect(s3.getObject({ Bucket: 'b', Key: 'nope.json' }).promise()).rejects.toMatchObject({
      code: 'NoSuchKey',
    })
  })

  test('deleting a missing object is not an error', async () => {
    const s3 = createS3Client()
    await expect(s3.deleteObject({ Bucket: 'b', Key: 'nope.json' }).promise()).resolves.toEqual({})
  })

  test('stores Buffer bodies as they are', async () => {
    const s3 = createS3Client()
    const bytes = Buffer.from([0, 1, 2, 255])
    await s3.putObject({ Bucket: 'b', Key: 'x.bin', Body: bytes }).promise()
    expect(fs.readFileSync(path.join(dir, 'b', 'x.bin'))).toEqual(bytes)
  })

  test('rejects a key that leaves the stub directory', async () => {
    const s3 = createS3Client()
    await expect(
      s3.putObject({ Bucket: 'b', Key: '../../escape.txt', Body: 'x' }).promise()
    ).rejects.toThrow(/outside/)
  })
})

describe('saveStubPublicFile', () => {
  test('writes under public/local-s3 and returns the site path', async () => {
    const publicDir = path.join(dir, 'public')
    const url = await saveStubPublicFile('images/guides/a.jpg', Buffer.from('img'), publicDir)
    expect(url).toBe('/local-s3/images/guides/a.jpg')
    expect(
      fs.readFileSync(path.join(publicDir, 'local-s3', 'images', 'guides', 'a.jpg'), 'utf8')
    ).toBe('img')
  })

  test('rejects a key that leaves the public folder', async () => {
    await expect(saveStubPublicFile('../x.jpg', Buffer.from('x'), dir)).rejects.toThrow(/outside/)
  })
})
