// lib/google-sheets.js
import { GoogleSpreadsheet } from 'google-spreadsheet'
import { JWT } from 'google-auth-library'
import { getCachedData, CACHE_KEYS } from './cache'

/**
 * Create authenticated JWT for service account
 * Key is stored in env var with escaped newlines, must be unescaped
 */
function createServiceAuth() {
  return new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

/**
 * Get spreadsheet instance (cached internally by google-spreadsheet)
 */
let docInstance = null

async function getSpreadsheet() {
  if (!docInstance) {
    const auth = createServiceAuth()
    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth)
    await doc.loadInfo()
    // Only cache after successful loadInfo
    docInstance = doc
  }
  return docInstance
}

/**
 * Retry function with exponential backoff for rate limit handling
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<any>}
 */
async function withRetry(fn, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const isRateLimited = error.code === 429 || error.message?.includes('429')
      if (isRateLimited && attempt < maxRetries - 1) {
        const delay = Math.min(32000, Math.pow(2, attempt) * 1000 + Math.random() * 1000)
        console.log(`Rate limited, retrying in ${Math.round(delay)}ms...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }
      throw error
    }
  }
}

/**
 * Calculate membership status and days until expiration
 * @param {string|Date} expirationDate - Expiration date
 * @returns {{status: string, daysUntilExpiration: number|null}}
 */
function calculateMembershipStatus(expirationDate) {
  if (!expirationDate) {
    return { status: 'applied', daysUntilExpiration: null }
  }

  const expDate = new Date(expirationDate)
  const now = new Date()
  const diffTime = expDate.getTime() - now.getTime()
  const daysUntilExpiration = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  let status
  if (daysUntilExpiration < 0) {
    status = 'expired'
  } else if (daysUntilExpiration <= 30) {
    status = 'expiring-soon'
  } else {
    status = 'active'
  }

  return { status, daysUntilExpiration }
}

/**
 * Build email-to-latest-payment index from PAYMENTS sheet
 * Used to compute membership expiration (latest valid payment + 1 year)
 */
const MEMBERSHIP_FEE = 25

/**
 * Track the latest qualifying payment date per email
 * Shared by buildPaymentExpirationIndex to accumulate from multiple sheets
 */
function trackLatestPayment(index, email, amount, dateStr) {
  if (!email || amount < MEMBERSHIP_FEE || !dateStr) return
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return
  const existing = index.get(email)
  if (!existing || date > existing) {
    index.set(email, date)
  }
}

async function buildPaymentExpirationIndex(doc) {
  const index = new Map()

  // Process PAYMENTS sheet
  const paymentsSheet = doc.sheetsByTitle['PAYMENTS']
  if (paymentsSheet) {
    const rows = await paymentsSheet.getRows()
    for (const row of rows) {
      const email = (
        row.get('Sender Email') ||
        row.get('sender_email') ||
        row.get('E-mail') ||
        row.get('Email') ||
        row.get('email') ||
        ''
      )
        .trim()
        .toLowerCase()
      const amount = parseFloat(
        row.get('Amount') || row.get('Monto') || row.get('Cantidad') || row.get('amount') || '0'
      )
      const dateStr =
        row.get('Timestamp') ||
        row.get('Fecha') ||
        row.get('Payment Date') ||
        row.get('payment_date') ||
        row.get('Date') ||
        ''
      trackLatestPayment(index, email, amount, dateStr)
    }
  }

  // Process MANUAL_PAYMENTS sheet
  const manualSheet = doc.sheetsByTitle['MANUAL_PAYMENTS']
  if (manualSheet) {
    const manualRows = await manualSheet.getRows()
    for (const row of manualRows) {
      const email = (row.get('E-mail') || row.get('email') || '').trim().toLowerCase()
      const amount = parseFloat(row.get('amount') || row.get('Amount') || '0')
      const dateStr = row.get('date') || row.get('Date') || row.get('fecha') || ''
      trackLatestPayment(index, email, amount, dateStr)
    }
  }

  // Convert payment dates to expiration dates (+ 1 year)
  const expirationIndex = new Map()
  for (const [email, paymentDate] of index) {
    const expiration = new Date(paymentDate)
    expiration.setFullYear(expiration.getFullYear() + 1)
    expirationIndex.set(email, expiration)
  }

  return expirationIndex
}

/**
 * Fetch all members from CLEAN sheet, enriched with payment-based expiration
 * Returns cached data if available, otherwise fetches fresh
 * @param {boolean} forceRefresh - Bypass cache
 * @returns {Promise<{data: Array, fromCache: boolean}>}
 */
export async function getMembers(forceRefresh = false) {
  return getCachedData(
    CACHE_KEYS.MEMBERS,
    async () => {
      return withRetry(async () => {
        const doc = await getSpreadsheet()
        const sheet = doc.sheetsByTitle['CLEAN']

        if (!sheet) {
          throw new Error('CLEAN sheet not found in spreadsheet')
        }

        // Fetch members and payment expiration index in parallel
        const [rows, expirationIndex] = await Promise.all([
          sheet.getRows(),
          buildPaymentExpirationIndex(doc),
        ])

        return rows.map((row, index) => {
          // CLEAN sheet columns: E-mail, Nombre, Inicial, Apellidos, Teléfono, etc.
          const rawEmail = row.get('E-mail') || row.get('email') || row.get('Email') || ''
          const email = rawEmail.trim().toLowerCase()
          const firstName =
            row.get('Nombre') || row.get('First Name') || row.get('first_name') || ''
          const lastName =
            row.get('Apellidos') || row.get('Last Name') || row.get('last_name') || ''
          const name = [firstName, lastName].filter(Boolean).join(' ').trim()

          // Look up expiration from payment history
          const expirationDate = expirationIndex.get(email) || null
          const { status, daysUntilExpiration } = calculateMembershipStatus(expirationDate)

          return {
            id: index + 1,
            email,
            name: name || '-',
            expirationDate: expirationDate ? expirationDate.toISOString() : null,
            status,
            daysUntilExpiration,
            _raw: row.toObject(),
          }
        })
      })
    },
    forceRefresh
  )
}

/**
 * Normalize payment source to consistent identifiers
 * Maps spreadsheet variations to canonical values used by filters/badges
 */
const SOURCE_ALIASES = {
  ath_business_team: 'ath_movil',
  ath_movil: 'ath_movil',
  paypal: 'paypal',
}

function normalizeSource(raw) {
  const key = raw.toLowerCase().replace(/\s+/g, '_')
  return SOURCE_ALIASES[key] || key
}

/**
 * Fetch all payments from PAYMENTS and MANUAL_PAYMENTS sheets
 * Returns cached data if available, otherwise fetches fresh
 * @param {boolean} forceRefresh - Bypass cache
 * @returns {Promise<{data: Array, fromCache: boolean}>}
 */
export async function getPayments(forceRefresh = false) {
  return getCachedData(
    CACHE_KEYS.PAYMENTS,
    async () => {
      return withRetry(async () => {
        const doc = await getSpreadsheet()
        const sheet = doc.sheetsByTitle['PAYMENTS']

        if (!sheet) {
          throw new Error('PAYMENTS sheet not found in spreadsheet')
        }

        // Fetch both sheets in parallel
        const manualSheet = doc.sheetsByTitle['MANUAL_PAYMENTS']
        const [rows, manualRows] = await Promise.all([
          sheet.getRows(),
          manualSheet ? manualSheet.getRows() : Promise.resolve([]),
        ])

        const payments = rows.map((row, index) => {
          const email =
            row.get('Sender Email') ||
            row.get('sender_email') ||
            row.get('E-mail') ||
            row.get('Email') ||
            row.get('email') ||
            ''
          const amount =
            row.get('Amount') || row.get('Monto') || row.get('Cantidad') || row.get('amount') || ''
          const date =
            row.get('Timestamp') ||
            row.get('Fecha') ||
            row.get('Payment Date') ||
            row.get('payment_date') ||
            row.get('Date') ||
            ''
          const source =
            row.get('Payment Service') ||
            row.get('payment_service') ||
            row.get('Servicio') ||
            row.get('Source') ||
            row.get('Fuente') ||
            ''
          const notes =
            row.get('Message') ||
            row.get('payment_message') ||
            row.get('Mensaje') ||
            row.get('Notes') ||
            row.get('Notas') ||
            ''

          return {
            id: index + 1,
            email,
            amount: parseFloat(amount) || 0,
            date,
            source: normalizeSource(source),
            notes,
            _raw: row.toObject(),
          }
        })

        // MANUAL_PAYMENTS columns: E-mail, Teléfono, amount, date, payment_type, notes
        const manualPayments = manualRows.map((row, index) => {
          const email = (row.get('E-mail') || row.get('email') || '').trim().toLowerCase()
          const amount = row.get('amount') || row.get('Amount') || ''
          const date = row.get('date') || row.get('Date') || row.get('fecha') || ''
          const notes = row.get('notes') || row.get('Notes') || ''

          return {
            id: payments.length + index + 1,
            email,
            amount: parseFloat(amount) || 0,
            date,
            source: 'manual',
            notes,
            _raw: row.toObject(),
          }
        })

        return [...payments, ...manualPayments]
      })
    },
    forceRefresh
  )
}

// Re-export for testing or direct access
export { getSpreadsheet }
