// app/api/admin/debug-sheets/route.js
// TEMPORARY DEBUG ENDPOINT - remove after investigation
import { auth } from '../../../../auth'
import { NextResponse } from 'next/server'
import { GoogleSpreadsheet } from 'google-spreadsheet'
import { JWT } from 'google-auth-library'

export const GET = auth(async function GET(req) {
  if (!req.auth) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const jwtAuth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, jwtAuth)
    await doc.loadInfo()

    const sheet = doc.sheetsByTitle['CLEAN']
    if (!sheet) {
      return NextResponse.json({ error: 'CLEAN sheet not found', sheets: Object.keys(doc.sheetsByTitle) })
    }

    await sheet.loadHeaderRow()

    const sheetInfo = {
      title: sheet.title,
      rowCount: sheet.rowCount,
      columnCount: sheet.columnCount,
      headerValues: sheet.headerValues,
    }

    // Fetch with explicit limit
    const rows = await sheet.getRows({ limit: 5000 })

    // Look for Tiffany
    const tiffanyRows = rows.filter((r) => {
      const e = r.get('E-mail') || r.get('email') || r.get('Email') || ''
      const n = r.get('Nombre') || ''
      return e.toLowerCase().includes('tiffany') || n.toLowerCase().includes('tiffany')
    })

    // Sample: first 3 rows raw data
    const sampleRows = rows.slice(0, 3).map((r) => ({
      email: r.get('E-mail'),
      nombre: r.get('Nombre'),
      apellidos: r.get('Apellidos'),
      rawData: r._rawData,
    }))

    // Last 3 rows
    const lastRows = rows.slice(-3).map((r) => ({
      email: r.get('E-mail'),
      nombre: r.get('Nombre'),
      apellidos: r.get('Apellidos'),
    }))

    return NextResponse.json({
      sheetInfo,
      totalRowsReturned: rows.length,
      tiffanyFound: tiffanyRows.length > 0,
      tiffanyRows: tiffanyRows.map((r) => ({
        email: r.get('E-mail'),
        nombre: r.get('Nombre'),
        apellidos: r.get('Apellidos'),
        rawData: r._rawData,
      })),
      sampleRows,
      lastRows,
    })
  } catch (err) {
    return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 })
  }
})
