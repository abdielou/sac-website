// app/api/admin/whatsapp-audit/route.js
import { auth } from '../../../../auth'
import { NextResponse } from 'next/server'
import { getMembers, normalizePhone } from '../../../../lib/google-sheets'
import { checkPermission } from '../../../../lib/api-permissions'
import { Actions } from '../../../../lib/permissions'

/**
 * Parse a CSV line respecting double-quoted fields.
 * Fields containing commas or quotes are wrapped in double quotes.
 * Double quotes within quoted fields are escaped as "".
 */
function parseCSVLine(line) {
  const fields = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++ // skip escaped quote
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        fields.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
  }
  fields.push(current.trim())
  return fields
}

/**
 * Escape a value for CSV output.
 * Wraps in double quotes if the value contains commas, quotes, or newlines.
 */
function escapeCSV(value) {
  if (value == null) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

/**
 * POST /api/admin/whatsapp-audit
 *
 * Accepts a WhatsApp members CSV (FormData with 'file' field).
 * Normalizes phone numbers, performs outer join against SAC members,
 * returns a downloadable CSV with match_type: matched, unknown, or missing.
 */
export const POST = auth(async function POST(req) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  const permissionError = checkPermission(req, Actions.DOWNLOAD_CSV_MEMBERS)
  if (permissionError) return permissionError

  try {
    // Parse FormData
    const formData = await req.formData()
    const file = formData.get('file')

    if (!file) {
      return NextResponse.json(
        { error: 'Archivo CSV requerido', details: 'No file provided in form data' },
        { status: 400 }
      )
    }

    const text = await file.text()
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)

    if (lines.length < 2) {
      return NextResponse.json(
        {
          error: 'Archivo CSV vacío o inválido',
          details: 'CSV must have a header row and at least one data row',
        },
        { status: 400 }
      )
    }

    // Skip header row, parse data rows
    const waEntries = []
    for (let i = 1; i < lines.length; i++) {
      const fields = parseCSVLine(lines[i])
      const phone = fields[0] || ''
      const displayName = fields[1] || ''
      if (!phone) continue
      waEntries.push({
        rawPhone: phone,
        normalizedPhone: normalizePhone(phone),
        displayName,
      })
    }

    // Fetch SAC members and build lookup map by normalized phone
    const { data: allMembers } = await getMembers()
    const sacByPhone = new Map()
    const matchedSacPhones = new Set()

    for (const member of allMembers) {
      const np = normalizePhone(member.phone)
      if (np) {
        sacByPhone.set(np, member)
      }
    }

    // Build result rows
    const resultRows = []

    // Process WA entries: matched or unknown
    for (const wa of waEntries) {
      const sacMember = wa.normalizedPhone ? sacByPhone.get(wa.normalizedPhone) : null
      if (sacMember) {
        matchedSacPhones.add(wa.normalizedPhone)
        resultRows.push({
          phone_normalized: wa.normalizedPhone,
          wa_display_name: wa.displayName,
          member_name: sacMember.name || '',
          member_email: sacMember.email || '',
          member_status: sacMember.status || '',
          match_type: 'matched',
        })
      } else {
        resultRows.push({
          phone_normalized: wa.normalizedPhone || wa.rawPhone,
          wa_display_name: wa.displayName,
          member_name: '',
          member_email: '',
          member_status: '',
          match_type: 'unknown',
        })
      }
    }

    // Add SAC members missing from WA
    for (const [np, member] of sacByPhone) {
      if (!matchedSacPhones.has(np)) {
        resultRows.push({
          phone_normalized: np,
          wa_display_name: '',
          member_name: member.name || '',
          member_email: member.email || '',
          member_status: member.status || '',
          match_type: 'missing',
        })
      }
    }

    // Build CSV output
    const csvHeader =
      'phone_normalized,wa_display_name,member_name,member_email,member_status,match_type'
    const csvLines = [csvHeader]
    for (const row of resultRows) {
      csvLines.push(
        [
          escapeCSV(row.phone_normalized),
          escapeCSV(row.wa_display_name),
          escapeCSV(row.member_name),
          escapeCSV(row.member_email),
          escapeCSV(row.member_status),
          escapeCSV(row.match_type),
        ].join(',')
      )
    }

    const csvBody = csvLines.join('\n')
    const today = new Date().toISOString().slice(0, 10)

    return new Response(csvBody, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="whatsapp-audit-${today}.csv"`,
      },
    })
  } catch (error) {
    console.error('Error processing WhatsApp audit:', error)
    return NextResponse.json(
      {
        error: 'Error al procesar el archivo',
        details: error.message,
      },
      { status: 500 }
    )
  }
})
