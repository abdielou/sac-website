// app/api/admin/emails/route.js
import { auth } from '../../../../auth'
import { NextResponse } from 'next/server'
import { checkReadAccess } from '../../../../lib/api-permissions'
import { getEmailAccountability, GmailLogConfigError } from '@/lib/gmail-log'

/**
 * GET /api/admin/emails
 *
 * Returns { data, meta: { fromCache } } where data is the accountability
 * result built from Gmail log events. Requires read_emails.
 * Query: refresh=true bypasses the cache.
 */
export const GET = auth(async function GET(req) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  const readError = checkReadAccess(req, 'emails')
  if (readError) return readError

  const { searchParams } = new URL(req.url)
  const forceRefresh = searchParams.get('refresh') === 'true'

  try {
    const { data, fromCache } = await getEmailAccountability(forceRefresh)
    return NextResponse.json({ data, meta: { fromCache } })
  } catch (error) {
    console.error('Error reading Gmail log events:', error)
    if (error instanceof GmailLogConfigError) {
      return NextResponse.json(
        { error: 'Falta configuración del registro de correo', details: error.message },
        { status: 500 }
      )
    }
    return NextResponse.json(
      { error: 'Error al leer el registro de correo', details: error.message },
      { status: 502 }
    )
  }
})
