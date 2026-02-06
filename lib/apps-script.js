// lib/apps-script.js
import { JWT } from 'google-auth-library'

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_WEB_APP_URL
const APPS_SCRIPT_SECRET = process.env.APPS_SCRIPT_SECRET

/**
 * Create a JWT client for the service account with drive.readonly scope.
 * This allows calling org-restricted Apps Script web apps.
 */
function createAppsScriptAuth() {
  return new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })
}

/**
 * Get a fresh access token from the service account.
 * google-auth-library handles token caching/refresh internally.
 */
async function getAccessToken() {
  const auth = createAppsScriptAuth()
  const { token } = await auth.getAccessToken()
  return token
}

/**
 * Call the Apps Script web app with an action and optional data.
 *
 * Auth: Service account Bearer token (org restriction) + shared secret (app-level).
 * Uses redirect: 'follow' because Apps Script returns 302 (POST->GET is correct).
 * Uses Content-Type: text/plain (not application/json) for Apps Script compatibility.
 * Apps Script always returns HTTP 200; success/error is in the JSON body.
 * Default 6-minute timeout matches Apps Script execution limit.
 *
 * @param {string} action - 'scan' or 'manual_payment'
 * @param {object} [data={}] - Action-specific payload
 * @param {object} [options={}] - Optional settings
 * @param {number} [options.timeout=360000] - Timeout in ms (default 6 minutes)
 * @returns {Promise<object>} Parsed JSON response from Apps Script
 * @throws {Error} On network error, timeout, or non-JSON response
 */
export async function callAppsScript(action, data = {}, options = {}) {
  if (!APPS_SCRIPT_URL) {
    throw new Error('APPS_SCRIPT_WEB_APP_URL is not configured')
  }
  if (!APPS_SCRIPT_SECRET) {
    throw new Error('APPS_SCRIPT_SECRET is not configured')
  }

  const accessToken = await getAccessToken()

  const timeout = options.timeout || 360000 // 6 minutes
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ secret: APPS_SCRIPT_SECRET, action, data }),
      signal: controller.signal,
    })

    const text = await response.text()
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(`Apps Script returned non-JSON response: ${text.slice(0, 200)}`)
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
