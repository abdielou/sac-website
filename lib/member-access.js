// lib/member-access.js
import { getMemberByEmail } from './google-sheets'

/**
 * Membership statuses entitled to full member-portal access.
 *
 * 'expiring-soon' is the Jan-Feb grace period computed by
 * calculateMembershipStatus() in lib/google-sheets.js — members mid-renewal
 * keep access rather than being locked out at the worst possible moment.
 */
export const ACTIVE_MEMBER_STATUSES = ['active', 'expiring-soon']

/** Why access was granted or denied. Drives the copy on MembershipInactiveNotice. */
export const ACCESS_REASONS = {
  OK: 'ok',
  ADMIN: 'admin',
  INACTIVE: 'inactive',
  NOT_FOUND: 'not-found',
  LOOKUP_FAILED: 'lookup-failed',
}

/**
 * Resolve whether a session may use the member portal.
 *
 * Fails closed: anything short of a confirmed entitled status denies access,
 * including a missing sheet row and a failed lookup. The two are reported
 * separately so the UI can tell a lapsed membership apart from an outage.
 *
 * Admins are exempt and are checked BEFORE the sheet lookup, so a Sheets
 * outage can never lock an admin out of the portal.
 *
 * @param {Object|null} session - Auth.js session (or `req.auth` inside route handlers)
 * @returns {Promise<{allowed: boolean, reason: string, status: string|null}>}
 */
export async function resolveMemberAccess(session) {
  if (session?.user?.isAdmin) {
    return { allowed: true, reason: ACCESS_REASONS.ADMIN, status: null }
  }

  // Mirrors app/api/member/profile/route.js: members registered under a personal
  // email in the sheet still carry their SAC email in the JWT.
  const email = session?.user?.sacEmail?.toLowerCase() || session?.user?.email?.toLowerCase()
  if (!email) {
    return { allowed: false, reason: ACCESS_REASONS.NOT_FOUND, status: null }
  }

  try {
    const member = await getMemberByEmail(email)

    if (!member) {
      return { allowed: false, reason: ACCESS_REASONS.NOT_FOUND, status: null }
    }

    if (!ACTIVE_MEMBER_STATUSES.includes(member.status)) {
      return { allowed: false, reason: ACCESS_REASONS.INACTIVE, status: member.status }
    }

    return { allowed: true, reason: ACCESS_REASONS.OK, status: member.status }
  } catch (error) {
    console.error('Member access lookup failed:', error)
    return { allowed: false, reason: ACCESS_REASONS.LOOKUP_FAILED, status: null }
  }
}
