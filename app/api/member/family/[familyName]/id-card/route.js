import { auth } from '../../../../../../auth'
import { getMemberByEmail } from '../../../../../../lib/google-sheets'
import { generateFamilyIdCardPdf } from '../../../../../../lib/id-card/generateFamilyIdCard'
import { nameToPhotoSlug } from '../../../../../../lib/family-members'

/**
 * GET /api/member/family/[familyName]/id-card
 * Member-facing endpoint for their own family member ID card PDF.
 */
export const GET = auth(async function GET(req, { params }) {
  if (!req.auth) {
    return Response.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  const email = req.auth.user?.sacEmail?.toLowerCase() || req.auth.user?.email?.toLowerCase()
  if (!email) {
    return Response.json(
      { error: 'No autenticado', details: 'No email in session' },
      { status: 401 }
    )
  }

  const { familyName: familyNameParam } = await params
  const decodedName = decodeURIComponent(familyNameParam)

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

    if (!member.familyMembers?.includes(decodedName)) {
      return Response.json({ error: 'Familiar no encontrado en la lista' }, { status: 400 })
    }

    if (!member.familyMemberPhotos?.[decodedName]) {
      return Response.json(
        {
          error: 'Foto del familiar requerida',
          details: 'Family member must have a photo to generate an ID card',
        },
        { status: 422 }
      )
    }

    const stream = await generateFamilyIdCardPdf(member, decodedName)
    const slug = nameToPhotoSlug(decodedName) || 'familiar'

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="family-id-${slug}.pdf"`,
      },
    })
  } catch (error) {
    console.error('Member family ID card generation error:', error)
    return Response.json(
      {
        error: 'Error al generar tarjeta de identificacion familiar',
        details: error.message,
      },
      { status: 500 }
    )
  }
})
