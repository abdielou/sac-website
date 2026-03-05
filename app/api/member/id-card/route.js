import { auth } from '../../../../auth'
import { getMemberByEmail } from '../../../../lib/google-sheets'
import { generateIdCardPdf } from '../../../../lib/id-card/generateIdCard'

/**
 * GET /api/member/id-card
 *
 * Member-facing endpoint that generates and returns their own PDF ID card.
 * Email is taken from the authenticated session (scope guard).
 * Only active or expiring-soon members can download their card.
 */
export const GET = auth(async function GET(req) {
  if (!req.auth) {
    return Response.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  const email = req.auth.user.email?.toLowerCase()
  if (!email) {
    return Response.json(
      { error: 'No autenticado', details: 'No email in session' },
      { status: 401 }
    )
  }

  try {
    const member = await getMemberByEmail(email)

    if (!member) {
      return Response.json(
        { error: 'Miembro no encontrado', details: `No member found for: ${email}` },
        { status: 404 }
      )
    }

    if (member.status !== 'active' && member.status !== 'expiring-soon') {
      return Response.json(
        {
          error: 'Tu membresia no esta vigente para generar tarjeta de identificacion',
          details: `Current status: ${member.status}`,
        },
        { status: 403 }
      )
    }

    const stream = await generateIdCardPdf(member)

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="id-card-${email}.pdf"`,
      },
    })
  } catch (error) {
    console.error('Member ID card generation error:', error)
    return Response.json(
      {
        error: 'Error al generar tarjeta de identificacion',
        details: error.message,
      },
      { status: 500 }
    )
  }
})
