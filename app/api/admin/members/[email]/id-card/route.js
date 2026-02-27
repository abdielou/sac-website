import { auth } from '../../../../../../auth'
import { getMemberByEmail } from '../../../../../../lib/google-sheets'
import { generateIdCardPdf } from '../../../../../../lib/id-card/generateIdCard'

/**
 * GET /api/admin/members/[email]/id-card
 *
 * Admin-only endpoint that generates and returns a PDF ID card for a member.
 * Returns a PDF binary stream with appropriate Content-Type headers.
 */
export const GET = auth(async function GET(req, { params }) {
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

  const { email } = await params
  const decodedEmail = decodeURIComponent(email)

  try {
    const member = await getMemberByEmail(decodedEmail)

    if (!member) {
      return Response.json(
        { error: 'Miembro no encontrado', details: `No member found for: ${decodedEmail}` },
        { status: 404 }
      )
    }

    const stream = await generateIdCardPdf(member)

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="id-card-${decodedEmail}.pdf"`,
      },
    })
  } catch (error) {
    console.error('ID card generation error:', error)
    return Response.json(
      {
        error: 'Error al generar tarjeta de identificacion',
        details: error.message,
      },
      { status: 500 }
    )
  }
})
