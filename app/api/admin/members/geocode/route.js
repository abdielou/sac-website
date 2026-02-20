// app/api/admin/members/geocode/route.js
import { auth } from '../../../../../auth'
import { NextResponse } from 'next/server'
import { getMembers } from '../../../../../lib/google-sheets'
import { geocodeMembers } from '../../../../../lib/geocoding'

/**
 * POST /api/admin/members/geocode
 *
 * Triggers geocoding for members missing lat/lng coordinates.
 * Geocoded results are written back to the spreadsheet.
 */
export const POST = auth(async function POST(req) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

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
