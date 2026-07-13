#!/usr/bin/env node

import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const endpoint = 'https://openrouter.ai/api/v1/key'
const __dirname = dirname(fileURLToPath(import.meta.url))
const outputPath = resolve(__dirname, '..', 'openrouter-usage.json')
const apiKey = process.env.OPENROUTER_API_KEY

if (!apiKey) {
  console.error('Missing OPENROUTER_API_KEY in the environment.')
  process.exit(1)
}

const response = await fetch(endpoint, {
  method: 'GET',
  headers: {
    Authorization: `Bearer ${apiKey}`,
  },
})

const body = await response.json().catch(() => null)

if (!response.ok) {
  const message = body?.error?.message || body?.message || response.statusText
  throw new Error(`OpenRouter key request failed (${response.status}): ${message}`)
}

const keyData = body?.data ?? body ?? {}
const usageSnapshot = {
  fetched_at: new Date().toISOString(),
  usage: keyData.usage ?? null,
  usage_daily: keyData.usage_daily ?? null,
  usage_weekly: keyData.usage_weekly ?? null,
  usage_monthly: keyData.usage_monthly ?? null,
  limit: keyData.limit ?? null,
  limit_remaining: keyData.limit_remaining ?? null,
}

await writeFile(outputPath, `${JSON.stringify(usageSnapshot, null, 2)}\n`, 'utf8')

console.log(`OpenRouter usage saved to ${outputPath}`)
