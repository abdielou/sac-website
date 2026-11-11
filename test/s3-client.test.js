/**
 * @jest-environment node
 */
import fs from 'fs'
import os from 'os'
import path from 'path'

jest.mock('@aws-sdk/client-s3', () => require('./helpers/s3-mock').clientS3Mock())

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
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
    expect(S3Client).toHaveBeenCalledWith({
      endpoint: 'https://s3.example.com',
      forcePathStyle: true,
      region: 'us-east-1',
    })
    expect(typeof client.send).toBe('function')
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
    expect(S3Client).not.toHaveBeenCalled()
  })

  test('writes, reads, and deletes an object', async () => {
    const s3 = createS3Client()
    await s3.send(new PutObjectCommand({ Bucket: 'b', Key: 'guides/a.json', Body: '{"x":1}' }))

    expect(fs.readFileSync(path.join(dir, 'b', 'guides', 'a.json'), 'utf8')).toBe('{"x":1}')

    const result = await s3.send(new GetObjectCommand({ Bucket: 'b', Key: 'guides/a.json' }))
    expect(await result.Body.transformToString()).toBe('{"x":1}')

    await s3.send(new DeleteObjectCommand({ Bucket: 'b', Key: 'guides/a.json' }))
    expect(fs.existsSync(path.join(dir, 'b', 'guides', 'a.json'))).toBe(false)
  })

  test('gives NoSuchKey for a missing object', async () => {
    const s3 = createS3Client()
    await expect(
      s3.send(new GetObjectCommand({ Bucket: 'b', Key: 'nope.json' }))
    ).rejects.toMatchObject({ name: 'NoSuchKey' })
  })

  test('deleting a missing object is not an error', async () => {
    const s3 = createS3Client()
    await expect(
      s3.send(new DeleteObjectCommand({ Bucket: 'b', Key: 'nope.json' }))
    ).resolves.toEqual({})
  })

  test('stores Buffer bodies as they are', async () => {
    const s3 = createS3Client()
    const bytes = Buffer.from([0, 1, 2, 255])
    await s3.send(new PutObjectCommand({ Bucket: 'b', Key: 'x.bin', Body: bytes }))
    expect(fs.readFileSync(path.join(dir, 'b', 'x.bin'))).toEqual(bytes)

    const result = await s3.send(new GetObjectCommand({ Bucket: 'b', Key: 'x.bin' }))
    expect(Buffer.from(await result.Body.transformToByteArray())).toEqual(bytes)
  })

  test('rejects a key that leaves the stub directory', async () => {
    const s3 = createS3Client()
    await expect(
      s3.send(new PutObjectCommand({ Bucket: 'b', Key: '../../escape.txt', Body: 'x' }))
    ).rejects.toThrow(/outside/)
  })

  test('rejects a command it does not support', async () => {
    const s3 = createS3Client()
    await expect(s3.send(new ListObjectsV2Command({ Bucket: 'b' }))).rejects.toThrow(
      /does not support/
    )
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
