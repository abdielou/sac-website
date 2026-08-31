// lib/group-sync.js
//
// Pure diff logic for the Google Groups membership sync (Admin > Grupos).
// Compares the desired group rosters (derived from the members sheet) against
// the live group listings fetched via Apps Script. No I/O here — unit-testable.

export const GROUP_MIEMBROS = 'miembros@sociedadastronomia.com'
export const GROUP_PERSONAL = 'members_personal@sociedadastronomia.com'

// Member statuses (from calculateMembershipStatus) that belong in the groups.
// 'expiring-soon' = Jan–Feb grace period; keep them subscribed while renewing.
export const SYNC_STATUSES = ['active', 'expiring-soon']

const normalizeEmail = (email) =>
  String(email || '')
    .trim()
    .toLowerCase()

/**
 * Canonical form for MATCHING only (display/apply always use the real address).
 * Gmail ignores dots and +suffixes in the local part, and googlemail.com is an
 * alias of gmail.com — so omi.barbosa@gmail.com and omibarbosa@gmail.com are
 * the same person. Without this, such a pair loops forever as a proposed add
 * that Google rejects as "already exists". Other domains are left untouched
 * (dots are significant there, including Workspace domains).
 */
export const canonicalEmail = (email) => {
  const norm = normalizeEmail(email)
  const at = norm.lastIndexOf('@')
  if (at === -1) return norm
  let local = norm.slice(0, at)
  let domain = norm.slice(at + 1)
  if (domain === 'googlemail.com') domain = 'gmail.com'
  if (domain === 'gmail.com') {
    local = local.split('+')[0].replace(/\./g, '')
  }
  return `${local}@${domain}`
}

/**
 * Compute the add/remove diff for both groups.
 *
 * @param {Array<object>} members - Members from getMembers(); uses email, sacEmail, name, status
 * @param {object} currentGroups - { [groupEmail]: [{ email, role, type }] } from Apps Script
 * @returns {{ groups: object, missingSacEmail: Array<{email, name}> }}
 *   groups[groupEmail] = {
 *     toAdd: [{ email, name }],
 *     toRemove: [{ email, reason, role }],  // reason = member status or 'unknown'
 *     protectedOwners: [{ email }],         // OWNERs are never proposed for removal
 *     inSync: [{ email, name, role }],      // already in the group and staying
 *   }
 */
export function computeGroupDiff(members, currentGroups) {
  // Index every member by both of their addresses (canonical form) so removals
  // can be attributed to a member (reason = their status) even across groups.
  const memberByEmail = new Map()
  for (const m of members) {
    const personal = normalizeEmail(m.email)
    const sac = normalizeEmail(m.sacEmail)
    if (personal) memberByEmail.set(canonicalEmail(personal), m)
    if (sac) memberByEmail.set(canonicalEmail(sac), m)
  }

  // Maps keyed by canonical email; values keep the real address for display/apply
  const desiredMiembros = new Map() // canonical -> { email, name }
  const desiredPersonal = new Map() // canonical -> { email, name }
  const missingSacEmail = []

  for (const m of members) {
    if (!SYNC_STATUSES.includes(m.status)) continue
    const sac = normalizeEmail(m.sacEmail)
    const personal = normalizeEmail(m.email)
    if (sac) {
      desiredMiembros.set(canonicalEmail(sac), { email: sac, name: m.name })
    } else {
      missingSacEmail.push({ email: m.email, name: m.name })
    }
    if (personal) desiredPersonal.set(canonicalEmail(personal), { email: personal, name: m.name })
  }

  const diffGroup = (desired, currentList) => {
    const currentByEmail = new Map() // canonical -> { email (real), role }
    for (const gm of currentList || []) {
      const email = normalizeEmail(gm.email)
      if (email) currentByEmail.set(canonicalEmail(email), { email, role: gm.role })
    }

    const toAdd = []
    for (const [key, d] of desired) {
      if (!currentByEmail.has(key)) toAdd.push({ email: d.email, name: d.name })
    }

    const toRemove = []
    const protectedOwners = []
    const inSync = []
    for (const [key, gm] of currentByEmail) {
      if (desired.has(key)) {
        inSync.push({ email: gm.email, name: desired.get(key).name, role: gm.role || 'MEMBER' })
        continue
      }
      // Group OWNERs are never removed by the sync — removing them could lock
      // the group out of administration. Surface them separately instead.
      if (String(gm.role || '').toUpperCase() === 'OWNER') {
        protectedOwners.push({ email: gm.email })
        continue
      }
      const matched = memberByEmail.get(key)
      toRemove.push({
        email: gm.email,
        reason: matched ? matched.status : 'unknown',
        role: gm.role || 'MEMBER',
      })
    }

    return { toAdd, toRemove, protectedOwners, inSync }
  }

  return {
    groups: {
      [GROUP_MIEMBROS]: diffGroup(desiredMiembros, currentGroups?.[GROUP_MIEMBROS]),
      [GROUP_PERSONAL]: diffGroup(desiredPersonal, currentGroups?.[GROUP_PERSONAL]),
    },
    missingSacEmail,
  }
}
