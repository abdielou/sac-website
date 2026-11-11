/**
 * S3 client and credential resolution shared by the SEO data scripts.
 *
 * Two credential sources, in this order:
 *   --profile <name>  a named profile from ~/.aws/credentials
 *   .env              AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
 *
 * Credentials are ALWAYS passed to the SDK explicitly. Left to its default
 * provider chain, a stale ~/.aws/credentials wins over the values in .env and
 * every request fails with InvalidAccessKeyId, which is confusing to debug.
 */
import fs from 'node:fs'
import path from 'node:path'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts'
import { fromIni } from '@aws-sdk/credential-providers'

/** Parse .env into a plain object. Does not touch process.env. */
export function readEnvFile(cwd = process.cwd()) {
  const envPath = path.resolve(cwd, '.env')
  const env = {}
  if (!fs.existsSync(envPath)) return env
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return env
}

/** The value after `--profile`, or null. */
export function profileFromArgv(argv = process.argv.slice(2)) {
  const i = argv.indexOf('--profile')
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null
}

/**
 * True when ~/.aws/credentials or ~/.aws/config declares the profile.
 * fromIni() only fails on the first request, which hides the real cause.
 */
function profileExists(profile) {
  const home = process.env.HOME || process.env.USERPROFILE || ''
  const files = [path.join(home, '.aws', 'credentials'), path.join(home, '.aws', 'config')]
  const headers = [`[${profile}]`, `[profile ${profile}]`]
  return files.some((file) => {
    if (!fs.existsSync(file)) return false
    const text = fs.readFileSync(file, 'utf8')
    return headers.some((header) => text.includes(header))
  })
}

/**
 * Build an S3 client plus the bucket name and a label describing which
 * credentials were used, so every script can print what it is about to act as.
 */
export function createS3({ argv = process.argv.slice(2), cwd = process.cwd() } = {}) {
  const env = readEnvFile(cwd)
  const bucket = env.S3_ARTICLES_BUCKET_NAME
  if (!bucket) {
    throw new Error('S3_ARTICLES_BUCKET_NAME is not set. Check .env.')
  }

  const region = env.AWS_REGION || 'us-east-1'
  const endpoint = env.AWS_S3_ENDPOINT || undefined
  const profile = profileFromArgv(argv)

  let credentials
  let source
  if (profile) {
    if (!profileExists(profile)) {
      throw new Error(`Profile "${profile}" not found or has no credentials in ~/.aws/credentials`)
    }
    credentials = fromIni({ profile })
    source = `profile ${profile}`
  } else {
    if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
      throw new Error('No --profile given and .env has no AWS credentials.')
    }
    credentials = {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    }
    source = '.env'
  }

  const s3 = new S3Client({ endpoint, forcePathStyle: true, region, credentials })
  return { s3, bucket, region, source, credentials }
}

/** Resolve the IAM identity behind a set of credentials, for the run banner. */
export async function whoAmI({ credentials, region }) {
  try {
    const sts = new STSClient({ credentials, region })
    const id = await sts.send(new GetCallerIdentityCommand({}))
    return id.Arn
  } catch (error) {
    return `unknown (${error.name})`
  }
}

/**
 * Confirm the credentials can actually write to the bucket, by putting and then
 * deleting one throwaway object. Read access does not imply write, and finding
 * out halfway through a batch would leave the corpus half-migrated.
 */
export async function assertWritable(s3, bucket) {
  const key = 'articles/.write-probe.json'
  const body = JSON.stringify({ probe: true })
  try {
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }))
  } catch (error) {
    return { writable: false, reason: `${error.name}: ${error.message}` }
  }
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  } catch (error) {
    return {
      writable: true,
      reason: `wrote but could not delete the probe at ${key} (${error.name}). Remove it manually.`,
    }
  }
  return { writable: true, reason: null }
}
