// app/api/member/profile/route.js
import { auth } from '../../../../auth'
import { NextResponse } from 'next/server'
import { getMemberByEmail, updateMemberProfile } from '../../../../lib/google-sheets'
import { uploadPhoto } from '../../../../lib/google-drive'
import { generateVerifyToken } from '../../../../lib/id-card/verifyToken'
import { sanitizeMemberProfileFields } from '../../../../lib/member-profile-fields'

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
    // Prefer SAC email (stored in JWT at sign-in) over generic session email.
    // This handles members who signed in with a personal Gmail account but are
    // registered in the sheet under their SAC @sociedadastronomia.com email.
    const email = req.auth.user?.sacEmail?.toLowerCase() || req.auth.user.email?.toLowerCase()
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
    // Also strip 'sheetEmail' (sheet personal email) so clients always use sacEmail
    const { _raw, id, email: sheetEmail, sacEmail: _memberSacEmail, ...profileFields } = member
    const photoUrl = member.photoFileId
      ? `/api/member/photo/${encodeURIComponent(email)}?photoFileId=${encodeURIComponent(member.photoFileId)}`
      : null

    return NextResponse.json({
      ...profileFields,
      familyMembers: member.familyMembers || [],
      familyMemberPhotos: member.familyMemberPhotos || {},
      photoUrl,
      sacEmail: email,
      isAdmin: req.auth.user?.isAdmin || false,
      verifyToken: generateVerifyToken(member.email),
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
  'initial',
  'lastName',
  'town',
  'postalAddress',
  'zipcode',
  'telescopeModel',
  'otherEquipment',
  'familyGroup',
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
    const email = req.auth.user?.sacEmail?.toLowerCase() || req.auth.user.email?.toLowerCase()
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
          return NextResponse.json({ error: 'Formato de campos invalido' }, { status: 400 })
        }
      }
    } else {
      // JSON body (fields only, no photo)
      fields = await req.json()
    }

    // Validate photo if present
    if (photoFile && photoFile.size > 0) {
      if (photoFile.size > MAX_PHOTO_SIZE) {
        return NextResponse.json({ error: 'Archivo muy grande (maximo 5MB)' }, { status: 400 })
      }

      const photoMime = photoFile.type || ''
      if (!photoMime.startsWith('image/')) {
        return NextResponse.json({ error: 'El archivo debe ser una imagen' }, { status: 400 })
      }

      // Upload photo to Drive (backup existing photoFileId before replacing)
      const member = await getMemberByEmail(email)
      const arrayBuffer = await photoFile.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const fileId = await uploadPhoto(email, buffer, photoMime, {
        currentPhotoFileId: member?.photoFileId || undefined,
      })

      // Include photoFileId in the fields to update
      fields.photoFileId = fileId
    }

    // Whitelist allowed keys, then sanitize all text values
    const allowedPayload = {}
    for (const key of ALLOWED_FIELDS) {
      if (fields[key] !== undefined) {
        allowedPayload[key] = fields[key]
      }
    }
    if (fields.photoFileId) {
      allowedPayload.photoFileId = fields.photoFileId
    }

    const sanitizedFields = sanitizeMemberProfileFields(allowedPayload)

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
      ? `/api/member/photo/${encodeURIComponent(email)}?v=${encodeURIComponent(updatedMember.photoFileId)}`
      : null

    return NextResponse.json({
      ...profileFields,
      photoUrl,
      isAdmin: req.auth.user?.isAdmin || false,
    })
  } catch (error) {
    console.error('Error updating member profile:', error)
    return NextResponse.json(
      { error: 'Error al actualizar perfil', details: error.message },
      { status: 500 }
    )
  }
})
