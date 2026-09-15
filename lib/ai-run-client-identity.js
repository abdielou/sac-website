import { createHash } from 'node:crypto'

/** Build a stable browser-storage namespace without exposing account identifiers. */
export function buildAiClientStorageUserKey(user) {
  const identity = String(user?.id || user?.email || '')
    .trim()
    .toLowerCase()
  if (!identity) throw new Error('No se pudo identificar la cuenta para recuperar ejecuciones AI.')
  return createHash('sha256').update(identity).digest('hex')
}
