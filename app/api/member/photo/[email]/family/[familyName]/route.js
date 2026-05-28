// app/api/member/photo/[email]/family/[familyName]/route.js
import { auth } from '../../../../../../../auth'
import { NextResponse } from 'next/server'
import { getMemberByEmail } from '../../../../../../../lib/google-sheets'
import { getPhoto } from '../../../../../../../lib/google-drive'
import { hasPermission } from '../../../../../../../lib/permissions'

/**
 * GET /api/member/photo/[email]/family/[familyName]
 * Proxy a family member photo from Google Drive.
 * Requires authentication. Resolves photoFileId from familyMemberPhotos server-side.
 */
export const GET = auth(async function GET(req, { params }) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  try {
    const { email, familyName: familyNameParam } = await params
    const { searchParams } = new URL(req.url)
    const decodedEmail = decodeURIComponent(email).toLowerCase()
    const decodedName = decodeURIComponent(familyNameParam)
    const requestingEmail = req.auth.user?.email?.toLowerCase()
    const requestingSacEmail = req.auth.user?.sacEmail?.toLowerCase()

    const isOwnPhoto =
      requestingEmail === decodedEmail ||
      (requestingSacEmail && requestingSacEmail === decodedEmail)

    if (!isOwnPhoto && !hasPermission(requestingEmail, 'read_members')) {
      return NextResponse.json(
        { error: 'Permiso denegado', details: 'You can only access your own photo' },
        { status: 403 }
      )
    }

    const member = await getMemberByEmail(decodedEmail)
    if (!member) {
      return NextResponse.json({ error: 'Foto no encontrada' }, { status: 404 })
    }

    if (!member.familyMembers?.includes(decodedName)) {
      return NextResponse.json({ error: 'Foto no encontrada' }, { status: 404 })
    }

    const photoFileId = member.familyMemberPhotos?.[decodedName]
    if (!photoFileId) {
      return NextResponse.json({ error: 'Foto no encontrada' }, { status: 404 })
    }

    const requestedId = searchParams.get('photoFileId') || searchParams.get('v')
    if (requestedId && requestedId !== photoFileId) {
      return NextResponse.json({ error: 'Foto no encontrada' }, { status: 404 })
    }

    const photo = await getPhoto(photoFileId)
    if (!photo) {
      return NextResponse.json({ error: 'Foto no encontrada' }, { status: 404 })
    }

    return new Response(photo.buffer, {
      headers: {
        'Content-Type': photo.mimeType,
        'Cache-Control': 'private, max-age=3600',
        'Content-Length': String(photo.buffer.length),
      },
    })
  } catch (error) {
    console.error('Error fetching family member photo:', error)
    return NextResponse.json({ error: 'Error al obtener foto' }, { status: 500 })
  }
})
