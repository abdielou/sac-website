// lib/workspace-email.js

const SAC_DOMAIN = '@sociedadastronomia.com'

/**
 * Sanitize a name part for use in email address.
 * Removes diacritics (a -> a, n -> n), strips non a-z, lowercases.
 * Mirrors appsscript/CreateUser.js sanitizeNamePartForEmail().
 */
export function sanitizeNamePart(text) {
  if (!text) return ''
  const lower = String(text).trim().toLowerCase()
  const noDiacritics = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return noDiacritics.replace(/[^a-z]/g, '')
}

/**
 * Generate workspace email candidates from member name parts.
 * Returns array of full email addresses in priority order.
 * Mirrors appsscript/CreateUser.js generateEmailCandidates().
 *
 * @param {{ firstName: string, initial?: string, lastName: string, slastName?: string }} parts
 * @returns {string[]} Email candidates, e.g. ['juan.rivera@sociedadastronomia.com', ...]
 */
export function generateEmailCandidates({ firstName, initial, lastName, slastName }) {
  const fn = sanitizeNamePart(firstName)
  const ini = sanitizeNamePart(initial).charAt(0)
  const ln = sanitizeNamePart(lastName)
  const sln = sanitizeNamePart(slastName)

  const usernames = []
  if (fn && ln) usernames.push(`${fn}.${ln}`)
  if (fn && ln && sln) usernames.push(`${fn}.${ln}.${sln}`)
  if (fn && ini && ln) usernames.push(`${fn}.${ini}.${ln}`)
  if (fn && ini && ln && sln) usernames.push(`${fn}.${ini}.${ln}.${sln}`)

  return usernames.map((u) => `${u}${SAC_DOMAIN}`)
}
