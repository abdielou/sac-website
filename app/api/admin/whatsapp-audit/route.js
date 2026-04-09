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
 * Normalizes phone numbers, matches against SAC members,
 * returns a downloadable CSV with match_type: matched or unknown.
 * Only WhatsApp community members are included in the report.
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

    // Detect if sub_channels column exists
    const headerFields = parseCSVLine(lines[0])
    const hasSubChannels = headerFields.some(
      (h) => h.toLowerCase().replace(/\s/g, '') === 'sub_channels'
    )
    const subChannelsIdx = hasSubChannels
      ? headerFields.findIndex((h) => h.toLowerCase().replace(/\s/g, '') === 'sub_channels')
      : -1

    // Skip header row, parse data rows
    const waEntries = []
    for (let i = 1; i < lines.length; i++) {
      const fields = parseCSVLine(lines[i])
      const phone = fields[0] || ''
      const displayName = fields[1] || ''
      const subChannels = subChannelsIdx >= 0 ? fields[subChannelsIdx] || '' : ''
      if (!phone) continue
      waEntries.push({
        rawPhone: phone,
        normalizedPhone: normalizePhone(phone),
        displayName,
        subChannels,
      })
    }

    // Fetch SAC members and build lookup map by normalized phone
    const { data: allMembers } = await getMembers()
    const sacByPhone = new Map()

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
        resultRows.push({
          phone_normalized: wa.normalizedPhone,
          wa_display_name: wa.displayName,
          member_name: sacMember.name || '',
          member_email: sacMember.email || '',
          member_status: sacMember.status || '',
          match_type: 'matched',
          sub_channels: wa.subChannels,
        })
      } else {
        resultRows.push({
          phone_normalized: wa.normalizedPhone || wa.rawPhone,
          wa_display_name: wa.displayName,
          member_name: '',
          member_email: '',
          member_status: '',
          match_type: 'unknown',
          sub_channels: wa.subChannels,
        })
      }
    }

    // Sort: matched first (by member_status), then unknown
    const statusOrder = { active: 0, 'expiring-soon': 1, expired: 2, applied: 3, '': 4 }
    resultRows.sort((a, b) => {
      if (a.match_type !== b.match_type) return a.match_type === 'matched' ? -1 : 1
      const sa = statusOrder[a.member_status] ?? 4
      const sb = statusOrder[b.member_status] ?? 4
      return sa - sb
    })

    // Build CSV output
    const baseCols = 'phone_normalized,wa_display_name,member_name,member_email,member_status,match_type'
    const csvHeader = hasSubChannels ? baseCols + ',sub_channels' : baseCols
    const csvLines = [csvHeader]
    for (const row of resultRows) {
      const cols = [
        escapeCSV(row.phone_normalized),
        escapeCSV(row.wa_display_name),
        escapeCSV(row.member_name),
        escapeCSV(row.member_email),
        escapeCSV(row.member_status),
        escapeCSV(row.match_type),
      ]
      if (hasSubChannels) cols.push(escapeCSV(row.sub_channels))
      csvLines.push(cols.join(','))
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
