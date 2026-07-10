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
  // Index every member by both of their addresses so removals can be
  // attributed to a member (reason = their status) even across groups.
  const memberByEmail = new Map()
  for (const m of members) {
    const personal = normalizeEmail(m.email)
    const sac = normalizeEmail(m.sacEmail)
    if (personal) memberByEmail.set(personal, m)
    if (sac) memberByEmail.set(sac, m)
  }

  const desiredMiembros = new Map() // sac email -> member
  const desiredPersonal = new Map() // personal email -> member
  const missingSacEmail = []

  for (const m of members) {
    if (!SYNC_STATUSES.includes(m.status)) continue
    const sac = normalizeEmail(m.sacEmail)
    const personal = normalizeEmail(m.email)
    if (sac) {
      desiredMiembros.set(sac, m)
    } else {
      missingSacEmail.push({ email: m.email, name: m.name })
    }
    if (personal) desiredPersonal.set(personal, m)
  }

  const diffGroup = (desired, currentList) => {
    const currentByEmail = new Map()
    for (const gm of currentList || []) {
      const email = normalizeEmail(gm.email)
      if (email) currentByEmail.set(email, gm)
    }

    const toAdd = []
    for (const [email, m] of desired) {
      if (!currentByEmail.has(email)) toAdd.push({ email, name: m.name })
    }

    const toRemove = []
    const protectedOwners = []
    const inSync = []
    for (const [email, gm] of currentByEmail) {
      if (desired.has(email)) {
        inSync.push({ email, name: desired.get(email).name, role: gm.role || 'MEMBER' })
        continue
      }
      // Group OWNERs are never removed by the sync — removing them could lock
      // the group out of administration. Surface them separately instead.
      if (String(gm.role || '').toUpperCase() === 'OWNER') {
        protectedOwners.push({ email })
        continue
      }
      const matched = memberByEmail.get(email)
      toRemove.push({
        email,
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
