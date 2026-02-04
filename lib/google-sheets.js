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
    return { status: 'unknown', daysUntilExpiration: null }
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
 * Fetch all members from CLEAN sheet
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

        const rows = await sheet.getRows()

        return rows.map((row, index) => {
          // Map all available columns - actual column names depend on spreadsheet
          // Common expected columns: Email, Name, Expiration Date, etc.
          const email = row.get('Email') || row.get('email') || ''
          const name = row.get('Name') || row.get('Nombre') || ''
          const expirationDate = row.get('Expiration Date') || row.get('Expiration') || ''

          const { status, daysUntilExpiration } = calculateMembershipStatus(expirationDate)

          return {
            id: index + 1,
            email,
            name,
            expirationDate,
            status,
            daysUntilExpiration,
            // Include raw row data for any additional columns
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
 * Fetch all payments from PAYMENTS sheet
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

        const rows = await sheet.getRows()

        return rows.map((row, index) => {
          // Payment fields - column names match Apps Script insertPaymentRecord
          // Email: sender_email, Sender Email, E-mail, Email
          const email =
            row.get('Sender Email') ||
            row.get('sender_email') ||
            row.get('E-mail') ||
            row.get('Email') ||
            row.get('email') ||
            ''
          // Amount: Amount, Monto, Cantidad
          const amount =
            row.get('Amount') || row.get('Monto') || row.get('Cantidad') || row.get('amount') || ''
          // Date: Timestamp, Fecha, Payment Date, payment_date
          const date =
            row.get('Timestamp') ||
            row.get('Fecha') ||
            row.get('Payment Date') ||
            row.get('payment_date') ||
            row.get('Date') ||
            ''
          // Source: Payment Service, payment_service, Servicio
          const source =
            row.get('Payment Service') ||
            row.get('payment_service') ||
            row.get('Servicio') ||
            row.get('Source') ||
            row.get('Fuente') ||
            ''
          // Notes: Message, payment_message, Mensaje
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
      })
    },
    forceRefresh
  )
}

// Re-export for testing or direct access
export { getSpreadsheet }
