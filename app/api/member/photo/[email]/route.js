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
 * photoFileId is always resolved from the member record (query params are cache-busters only).
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
    const decodedEmail = decodeURIComponent(email).toLowerCase()
    const requestingEmail = req.auth.user?.email?.toLowerCase()
    const requestingSacEmail = req.auth.user?.sacEmail?.toLowerCase()

    const isOwnPhoto =
      requestingEmail === decodedEmail ||
      (requestingSacEmail && requestingSacEmail === decodedEmail)

    // Authorization: own photo or read_members (server-side permission map)
    if (!isOwnPhoto && !hasPermission(requestingEmail, 'read_members')) {
      return NextResponse.json(
        { error: 'Permiso denegado', details: 'You can only access your own photo' },
        { status: 403 }
      )
    }

    const member = await getMemberByEmail(decodedEmail)
    if (!member?.photoFileId) {
      return NextResponse.json({ error: 'Foto no encontrada' }, { status: 404 })
    }

    // Reject mismatched cache-buster / client-supplied IDs (prevents Drive file IDOR)
    const requestedId = searchParams.get('photoFileId') || searchParams.get('v')
    if (requestedId && requestedId !== member.photoFileId) {
      return NextResponse.json({ error: 'Foto no encontrada' }, { status: 404 })
    }

    const photo = await getPhoto(member.photoFileId)
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
    return NextResponse.json({ error: 'Error al obtener foto' }, { status: 500 })
  }
})
