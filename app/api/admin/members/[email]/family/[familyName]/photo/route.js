// app/api/admin/members/[email]/family/[familyName]/photo/route.js
import { auth } from '../../../../../../../../auth'
import { NextResponse } from 'next/server'
import { uploadFamilyPhoto } from '../../../../../../../../lib/google-drive'
import {
  getMemberByEmail,
  updateFamilyMemberPhoto,
} from '../../../../../../../../lib/google-sheets'
import { checkPermission } from '../../../../../../../../lib/api-permissions'
import { Actions } from '../../../../../../../../lib/permissions'

/** Max photo upload size: 5MB */
const MAX_PHOTO_SIZE = 5 * 1024 * 1024

/**
 * POST /api/admin/members/[email]/family/[familyName]/photo
 * Admin uploads a cropped family member photo.
 * Requires write_members (EDIT_MEMBER) permission.
 */
export const POST = auth(async function POST(req, { params }) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  const permissionError = checkPermission(req, Actions.EDIT_MEMBER)
  if (permissionError) return permissionError

  try {
    const { email: emailParam, familyName: familyNameParam } = await params
    const decodedEmail = decodeURIComponent(emailParam)
    const decodedName = decodeURIComponent(familyNameParam)

    if (!decodedEmail) {
      return NextResponse.json({ error: 'Falta email' }, { status: 400 })
    }
    if (!decodedName) {
      return NextResponse.json({ error: 'Falta nombre del familiar' }, { status: 400 })
    }

    const member = await getMemberByEmail(decodedEmail)
    if (!member) {
      return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 })
    }

    if (!member.familyMembers.includes(decodedName)) {
      return NextResponse.json({ error: 'Familiar no encontrado en la lista' }, { status: 400 })
    }

    const formData = await req.formData()
    const photo = formData.get('photo')
    if (!photo || typeof photo.size !== 'number') {
      return NextResponse.json({ error: 'Falta archivo photo' }, { status: 400 })
    }

    if (photo.size === 0) {
      return NextResponse.json({ error: 'Archivo vacio' }, { status: 400 })
    }

    if (photo.size > MAX_PHOTO_SIZE) {
      return NextResponse.json({ error: 'Archivo muy grande (maximo 5MB)' }, { status: 400 })
    }

    const mimeType = photo.type || 'image/jpeg'
    if (!mimeType.startsWith('image/')) {
      return NextResponse.json({ error: 'El archivo debe ser una imagen' }, { status: 400 })
    }

    const arrayBuffer = await photo.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const sheetEmail = member.email || decodedEmail
    const currentPhotoFileId = member.familyMemberPhotos?.[decodedName]

    const fileId = await uploadFamilyPhoto(sheetEmail, decodedName, buffer, mimeType, {
      currentPhotoFileId: currentPhotoFileId || undefined,
    })

    await updateFamilyMemberPhoto(sheetEmail, decodedName, fileId)

    return NextResponse.json({ success: true, photoFileId: fileId })
  } catch (e) {
    console.error('Admin family photo upload failed:', e)
    return NextResponse.json({ error: 'Error al subir foto' }, { status: 500 })
  }
})
