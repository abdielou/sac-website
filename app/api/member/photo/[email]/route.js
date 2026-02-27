// app/api/member/photo/[email]/route.js
import { auth } from '../../../../../auth'
import { NextResponse } from 'next/server'
import { getMemberByEmail } from '../../../../../lib/google-sheets'
import { getPhoto } from '../../../../../lib/google-drive'

/**
 * GET /api/member/photo/[email]
 * Proxy a member's profile photo from Google Drive.
 * Requires authentication. Does NOT expose Drive file IDs or URLs to the client.
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
    const decodedEmail = decodeURIComponent(email)

    // Look up the member to get their photoFileId
    const member = await getMemberByEmail(decodedEmail)
    if (!member || !member.photoFileId) {
      return NextResponse.json({ error: 'Foto no encontrada' }, { status: 404 })
    }

    // Fetch photo from Drive
    const photo = await getPhoto(member.photoFileId)
    if (!photo) {
      return NextResponse.json({ error: 'Foto no encontrada' }, { status: 404 })
    }

    // Return the photo binary with proper headers
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
