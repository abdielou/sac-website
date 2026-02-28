import { auth } from '../../../../../auth'
import { getMembers } from '../../../../../lib/google-sheets'
import { generateBulkIdCardsPdf } from '../../../../../lib/id-card/generateBulkIdCards'

export const maxDuration = 60

/**
 * GET /api/admin/members/bulk-id-cards
 *
 * Admin-only endpoint that generates a multi-page PDF with ID cards
 * for all active members who have uploaded photos.
 * Returns a PDF binary stream with download headers.
 */
export const GET = auth(async function GET(req) {
  if (!req.auth) {
    return Response.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  if (!req.auth.user?.isAdmin) {
    return Response.json(
      { error: 'Acceso denegado', details: 'Admin access required' },
      { status: 403 }
    )
  }

  try {
    const members = await getMembers()

    // Filter to active members with photos
    const eligible = members.filter((m) => m.status === 'active' && m.photoFileId)

    if (eligible.length === 0) {
      return Response.json(
        {
          error: 'No hay miembros elegibles',
          details: 'No active members with photos found',
        },
        { status: 404 }
      )
    }

    const stream = await generateBulkIdCardsPdf(eligible)
    const dateStr = new Date().toISOString().slice(0, 10)

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="sac-carnets-${dateStr}.pdf"`,
      },
    })
  } catch (error) {
    console.error('Bulk ID card generation error:', error)
    return Response.json(
      {
        error: 'Error al generar carnets',
        details: error.message,
      },
      { status: 500 }
    )
  }
})
