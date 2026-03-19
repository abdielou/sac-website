// app/api/admin/debug-sheets/route.js
// TEMPORARY DEBUG ENDPOINT - remove after investigation
import { auth } from '../../../../auth'
import { NextResponse } from 'next/server'
import { getMembers } from '../../../../lib/google-sheets'
import { invalidateCache } from '../../../../lib/cache'

export const GET = auth(async function GET(req) {
  if (!req.auth) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    // Force-clear cache on this instance and fetch fresh data
    invalidateCache()
    const { data: members, fromCache } = await getMembers(true)

    const tiffany = members.find(
      (m) => m.email?.includes('tiffany') || m.name?.toLowerCase().includes('tiffany')
    )

    return NextResponse.json({
      totalMembers: members.length,
      fromCache,
      tiffanyFound: !!tiffany,
      tiffany: tiffany || null,
      // Sample: first and last 2 members to verify ordering
      first2: members.slice(0, 2).map((m) => ({ email: m.email, name: m.name, status: m.status })),
      last2: members.slice(-2).map((m) => ({ email: m.email, name: m.name, status: m.status })),
    })
  } catch (err) {
    return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 })
  }
})
