// lib/gmail-log.js
// Reads Gmail log events from the Admin SDK Reports API. Metadata only:
// the log never includes message bodies. The service account impersonates a
// Workspace admin through domain-wide delegation.

import { JWT } from 'google-auth-library'
import { getCachedData, CACHE_KEYS } from './cache'
import { buildEmailThreads } from './email-threads'

const SCOPE = 'https://www.googleapis.com/auth/admin.reports.audit.readonly'
const API_BASE = 'https://admin.googleapis.com/admin/reports/v1/activity/users'
const PAGE_SIZE = 1000
const WINDOW_DAYS = 30
const THRESHOLD_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

export const MAIL_EVENT = { SENT: 1, RECEIVED: 2, REPLIED: 9 }

export class GmailLogConfigError extends Error {
  constructor(name) {
    super(`Missing environment variable ${name}`)
    this.name = 'GmailLogConfigError'
  }
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) throw new GmailLogConfigError(name)
  return value
}

/**
 * Build the JWT client. `subject` is the admin the service account impersonates.
 */
function createReportsAuth() {
  return new JWT({
    email: requireEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
    key: requireEnv('GOOGLE_PRIVATE_KEY').replace(/\\n/g, '\n'),
    scopes: [SCOPE],
    subject: requireEnv('GOOGLE_REPORTS_ADMIN_EMAIL'),
  })
}

/**
 * Flatten nested Reports API parameters into dotted keys, for example
 * `message_info.subject`.
 */
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

function normalizeActivity(activity) {
  const records = []
  for (const event of activity.events ?? []) {
    const params = flattenParams(event.parameters)
    records.push({
      time: activity.id?.time,
      actor: String(activity.actor?.email ?? '').toLowerCase(),
      messageId: params['message_info.rfc2822_message_id'] ?? '',
      subject: params['message_info.subject'] ?? '',
      destinations: params['message_info.flattened_destinations'] ?? '',
    })
  }
  return records
}

/**
 * Fetch and normalize Gmail log records for one user key and one event type.
 *
 * @param {object} options
 * @param {{ request: Function }} options.auth - JWT client
 * @param {string} options.userKey - `all` or one mailbox address
 * @param {number} options.mailEventType - see MAIL_EVENT
 * @param {string} options.startTime - ISO string
 * @param {string} options.endTime - ISO string
 * @returns {Promise<Array<{ time: string, actor: string, messageId: string, subject: string, destinations: string }>>}
 */
export async function fetchGmailLogRecords({ auth, userKey, mailEventType, startTime, endTime }) {
  const url = new URL(`${API_BASE}/${encodeURIComponent(userKey)}/applications/gmail`)
  url.searchParams.set('filters', `event_info.mail_event_type==${mailEventType}`)
  url.searchParams.set('startTime', startTime)
  url.searchParams.set('endTime', endTime)
  url.searchParams.set('maxResults', String(PAGE_SIZE))

  const records = []
  let pageToken
  do {
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const res = await auth.request({ url: url.toString() })
    for (const activity of res.data?.items ?? []) records.push(...normalizeActivity(activity))
    pageToken = res.data?.nextPageToken
  } while (pageToken)
  return records
}

async function fetchAccountability() {
  const groupAddress = requireEnv('EMAIL_GROUP_ADDRESS').toLowerCase()
  const auth = createReportsAuth()
  const end = new Date()
  const start = new Date(end.getTime() - WINDOW_DAYS * DAY_MS)
  const window = { auth, startTime: start.toISOString(), endTime: end.toISOString() }

  const inbound = await fetchGmailLogRecords({
    ...window,
    userKey: groupAddress,
    mailEventType: MAIL_EVENT.RECEIVED,
  })
  const replied = await fetchGmailLogRecords({
    ...window,
    userKey: 'all',
    mailEventType: MAIL_EVENT.REPLIED,
  })
  const sent = await fetchGmailLogRecords({
    ...window,
    userKey: 'all',
    mailEventType: MAIL_EVENT.SENT,
  })

  return buildEmailThreads({
    inbound,
    replied,
    sent,
    groupAddress,
    now: end,
    thresholdDays: THRESHOLD_DAYS,
    windowDays: WINDOW_DAYS,
  })
}

/**
 * Accountability threads for the group address, cached for the node-cache TTL.
 * @param {boolean} forceRefresh
 * @returns {Promise<{ data: object, fromCache: boolean }>}
 */
export async function getEmailAccountability(forceRefresh = false) {
  return getCachedData(CACHE_KEYS.EMAILS, fetchAccountability, forceRefresh)
}
