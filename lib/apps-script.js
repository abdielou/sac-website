// lib/apps-script.js

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_WEB_APP_URL
const APPS_SCRIPT_SECRET = process.env.APPS_SCRIPT_SECRET

/**
 * Call the Apps Script web app with an action and optional data.
 *
 * Auth: Shared secret in POST body (app-level verification). Apps Script must be
 *       deployed as "Anyone" (not "Anyone within org"). No user OAuth token needed.
 * Uses Content-Type: text/plain (not application/json) for Apps Script compatibility.
 * Apps Script always returns HTTP 200; success/error is in the JSON body.
 * Default 6-minute timeout matches Apps Script execution limit.
 *
 * @param {string|null} accessToken - OAuth access token from the logged-in user's session (null if Apps Script deployed as "Anyone")
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

  const timeout = options.timeout || 360000 // 6 minutes
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  const bodyPayload = JSON.stringify({ secret: APPS_SCRIPT_SECRET, action, data })

  const headers = { 'Content-Type': 'text/plain;charset=utf-8' }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      headers,
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

/**
 * Notify admins that a member uploaded or updated their profile photo.
 *
 * Best-effort: callers should not let a failure here break the photo save.
 * Sends a short admin-only email via Apps Script (no user OAuth token needed,
 * matching the 'scan' action). Uses a short timeout — this is a quick email send,
 * not a long-running scan.
 *
 * @param {string} memberName - Display name of the member
 * @param {boolean} isFirstUpload - true if this is the member's first photo, false on update
 * @returns {Promise<object>} Parsed JSON response from Apps Script
 */
export async function notifyPhotoUpload(memberName, isFirstUpload) {
  return callAppsScript(
    null,
    'notify_photo_upload',
    { memberName, isFirstUpload: isFirstUpload === true },
    { timeout: 30000 }
  )
}
