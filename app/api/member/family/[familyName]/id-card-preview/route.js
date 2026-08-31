import { auth } from '../../../../../../auth'
import { NextResponse } from 'next/server'
import { getMemberByEmail } from '../../../../../../lib/google-sheets'
import { generateVerifyToken } from '../../../../../../lib/id-card/verifyToken'
import { ACTIVE_MEMBER_STATUSES } from '../../../../../../lib/member-access'
import { checkMemberAccess } from '../../../../../../lib/api-permissions'

/**
 * GET /api/member/family/[familyName]/id-card-preview
 * Returns fields needed to render FamilyIdCardPreview for the logged-in member.
 */
export const GET = auth(async function GET(req, { params }) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  const email = req.auth.user?.sacEmail?.toLowerCase() || req.auth.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'No email in session' },
      { status: 401 }
    )
  }

  const accessError = await checkMemberAccess(req)
  if (accessError) return accessError

  try {
    const { familyName: familyNameParam } = await params
    const decodedName = decodeURIComponent(familyNameParam)
    const member = await getMemberByEmail(email)

    if (!member) {
      return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 })
    }

    // Kept alongside the gate above: admins bypass the gate, but nobody gets an
    // ID card that misrepresents an inactive membership.
    if (!ACTIVE_MEMBER_STATUSES.includes(member.status)) {
      return NextResponse.json(
        {
          error: 'Tu membresia no esta vigente para ver la tarjeta de identificacion',
          details: `Current status: ${member.status}`,
        },
        { status: 403 }
      )
    }

    if (!member.familyMembers?.includes(decodedName)) {
      return NextResponse.json({ error: 'Familiar no encontrado en la lista' }, { status: 400 })
    }

    const sheetEmail = member.email || email
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
    console.error('Member family ID card preview data error:', error)
    return NextResponse.json(
      { error: 'Error al cargar vista previa del ID familiar' },
      { status: 500 }
    )
  }
})
