import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import fs from 'fs/promises'
import path from 'path'

/**
 * S3 client factory with a file-system stub for local development.
 *
 * There is no S3 dev environment, only prod. When `S3_STUB_DIR` is set and the
 * app does not run in production, `createS3Client()` returns a stub that keeps
 * each object as a file at `<S3_STUB_DIR>/<Bucket>/<Key>`. The stub has the
 * v3 `send(command)` entry point and covers only the commands that its callers
 * use: PutObjectCommand, GetObjectCommand, DeleteObjectCommand.
 */

/** Site path under which stubbed public images are served from `public/`. */
export const STUB_PUBLIC_PREFIX = '/local-s3/'

/** True when the file-system stub is active. Never true in production. */
export function isS3Stubbed() {
  return Boolean(process.env.S3_STUB_DIR) && process.env.NODE_ENV !== 'production'
}

/** Resolve `key` under `root`. Throws if the result leaves `root`. */
function resolveInside(root, ...segments) {
  const target = path.resolve(root, ...segments)
  const relative = path.relative(root, target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`S3 stub key is outside the stub directory: ${segments.join('/')}`)
  }
  return target
}

/** A GetObject body with the v3 stream helpers that the callers use. */
function asBody(buffer) {
  return {
    transformToString: async (encoding = 'utf-8') => buffer.toString(encoding),
    transformToByteArray: async () => new Uint8Array(buffer),
  }
}

function createFileS3Stub(rootDir) {
  const root = path.resolve(rootDir)

  async function putObject({ Bucket, Key, Body }) {
    const file = resolveInside(root, Bucket, Key)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, Body)
    return {}
  }

  async function getObject({ Bucket, Key }) {
    const file = resolveInside(root, Bucket, Key)
    try {
      return { Body: asBody(await fs.readFile(file)) }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      const missing = new Error(`The specified key does not exist: ${Key}`)
      missing.name = 'NoSuchKey'
      missing.$metadata = { httpStatusCode: 404 }
      throw missing
    }
  }

  async function deleteObject({ Bucket, Key }) {
    await fs.rm(resolveInside(root, Bucket, Key), { force: true })
    return {}
  }

  return {
    async send(command) {
      if (command instanceof PutObjectCommand) return putObject(command.input)
      if (command instanceof GetObjectCommand) return getObject(command.input)
      if (command instanceof DeleteObjectCommand) return deleteObject(command.input)
      throw new Error(`The S3 stub does not support ${command?.constructor?.name}`)
    },
  }
}

/**
 * Create an S3 client: the real one, or the file-system stub when
 * `S3_STUB_DIR` is set.
 */
export function createS3Client() {
  if (process.env.S3_STUB_DIR) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('S3_STUB_DIR is set in production. Remove it to use the real S3.')
    }
    return createFileS3Stub(process.env.S3_STUB_DIR)
  }

  return new S3Client({
    endpoint: process.env.AWS_S3_ENDPOINT,
    forcePathStyle: true,
    region: process.env.AWS_REGION,
  })
}

/**
 * Stub mode only: write a public file to `public/local-s3/<key>`, which Next
 * serves as a static file, and return its site path.
 *
 * @param {string} key - Object key, for example `images/guides/2026/11/10/a.jpg`
 * @param {Buffer} body
 * @param {string} [publicDir] - The Next `public/` folder
 * @returns {Promise<string>} Site path, for example `/local-s3/images/guides/...`
 */
export async function saveStubPublicFile(
  key,
  body,
  publicDir = path.join(process.cwd(), 'public')
) {
  const root = path.resolve(publicDir, 'local-s3')
  const file = resolveInside(root, key)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, body)
  return `${STUB_PUBLIC_PREFIX}${key}`
}
