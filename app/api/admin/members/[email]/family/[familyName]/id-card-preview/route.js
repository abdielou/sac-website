import { auth } from '../../../../../../../../auth'
import { NextResponse } from 'next/server'
import { getMemberByEmail } from '../../../../../../../../lib/google-sheets'
import { checkReadAccess } from '../../../../../../../../lib/api-permissions'
import { generateVerifyToken } from '../../../../../../../../lib/id-card/verifyToken'

/**
 * GET /api/admin/members/[email]/family/[familyName]/id-card-preview
 * Returns fields needed to render FamilyIdCardPreview in the admin dashboard.
 */
export const GET = auth(async function GET(req, { params }) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  const readError = checkReadAccess(req, 'members')
  if (readError) return readError

  try {
    const { email: emailParam, familyName: familyNameParam } = await params
    const decodedEmail = decodeURIComponent(emailParam)
    const decodedName = decodeURIComponent(familyNameParam)
    const member = await getMemberByEmail(decodedEmail)

    if (!member) {
      return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 })
    }

    if (!member.familyMembers?.includes(decodedName)) {
      return NextResponse.json({ error: 'Familiar no encontrado en la lista' }, { status: 400 })
    }

    const sheetEmail = member.email || decodedEmail
    const sacEmail = member.sacEmail || sheetEmail

    return NextResponse.json({
      status: member.status,
      expirationDate: member.expirationDate,
      email: sheetEmail,
      sacEmail,
      verifyToken: generateVerifyToken(sheetEmail),
      familyDisplayName: decodedName,
      familyPhotoFileId: member.familyMemberPhotos?.[decodedName] || null,
    })
  } catch (error) {
    console.error('Family ID card preview data error:', error)
    return NextResponse.json(
      { error: 'Error al cargar vista previa del ID familiar' },
      { status: 500 }
    )
  }
})
