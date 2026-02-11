// app/api/admin/create-workspace-account/route.js
import { auth } from '../../../../auth'
import { NextResponse } from 'next/server'
import { callAppsScript } from '../../../../lib/apps-script'
import { invalidateCache } from '../../../../lib/cache'

/**
 * POST /api/admin/create-workspace-account
 *
 * Create a Google Workspace account for a member via Apps Script web app.
 *
 * Request body:
 * - email: string (required) - member's personal email
 * - firstName: string (required) - member's first name
 * - lastName: string (required) - member's last name (primer apellido)
 * - sacEmail: string (required) - selected workspace email (must end with @sociedadastronomia.com)
 * - initial: string (optional) - member's middle initial
 * - slastName: string (optional) - member's second last name (segundo apellido)
 * - phone: string (optional) - member's phone number
 */
export const POST = auth(async function POST(req) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  const accessToken = req.auth.accessToken
  if (!accessToken) {
    return NextResponse.json(
      {
        error: 'Sesion expirada',
        details: 'No access token in session. Please sign out and sign in again.',
      },
      { status: 401 }
    )
  }

  try {
    const body = await req.json()

    // Validate required fields
    const { email, firstName, lastName, sacEmail } = body
    if (!email || !firstName || !lastName || !sacEmail) {
      return NextResponse.json(
        {
          error: 'Campos requeridos faltantes',
          details: 'Required: email, firstName, lastName, sacEmail',
        },
        { status: 400 }
      )
    }

    // Validate sacEmail domain
    if (!sacEmail.endsWith('@sociedadastronomia.com')) {
      return NextResponse.json(
        {
          error: 'Email SAC no valido',
          details: 'sacEmail must end with @sociedadastronomia.com',
        },
        { status: 400 }
      )
    }

    const result = await callAppsScript(accessToken, 'create_workspace_account', {
      email: body.email,
      firstName: body.firstName,
      initial: body.initial || '',
      lastName: body.lastName,
      slastName: body.slastName || '',
      sacEmail: body.sacEmail,
      phone: body.phone || '',
    })

    if (!result.success) {
      const status = result.error === 'OPERATION_IN_PROGRESS' ? 409 : 500
      return NextResponse.json({ error: result.error }, { status })
    }

    // Workspace account created - invalidate cache (member's sacEmail changed)
    invalidateCache()

    return NextResponse.json(result)
  } catch (error) {
    const isTimeout = error.name === 'AbortError'
    return NextResponse.json(
      {
        error: isTimeout ? 'Tiempo de espera agotado' : 'Error al crear cuenta de Workspace',
        details: error.message,
      },
      { status: isTimeout ? 504 : 500 }
    )
  }
})
