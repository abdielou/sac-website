import { createHmac } from 'crypto'

/**
 * Generate a deterministic, opaque verification token from a member email.
 * Uses HMAC-SHA256 with AUTH_SECRET, truncated to 16 hex chars for URL-friendliness.
 *
 * @param {string} email - Member email (lowercased)
 * @returns {string} 16-char hex token
 */
export function generateVerifyToken(email) {
  const secret = process.env.VERIFY_TOKEN_SECRET
  if (!secret) throw new Error('VERIFY_TOKEN_SECRET not configured')
  const hmac = createHmac('sha256', secret)
  hmac.update(email.toLowerCase().trim())
  return hmac.digest('hex').slice(0, 16)
}
