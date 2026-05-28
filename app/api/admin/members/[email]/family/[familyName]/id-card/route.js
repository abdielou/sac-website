import { auth } from '../../../../../../../../auth'
import { getMemberByEmail } from '../../../../../../../../lib/google-sheets'
import { generateFamilyIdCardPdf } from '../../../../../../../../lib/id-card/generateFamilyIdCard'
import { nameToPhotoSlug } from '../../../../../../../../lib/family-members'
import { checkReadAccess } from '../../../../../../../../lib/api-permissions'

/**
 * GET /api/admin/members/[email]/family/[familyName]/id-card
 * Admin-only endpoint that generates a PDF Family Member ID card.
 */
export const GET = auth(async function GET(req, { params }) {
  if (!req.auth) {
    return Response.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  const readError = checkReadAccess(req, 'members')
  if (readError) return readError

  const { email, familyName: familyNameParam } = await params
  const decodedEmail = decodeURIComponent(email)
  const decodedName = decodeURIComponent(familyNameParam)

  try {
    const member = await getMemberByEmail(decodedEmail)

    if (!member) {
      return Response.json({ error: 'Miembro no encontrado' }, { status: 404 })
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
    console.error('Family ID card generation error:', error)
    return Response.json(
      { error: 'Error al generar tarjeta de identificacion familiar' },
      { status: 500 }
    )
  }
})
