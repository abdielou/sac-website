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
 * Calculate membership status based on months since last qualifying payment
 * Rules: ≤8 months = active, >8–12 months = expiring-soon, >12 months = expired
 * @param {Date|null} lastPaymentDate - Date of most recent $25 payment
 * @returns {{status: string, expirationDate: Date|null, monthsSincePayment: number|null}}
 */
function calculateMembershipStatus(lastPaymentDate) {
  if (!lastPaymentDate) {
    return { status: 'applied', expirationDate: null, monthsSincePayment: null }
  }

  const payment = new Date(lastPaymentDate)
  const now = new Date()

  // Calculate whole months since payment
  let monthsSince =
    (now.getFullYear() - payment.getFullYear()) * 12 + (now.getMonth() - payment.getMonth())
  if (now.getDate() < payment.getDate()) {
    monthsSince--
  }

  let status
  if (monthsSince <= 8) {
    status = 'active'
  } else if (monthsSince <= 12) {
    status = 'expiring-soon'
  } else {
    status = 'expired'
  }

  // Expiration = payment + 12 months (for display)
  const expirationDate = new Date(payment)
  expirationDate.setFullYear(expirationDate.getFullYear() + 1)

  return { status, expirationDate, monthsSincePayment: monthsSince }
}

/**
 * Build email-to-latest-payment index from PAYMENTS sheet
 * Used to compute membership expiration (latest valid payment + 1 year)
 */
const MEMBERSHIP_FEE = 25

/**
 * Track the latest qualifying payment per email (date, amount, notes)
 * Shared by buildLatestPaymentIndex to accumulate from multiple sheets
 */
function trackLatestPayment(index, email, amount, dateStr, notes, source) {
  if (!email || amount < MEMBERSHIP_FEE || !dateStr) return
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return
  const existing = index.get(email)
  if (!existing || date > existing.date) {
    index.set(email, { date, amount, notes: notes || '', source: source || '' })
  }
}

/**
 * Build email → latest qualifying payment date index from PAYMENTS + MANUAL_PAYMENTS
 * Only considers payments of $25 or more
 * @returns {Promise<Map<string, Date>>}
 */
async function buildLatestPaymentIndex(doc) {
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
      const notes =
        row.get('Message') ||
        row.get('payment_message') ||
        row.get('Mensaje') ||
        row.get('Notes') ||
        row.get('Notas') ||
        ''
      const source =
        row.get('Payment Service') ||
        row.get('payment_service') ||
        row.get('Servicio') ||
        row.get('Source') ||
        row.get('Fuente') ||
        ''
      trackLatestPayment(index, email, amount, dateStr, notes, normalizeSource(source))
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
      const notes = row.get('notes') || row.get('Notes') || ''
      trackLatestPayment(index, email, amount, dateStr, notes, 'manual')
    }
  }

  return index
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

        // Fetch members and latest payment index in parallel
        const [rows, paymentIndex] = await Promise.all([
          sheet.getRows(),
          buildLatestPaymentIndex(doc),
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

          // Look up last payment and compute status
          const lastPayment = paymentIndex.get(email) || null
          const { status, expirationDate, monthsSincePayment } = calculateMembershipStatus(
            lastPayment?.date || null
          )

          return {
            id: index + 1,
            email,
            name: name || '-',
            expirationDate: expirationDate ? expirationDate.toISOString() : null,
            status,
            monthsSincePayment,
            lastPaymentAmount: lastPayment?.amount || null,
            lastPaymentDate: lastPayment?.date ? lastPayment.date.toISOString() : null,
            lastPaymentNotes: lastPayment?.notes || '',
            lastPaymentSource: lastPayment?.source || '',
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
