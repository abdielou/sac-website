// lib/apps-script.js

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_WEB_APP_URL
const APPS_SCRIPT_SECRET = process.env.APPS_SCRIPT_SECRET

/**
 * Call the Apps Script web app with an action and optional data.
 *
 * Auth: User's OAuth Bearer token (org member → passes "Anyone within org")
 *       + shared secret in POST body (app-level verification).
 * Uses Content-Type: text/plain (not application/json) for Apps Script compatibility.
 * Apps Script always returns HTTP 200; success/error is in the JSON body.
 * Default 6-minute timeout matches Apps Script execution limit.
 *
 * @param {string} accessToken - OAuth access token from the logged-in user's session
 * @param {string} action - 'scan' or 'manual_payment'
 * @param {object} [data={}] - Action-specific payload
 * @param {object} [options={}] - Optional settings
 * @param {number} [options.timeout=360000] - Timeout in ms (default 6 minutes)
 * @returns {Promise<object>} Parsed JSON response from Apps Script
 * @throws {Error} On network error, timeout, or non-JSON response
 */
export async function callAppsScript(accessToken, action, data = {}, options = {}) {
  if (!APPS_SCRIPT_URL) {
    throw new Error('APPS_SCRIPT_WEB_APP_URL is not configured')
  }
  if (!APPS_SCRIPT_SECRET) {
    throw new Error('APPS_SCRIPT_SECRET is not configured')
  }
  if (!accessToken) {
    throw new Error('No access token provided')
  }

  const timeout = options.timeout || 360000 // 6 minutes
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  const bodyPayload = JSON.stringify({ secret: APPS_SCRIPT_SECRET, action, data })

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
        Authorization: `Bearer ${accessToken}`,
      },
      body: bodyPayload,
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
