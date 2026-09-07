// Probe: can the production service account read Gmail log events
// through the Admin SDK Reports API?
//
// Usage:
//   node --env-file=.env scripts/probe-gmail-log.mjs [admin@sociedadastronomia.com]
//
// Without an argument the script calls the API as the bare service account.
// With an argument it impersonates that admin (domain-wide delegation).
// The script prints counts and a short sample. It never prints credentials.

import { JWT } from 'google-auth-library'

const SCOPE = 'https://www.googleapis.com/auth/admin.reports.audit.readonly'
const DAYS = Number(process.env.PROBE_DAYS ?? 7)
const MAX_RECORDS = Number(process.env.PROBE_MAX ?? 5000)
const subject = process.argv[2]

function buildAuth() {
  return new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: [SCOPE],
    subject: subject || undefined,
  })
}

// Flatten nested parameters into dotted keys, for example
// message_info.source.address. Repeated groups get an index.
function flattenParams(parameters = [], prefix = '', out = {}) {
  for (const p of parameters) {
    const key = prefix ? `${prefix}.${p.name}` : p.name
    if (p.messageValue) {
      flattenParams(p.messageValue.parameter, key, out)
    } else if (p.multiMessageValue) {
      p.multiMessageValue.forEach((m, i) => flattenParams(m.parameter, `${key}[${i}]`, out))
    } else {
      out[key] = p.value ?? p.intValue ?? p.boolValue ?? p.multiValue ?? p.multiIntValue
    }
  }
  return out
}

async function main() {
  console.log(`service account: ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ? 'set' : 'MISSING'}`)
  console.log(`private key:     ${process.env.GOOGLE_PRIVATE_KEY ? 'set' : 'MISSING'}`)
  console.log(`impersonate:     ${subject || '(none)'}`)

  const auth = buildAuth()
  const end = new Date()
  const start = new Date(end.getTime() - DAYS * 24 * 60 * 60 * 1000)
  const userKey = process.env.PROBE_USER ?? 'all'
  const url = new URL(`https://admin.googleapis.com/admin/reports/v1/activity/users/${encodeURIComponent(userKey)}/applications/gmail`)
  if (process.env.PROBE_FILTERS) url.searchParams.set('filters', process.env.PROBE_FILTERS)
  url.searchParams.set('startTime', start.toISOString())
  url.searchParams.set('endTime', end.toISOString())
  url.searchParams.set('maxResults', process.env.PROBE_PAGE ?? '1000')

  const items = []
  let pageToken
  try {
    do {
      if (pageToken) url.searchParams.set('pageToken', pageToken)
      const res = await auth.request({ url: url.toString() })
      items.push(...(res.data.items ?? []))
      pageToken = res.data.nextPageToken
    } while (pageToken && items.length < MAX_RECORDS)
  } catch (err) {
    const data = err.response?.data
    console.log(`\nRESULT: request failed (${err.response?.status ?? err.code ?? 'no status'})`)
    console.log(JSON.stringify(data ?? err.message, null, 2))
    return
  }

  console.log(`\nRESULT: ok, ${items.length} activity records in the last ${DAYS} days`)

  const dumpPath = process.env.PROBE_DUMP
  if (dumpPath) {
    const { writeFileSync } = await import('node:fs')
    writeFileSync(dumpPath, JSON.stringify(items, null, 2))
    console.log(`raw records written to ${dumpPath}`)
  }

  const paramNames = new Set()
  const eventTypes = {}
  for (const it of items) {
    for (const ev of it.events ?? []) {
      const p = flattenParams(ev.parameters)
      Object.keys(p).forEach((k) => paramNames.add(k))
      const t = p['message_info.action_type'] ?? p['event_info.mail_event_type'] ?? ev.name
      eventTypes[t] = (eventTypes[t] ?? 0) + 1
    }
  }
  const names = [...paramNames].map((n) => n.replace(/\[\d+\]/g, '[]'))
  console.log('parameter names seen:', [...new Set(names)].sort())
  console.log('action_type histogram:', eventTypes)

  console.log('\nnewest 3 records (values truncated):')
  for (const it of items.slice(0, 3)) {
    for (const ev of it.events ?? []) {
      const p = flattenParams(ev.parameters)
      const summary = {}
      for (const [k, v] of Object.entries(p)) {
        summary[k] = typeof v === 'string' && v.length > 60 ? v.slice(0, 60) + '…' : v
      }
      console.log(JSON.stringify({ time: it.id?.time, actor: it.actor?.email, event: ev.name, params: summary }))
    }
  }
}

main().catch((e) => {
  console.error('unexpected error:', e.message)
  process.exit(1)
})
