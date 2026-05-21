import { auth } from '../../../../../../auth'
import { NextResponse } from 'next/server'
import { getMemberByEmail } from '../../../../../../lib/google-sheets'
import { checkReadAccess } from '../../../../../../lib/api-permissions'
import { generateVerifyToken } from '../../../../../../lib/id-card/verifyToken'

/**
 * GET /api/admin/members/[email]/id-card-preview
 * Returns member fields needed to render IdCardPreview in the admin dashboard.
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
    const { email: emailParam } = await params
    const decodedEmail = decodeURIComponent(emailParam)
    const member = await getMemberByEmail(decodedEmail)

    if (!member) {
      return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 })
    }

    const sheetEmail = member.email || decodedEmail
    const sacEmail = member.sacEmail || sheetEmail

    return NextResponse.json({
      status: member.status,
      expirationDate: member.expirationDate,
      photoFileId: member.photoFileId,
      firstName: member.firstName,
      lastName: member.lastName,
      slastName: member.slastName,
      middleName: member.initial,
      name: member.name,
      sacEmail,
      verifyToken: generateVerifyToken(sheetEmail),
    })
  } catch (error) {
    console.error('ID card preview data error:', error)
    return NextResponse.json({ error: 'Error al cargar vista previa del ID' }, { status: 500 })
  }
})
