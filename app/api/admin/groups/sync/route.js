// app/api/admin/groups/sync/route.js
import { auth } from '../../../../../auth'
import { NextResponse } from 'next/server'
import { getMembers } from '../../../../../lib/google-sheets'
import { callAppsScript } from '../../../../../lib/apps-script'
import { checkPermission } from '../../../../../lib/api-permissions'
import { Actions } from '../../../../../lib/permissions'
import { computeGroupDiff, GROUP_MIEMBROS, GROUP_PERSONAL } from '../../../../../lib/group-sync'

/**
 * GET /api/admin/groups/sync — preview
 *
 * Compares active members (status active/expiring-soon) against the live
 * Google Groups and returns the proposed add/remove diff. Does not change
 * anything.
 *
 * Query params:
 * - refresh: 'true' to bypass the members cache
 */
export const GET = auth(async function GET(req) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  const permissionError = checkPermission(req, Actions.SYNC_GROUPS)
  if (permissionError) return permissionError

  try {
    const { searchParams } = new URL(req.url)
    const forceRefresh = searchParams.get('refresh') === 'true'

    const { data: members } = await getMembers(forceRefresh)

    const listResult = await callAppsScript(null, 'list_group_members', {
      groups: [GROUP_MIEMBROS, GROUP_PERSONAL],
    })
    if (!listResult.success) {
      return NextResponse.json(
        {
          error: 'Error al obtener los miembros de los grupos',
          details: listResult.error || 'Apps Script list_group_members failed',
        },
        { status: 502 }
      )
    }

    const diff = computeGroupDiff(members, listResult.groups || {})
    return NextResponse.json({ success: true, ...diff })
  } catch (error) {
    console.error('Error building group sync preview:', error)
    return NextResponse.json(
      { error: 'Error al comparar los grupos', details: error.message },
      { status: 500 }
    )
  }
})

/**
 * POST /api/admin/groups/sync — apply
 *
 * Applies the admin-confirmed add/remove lists. Body:
 *   { groups: { [groupEmail]: { add: [emails], remove: [emails] } } }
 * Only the two known groups are accepted. Non-transactional by design:
 * per-email results are returned and re-applying is idempotent.
 */
export const POST = auth(async function POST(req) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  const permissionError = checkPermission(req, Actions.SYNC_GROUPS)
  if (permissionError) return permissionError

  try {
    const body = await req.json()
    const requestedGroups = body?.groups || {}
    const allowedGroups = [GROUP_MIEMBROS, GROUP_PERSONAL]
    const groupEmails = Object.keys(requestedGroups).filter((g) => allowedGroups.includes(g))

    if (groupEmails.length === 0) {
      return NextResponse.json(
        { error: 'Solicitud inválida', details: 'No valid groups in request body' },
        { status: 400 }
      )
    }

    const results = {}
    for (const group of groupEmails) {
      const add = Array.isArray(requestedGroups[group].add) ? requestedGroups[group].add : []
      const remove = Array.isArray(requestedGroups[group].remove)
        ? requestedGroups[group].remove
        : []

      if (add.length === 0 && remove.length === 0) {
        results[group] = { added: [], removed: [], skipped: [], failed: [] }
        continue
      }

      const result = await callAppsScript(null, 'update_group_members', { group, add, remove })
      if (!result.success) {
        // Whole-group failure (e.g. bad group email): report every requested op as failed
        const error = result.error || 'update_group_members failed'
        results[group] = {
          added: [],
          removed: [],
          skipped: [],
          failed: [
            ...add.map((email) => ({ email, op: 'add', error })),
            ...remove.map((email) => ({ email, op: 'remove', error })),
          ],
        }
      } else {
        results[group] = {
          added: result.added || [],
          removed: result.removed || [],
          skipped: result.skipped || [],
          failed: result.failed || [],
          resolved: result.resolved || [],
        }
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error('Error applying group sync:', error)
    return NextResponse.json(
      { error: 'Error al aplicar los cambios', details: error.message },
      { status: 500 }
    )
  }
})
