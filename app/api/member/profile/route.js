// app/api/member/profile/route.js
import { auth } from '../../../../auth'
import { NextResponse } from 'next/server'
import { getMemberByEmail, updateMemberProfile } from '../../../../lib/google-sheets'
import { uploadPhoto } from '../../../../lib/google-drive'

/**
 * GET /api/member/profile
 * Returns the authenticated member's own profile data.
 * Email is always taken from the session (scope guard).
 */
export const GET = auth(async function GET(req) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  try {
    const email = req.auth.user.email?.toLowerCase()
    if (!email) {
      return NextResponse.json(
        { error: 'No autenticado', details: 'No email in session' },
        { status: 401 }
      )
    }

    const member = await getMemberByEmail(email)
    if (!member) {
      return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })
    }

    // Build profile response, stripping internal fields
    const { _raw, id, ...profileFields } = member
    const photoUrl = member.photoFileId
      ? `/api/member/photo/${encodeURIComponent(email)}`
      : null

    return NextResponse.json({
      ...profileFields,
      photoUrl,
    })
  } catch (error) {
    console.error('Error fetching member profile:', error)
    return NextResponse.json(
      { error: 'Error al obtener perfil', details: error.message },
      { status: 500 }
    )
  }
})

/** Max photo upload size: 5MB */
const MAX_PHOTO_SIZE = 5 * 1024 * 1024

/**
 * Allowed fields that a member can update via PUT.
 * Maps body field names to the keys expected by updateMemberProfile.
 */
const ALLOWED_FIELDS = [
  'firstName',
  'phone',
  'town',
  'postalAddress',
  'zipcode',
  'telescopeModel',
  'otherEquipment',
]

/**
 * PUT /api/member/profile
 * Update the authenticated member's own profile.
 * Accepts multipart/form-data (with optional photo) or application/json (fields only).
 * Email is always taken from the session (scope guard).
 */
export const PUT = auth(async function PUT(req) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  try {
    const email = req.auth.user.email?.toLowerCase()
    if (!email) {
      return NextResponse.json(
        { error: 'No autenticado', details: 'No email in session' },
        { status: 401 }
      )
    }

    let fields = {}
    let photoFile = null

    const contentType = req.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      // Parse multipart form data
      const formData = await req.formData()
      photoFile = formData.get('photo')
      const fieldsStr = formData.get('fields')
      if (fieldsStr) {
        try {
          fields = JSON.parse(fieldsStr)
        } catch {
          return NextResponse.json(
            { error: 'Formato de campos invalido' },
            { status: 400 }
          )
        }
      }
    } else {
      // JSON body (fields only, no photo)
      fields = await req.json()
    }

    // Validate photo if present
    if (photoFile && photoFile.size > 0) {
      if (photoFile.size > MAX_PHOTO_SIZE) {
        return NextResponse.json(
          { error: 'Archivo muy grande (maximo 5MB)' },
          { status: 400 }
        )
      }

      const photoMime = photoFile.type || ''
      if (!photoMime.startsWith('image/')) {
        return NextResponse.json(
          { error: 'El archivo debe ser una imagen' },
          { status: 400 }
        )
      }

      // Upload photo to Drive
      const arrayBuffer = await photoFile.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const fileId = await uploadPhoto(email, buffer, photoMime)

      // Include photoFileId in the fields to update
      fields.photoFileId = fileId
    }

    // Sanitize: only pass allowed fields (plus photoFileId from upload)
    const sanitizedFields = {}
    for (const key of ALLOWED_FIELDS) {
      if (fields[key] !== undefined) {
        sanitizedFields[key] = fields[key]
      }
    }
    // photoFileId comes from Drive upload, not from body
    if (fields.photoFileId) {
      sanitizedFields.photoFileId = fields.photoFileId
    }

    // Check there's something to update
    if (Object.keys(sanitizedFields).length === 0) {
      return NextResponse.json(
        { error: 'No se proporcionaron campos para actualizar' },
        { status: 400 }
      )
    }

    await updateMemberProfile(email, sanitizedFields)

    // Return updated profile
    const updatedMember = await getMemberByEmail(email)
    if (!updatedMember) {
      return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })
    }

    const { _raw, id, ...profileFields } = updatedMember
    const photoUrl = updatedMember.photoFileId
      ? `/api/member/photo/${encodeURIComponent(email)}`
      : null

    return NextResponse.json({
      ...profileFields,
      photoUrl,
    })
  } catch (error) {
    console.error('Error updating member profile:', error)
    return NextResponse.json(
      { error: 'Error al actualizar perfil', details: error.message },
      { status: 500 }
    )
  }
})
