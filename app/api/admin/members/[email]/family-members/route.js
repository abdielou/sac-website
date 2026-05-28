// app/api/admin/members/[email]/family-members/route.js
import { auth } from '../../../../../../auth'
import { NextResponse } from 'next/server'
import { getMemberByEmail, updateFamilyMembers } from '../../../../../../lib/google-sheets'
import {
  parseFamilyMembers,
  sanitizeFamilyMemberNames,
} from '../../../../../../lib/family-members'
import { checkPermission } from '../../../../../../lib/api-permissions'
import { Actions } from '../../../../../../lib/permissions'

/**
 * PUT /api/admin/members/[email]/family-members
 * Admin updates the semicolon-separated family member names list.
 * Requires write_members (EDIT_MEMBER) permission.
 */
export const PUT = auth(async function PUT(req, { params }) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  const permissionError = checkPermission(req, Actions.EDIT_MEMBER)
  if (permissionError) return permissionError

  try {
    const { email: emailParam } = await params
    const decodedEmail = decodeURIComponent(emailParam)
    if (!decodedEmail) {
      return NextResponse.json({ error: 'Falta email' }, { status: 400 })
    }

    const member = await getMemberByEmail(decodedEmail)
    if (!member) {
      return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 })
    }

    const body = await req.json()
    let names

    if (Array.isArray(body.names)) {
      names = body.names
    } else if (typeof body.familyMembers === 'string') {
      names = parseFamilyMembers(body.familyMembers)
    } else {
      return NextResponse.json(
        { error: 'Se requiere names (array) o familyMembers (string)' },
        { status: 400 }
      )
    }

    const { names: sanitizedNames, error: sanitizeError } = sanitizeFamilyMemberNames(names)
    if (sanitizeError) {
      return NextResponse.json({ error: sanitizeError }, { status: 400 })
    }

    const sheetEmail = member.email || decodedEmail
    await updateFamilyMembers(sheetEmail, sanitizedNames)

    return NextResponse.json({ success: true, familyMembers: sanitizedNames })
  } catch (e) {
    console.error('Admin family members update failed:', e)
    return NextResponse.json({ error: 'Error al actualizar familiares' }, { status: 500 })
  }
})
