// app/api/admin/members/geocode/route.js
import { auth } from '../../../../../auth'
import { NextResponse } from 'next/server'
import { getMembers } from '../../../../../lib/google-sheets'
import { geocodeMembers } from '../../../../../lib/geocoding'
import { checkPermission } from '../../../../../lib/api-permissions'
import { Actions } from '../../../../../lib/permissions'

/**
 * POST /api/admin/members/geocode
 *
 * Triggers geocoding for members missing lat/lng coordinates.
 * Geocoded results are written back to the spreadsheet.
 * Requires write_members permission.
 */
export const POST = auth(async function POST(req) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  // Permission check — geocoding writes to the spreadsheet
  const permissionError = checkPermission(req, Actions.EDIT_MEMBER)
  if (permissionError) return permissionError

  try {
    // Fetch latest member data (bypass cache to get current geo state)
    const { data: members } = await getMembers(true)

    // Geocode members missing coordinates
    const stats = await geocodeMembers(members)

    return NextResponse.json({
      success: true,
      stats,
    })
  } catch (error) {
    console.error('Error geocoding members:', error)
    return NextResponse.json(
      {
        error: 'Error al geocodificar miembros',
        details: error.message,
      },
      { status: 500 }
    )
  }
})
