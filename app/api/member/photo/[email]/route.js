// app/api/member/photo/[email]/route.js
import { auth } from '../../../../../auth'
import { NextResponse } from 'next/server'
import { getMemberByEmail } from '../../../../../lib/google-sheets'
import { getPhoto } from '../../../../../lib/google-drive'
import { hasPermission } from '../../../../../lib/permissions'

/**
 * GET /api/member/photo/[email]
 * Proxy a member's profile photo from Google Drive.
 * Requires authentication. Does NOT expose Drive file IDs or URLs to the client.
 * Users can only access their own photo unless they have read_members permission.
 *
 * Query params:
 *   - photoFileId (optional): pass directly to skip sheet lookup when accessing own photo
 */
export const GET = auth(async function GET(req, { params }) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  try {
    const { email } = await params
    const { searchParams } = new URL(req.url)
    const decodedEmail = decodeURIComponent(email)
    const requestingEmail = req.auth.user?.email?.toLowerCase()

    // Authorization: users can only access their own photo unless they have read_members
    if (
      requestingEmail !== decodedEmail.toLowerCase() &&
      !hasPermission(requestingEmail, 'read_members')
    ) {
      return NextResponse.json(
        { error: 'Permiso denegado', details: 'You can only access your own photo' },
        { status: 403 }
      )
    }

    let photoFileId = searchParams.get('photoFileId')

    // Own photo: use passed photoFileId directly (avoids sheet lookup failures)
    // Admins with read_members: also use passed photoFileId
    if (!photoFileId) {
      const member = await getMemberByEmail(decodedEmail)
      if (!member || !member.photoFileId) {
        return NextResponse.json({ error: 'Foto no encontrada' }, { status: 404 })
      }
      photoFileId = member.photoFileId
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
    console.error('Error fetching member photo:', error)
    return NextResponse.json(
      { error: 'Error al obtener foto', details: error.message },
      { status: 500 }
    )
  }
})
