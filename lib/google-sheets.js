// lib/google-sheets.js
import { GoogleSpreadsheet } from 'google-spreadsheet'
import { JWT } from 'google-auth-library'
import { getCachedData, invalidateCache, CACHE_KEYS } from './cache'

/**
 * Create authenticated JWT for service account
 * Key is stored in env var with escaped newlines, must be unescaped
 */
function createServiceAuth() {
  return new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
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
 * Calculate membership status using calendar-year coverage rules.
 *
 * Coverage end date:
 *   - H1 payment (Jan–Jun): coverage ends Dec 31 of the payment year
 *   - H2 payment (Jul–Dec): coverage ends Dec 31 of the following year
 *
 * Status determination:
 *   - Coverage end year >= current year → "active"
 *   - Coverage ended previous Dec 31 AND current month is Jan or Feb → "expiring-soon" (grace period)
 *   - Otherwise → "expired"
 *
 * @param {Date|null} lastPaymentDate - Date of most recent qualifying payment
 * @param {boolean} hasSacEmail - Whether the member has a SAC email (confirmed member)
 * @param {Date|null} now - Override current date (for testing); defaults to new Date()
 * @returns {{status: string, expirationDate: Date|null, monthsSincePayment: number|null}}
 */
function calculateMembershipStatus(lastPaymentDate, hasSacEmail = false, now = null) {
  if (!lastPaymentDate) {
    // If they have a SAC email, they're a confirmed member with expired status
    // Otherwise they're still in "applied" status (pending approval)
    return {
      status: hasSacEmail ? 'expired' : 'applied',
      expirationDate: null,
      monthsSincePayment: null,
    }
  }

  const payment = new Date(lastPaymentDate)
  const today = now || new Date()

  // Use UTC methods for timezone-independent date comparisons
  // Calculate whole months since payment (informational, backward-compatible)
  let monthsSince =
    (today.getUTCFullYear() - payment.getUTCFullYear()) * 12 +
    (today.getUTCMonth() - payment.getUTCMonth())
  if (today.getUTCDate() < payment.getUTCDate()) {
    monthsSince--
  }

  // Calendar-year coverage: H1 (months 1-6) → same year, H2 (months 7-12) → next year
  const paymentMonth = payment.getUTCMonth() + 1 // 1-based
  const paymentYear = payment.getUTCFullYear()
  const coverageEndYear = paymentYear + (paymentMonth <= 6 ? 0 : 1)
  const expirationDate = new Date(Date.UTC(coverageEndYear, 11, 31)) // Dec 31

  // Determine status based on coverage end vs current date
  const todayYear = today.getUTCFullYear()
  const todayMonth = today.getUTCMonth() // 0-based: Jan=0, Feb=1
  let status
  if (coverageEndYear >= todayYear) {
    status = 'active'
  } else if (coverageEndYear === todayYear - 1 && todayMonth <= 1) {
    // Grace period: Jan (month 0) or Feb (month 1) of the year after coverage ended
    status = 'expiring-soon'
  } else {
    status = 'expired'
  }

  return { status, expirationDate, monthsSincePayment: monthsSince }
}

/**
 * Build email-to-latest-payment index from PAYMENTS sheet
 * Used to compute membership expiration (latest valid payment + 1 year)
 */
const MEMBERSHIP_FEE = 25

/**
 * Normalize phone number to digits-only for matching
 * Strips all non-digit characters and leading country code '1'
 * @param {string} phone - Raw phone string
 * @returns {string} Normalized digits (empty string if invalid)
 */
function normalizePhone(phone) {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  // Strip leading US country code '1' if 11 digits
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
  return digits
}

/**
 * Track the latest qualifying payment per key (email or phone)
 * Shared by buildLatestPaymentIndex to accumulate from multiple sheets
 */
function trackLatestPayment(index, key, amount, dateStr, notes, source, forceQualify) {
  if (!key || !dateStr) return
  if (forceQualify !== true && amount < MEMBERSHIP_FEE) return
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return
  const existing = index.get(key)
  if (!existing || date > existing.date) {
    index.set(key, { date, amount, notes: notes || '', source: source || '' })
  }
}

/**
 * Build email → and phone → latest qualifying payment indexes from PAYMENTS + MANUAL_PAYMENTS
 * Only considers payments of $25 or more (unless explicitly classified)
 * @returns {Promise<{emailIndex: Map, phoneIndex: Map}>}
 */
async function buildLatestPaymentIndex(doc) {
  const emailIndex = new Map()
  const phoneIndex = new Map()

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
      const phone = normalizePhone(row.get('sender_phone') || '')
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
      const isMembership = row.get('is_membership') || ''

      // Classification logic: explicit value overrides $25 heuristic
      if (isMembership !== '') {
        const isExplicitlyMembership = isMembership.toLowerCase() === 'true'
        if (isExplicitlyMembership) {
          const src = normalizeSource(source)
          trackLatestPayment(emailIndex, email, amount, dateStr, notes, src, true)
          trackLatestPayment(phoneIndex, phone, amount, dateStr, notes, src, true)
        }
        // If explicitly 'false', skip entirely (not a membership payment)
      } else {
        // No classification: use existing $25 heuristic (trackLatestPayment checks internally)
        const src = normalizeSource(source)
        trackLatestPayment(emailIndex, email, amount, dateStr, notes, src)
        trackLatestPayment(phoneIndex, phone, amount, dateStr, notes, src)
      }
    }
  }

  // Process MANUAL_PAYMENTS sheet
  const manualSheet = doc.sheetsByTitle['MANUAL_PAYMENTS']
  if (manualSheet) {
    const manualRows = await manualSheet.getRows()
    for (const row of manualRows) {
      const email = (row.get('E-mail') || row.get('email') || '').trim().toLowerCase()
      const phone = normalizePhone(row.get('Teléfono') || row.get('Telefono') || '')
      const amount = parseFloat(row.get('amount') || row.get('Amount') || '0')
      const dateStr = row.get('date') || row.get('Date') || row.get('fecha') || ''
      const notes = row.get('notes') || row.get('Notes') || ''
      // Manual payments always qualify as membership (forceQualify=true)
      trackLatestPayment(emailIndex, email, amount, dateStr, notes, 'manual', true)
      trackLatestPayment(phoneIndex, phone, amount, dateStr, notes, 'manual', true)
    }
  }

  return { emailIndex, phoneIndex }
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

        // Fetch members and latest payment indexes in parallel
        const [rows, { emailIndex, phoneIndex }] = await Promise.all([
          sheet.getRows(),
          buildLatestPaymentIndex(doc),
        ])

        return rows.map((row, index) => {
          // CLEAN sheet columns: E-mail, Nombre, Inicial, Apellidos, Teléfono, etc.
          const rawEmail = row.get('E-mail') || row.get('email') || row.get('Email') || ''
          const email = rawEmail.trim().toLowerCase()
          const firstName =
            row.get('Nombre') || row.get('First Name') || row.get('first_name') || ''
          const initial = row.get('Inicial') || row.get('Initial') || row.get('initial') || ''
          const lastName =
            row.get('Apellidos') || row.get('Last Name') || row.get('last_name') || ''
          const name = [firstName, lastName].filter(Boolean).join(' ').trim()

          // Split full last name into primer apellido and segundo apellido
          // Mirrors Apps Script: fullLastName.split(/[\s-]/)
          const lastNameParts = lastName.split(/[\s-]/)
          const apellido1 = lastNameParts[0] || ''
          const apellido2 = lastNameParts.slice(1).join(' ') || ''

          const phone = row.get('Teléfono') || row.get('Telefono') || row.get('Phone') || ''
          const normalizedPhone = normalizePhone(phone)

          // Check if member has a SAC email (confirmed member)
          const sacEmail = row.get('sac_email') || row.get('SAC_Email') || ''
          const hasSacEmail = !!sacEmail.trim()

          // Look up last payment by email and phone, use whichever is more recent
          const emailPayment = emailIndex.get(email) || null
          const phonePayment = normalizedPhone ? phoneIndex.get(normalizedPhone) : null
          const lastPayment =
            emailPayment && phonePayment
              ? emailPayment.date >= phonePayment.date
                ? emailPayment
                : phonePayment
              : emailPayment || phonePayment
          const { status, expirationDate, monthsSincePayment } = calculateMembershipStatus(
            lastPayment?.date || null,
            hasSacEmail
          )

          // Extract all additional spreadsheet columns
          const timestamp = row.get('Timestamp') || null
          const formPurpose = row.get('Propósito del formulario') || null
          const postalAddress = row.get('Dirección postal') || null
          const town = row.get('Pueblo') || null
          const rawZip = row.get('Zipcode') || null
          const zipcode = rawZip ? String(rawZip).padStart(5, '0') : null
          const memberSince = row.get('Miembro desde') || null
          const birthDate = row.get('Fecha de nacimiento') || null
          const profession = row.get('Profesión / Ocupación') || null
          const areasOfInterest = row.get('Áreas de interés') || null
          const familyGroup = row.get('Grupo familiar') || null
          const hasTelescope = row.get('¿Tienes telescopio?') || null
          const telescopeModel = row.get('Modelo de telescopio') || null
          const otherEquipment = row.get('Otros equipos') || null
          const howDidYouHear = row.get('¿Cómo te enteraste de nosotros?') || null
          const wantsToCollaborate =
            row.get('¿Te gustaría colaborar con algún comité de apoyo?') || null
          const createdAt = row.get('created_at') || null
          const dataStatus = row.get('data_status') || null

          // Profile photo (Drive file ID)
          const photoFileId = row.get('photoFileId') || null

          // Geo coordinates (cached from geocoding)
          const rawGeoLat = row.get('geo_lat')
          const rawGeoLng = row.get('geo_lng')
          const geoLat = rawGeoLat ? parseFloat(rawGeoLat) : null
          const geoLng = rawGeoLng ? parseFloat(rawGeoLng) : null

          return {
            id: index + 1,
            email,
            phone: phone.trim() || null,
            sacEmail: sacEmail.trim() || null,
            name: name || '-',
            firstName: firstName.trim() || null,
            initial: initial.trim() || null,
            lastName: apellido1.trim() || null,
            slastName: apellido2.trim() || null,
            expirationDate: expirationDate ? expirationDate.toISOString() : null,
            status,
            monthsSincePayment,
            lastPaymentAmount: lastPayment?.amount || null,
            lastPaymentDate: lastPayment?.date ? lastPayment.date.toISOString() : null,
            lastPaymentNotes: lastPayment?.notes || '',
            lastPaymentSource: lastPayment?.source || '',
            // Additional spreadsheet columns
            timestamp,
            formPurpose,
            postalAddress,
            town,
            zipcode,
            memberSince,
            birthDate,
            profession,
            areasOfInterest,
            familyGroup,
            hasTelescope,
            telescopeModel,
            otherEquipment,
            howDidYouHear,
            wantsToCollaborate,
            createdAt,
            dataStatus,
            photoFileId,
            geoLat: isNaN(geoLat) ? null : geoLat,
            geoLng: isNaN(geoLng) ? null : geoLng,
            _raw: row.toObject(),
          }
        })
      })
    },
    forceRefresh
  )
}

/**
 * Write geocoding results back to the CLEAN sheet
 * Creates geo_lat/geo_lng columns if they don't exist
 * @param {Array<{email: string, lat: number, lng: number}>} updates - Geocoded coordinates
 * @returns {Promise<{updated: number, errors: string[]}>}
 */
export async function writeGeoData(updates) {
  return withRetry(async () => {
    const doc = await getSpreadsheet()
    const sheet = doc.sheetsByTitle['CLEAN']
    if (!sheet) throw new Error('CLEAN sheet not found in spreadsheet')

    await sheet.loadHeaderRow()
    const headers = sheet.headerValues

    // Ensure geo_lat and geo_lng columns exist
    let hasGeoLat = headers.includes('geo_lat')
    let hasGeoLng = headers.includes('geo_lng')

    if (!hasGeoLat || !hasGeoLng) {
      const newHeaders = [...headers]
      if (!hasGeoLat) newHeaders.push('geo_lat')
      if (!hasGeoLng) newHeaders.push('geo_lng')
      await sheet.setHeaderRow(newHeaders)
      // Reload to pick up new column indices
      await sheet.loadHeaderRow()
    }

    const rows = await sheet.getRows()
    let updated = 0
    const errors = []

    for (const { email, lat, lng } of updates) {
      const targetRow = rows.find((row) => {
        const rowEmail = (row.get('E-mail') || row.get('email') || row.get('Email') || '')
          .trim()
          .toLowerCase()
        return rowEmail === email.trim().toLowerCase()
      })

      if (!targetRow) {
        errors.push(`Row not found for email: ${email}`)
        continue
      }

      try {
        targetRow.set('geo_lat', String(lat))
        targetRow.set('geo_lng', String(lng))
        await targetRow.save()
        updated++
      } catch (err) {
        errors.push(`Failed to update ${email}: ${err.message}`)
      }
    }

    // Invalidate members cache so next fetch returns fresh geo data
    invalidateCache(CACHE_KEYS.MEMBERS)

    return { updated, errors }
  })
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
          const phone = row.get('sender_phone') || row.get('Teléfono') || row.get('Telefono') || ''
          const isMembership = row.get('is_membership') || ''
          const isMembershipResolved =
            isMembership !== ''
              ? isMembership.toLowerCase() === 'true'
              : parseFloat(amount) >= MEMBERSHIP_FEE

          return {
            id: index + 1,
            rowNumber: row.rowNumber,
            email,
            phone: phone.trim() || null,
            amount: parseFloat(amount) || 0,
            date,
            source: normalizeSource(source),
            notes,
            is_membership: isMembershipResolved,
            is_membership_explicit: isMembership !== '',
            _sheetName: 'PAYMENTS',
            _raw: row.toObject(),
          }
        })

        // MANUAL_PAYMENTS columns: E-mail, Teléfono, amount, date, payment_type, notes
        const manualPayments = manualRows.map((row, index) => {
          const email = (row.get('E-mail') || row.get('email') || '').trim().toLowerCase()
          const phone = row.get('Teléfono') || row.get('Telefono') || ''
          const amount = row.get('amount') || row.get('Amount') || ''
          const date = row.get('date') || row.get('Date') || row.get('fecha') || ''
          const notes = row.get('notes') || row.get('Notes') || ''

          return {
            id: payments.length + index + 1,
            rowNumber: row.rowNumber,
            email,
            phone: phone.trim() || null,
            amount: parseFloat(amount) || 0,
            date,
            source: 'manual',
            notes,
            is_membership: true,
            is_membership_explicit: false,
            _sheetName: 'MANUAL_PAYMENTS',
            _raw: row.toObject(),
          }
        })

        return [...payments, ...manualPayments]
      })
    },
    forceRefresh
  )
}

/**
 * Write classification to a PAYMENTS sheet row
 * @param {number} rowNumber - 1-indexed sheet row number (from row.rowNumber)
 * @param {boolean|null} isMembership - true/false to classify, null to clear (revert to heuristic)
 * @returns {Promise<{rowNumber: number, is_membership: boolean|null}>}
 */
export async function classifyPayment(rowNumber, isMembership) {
  return withRetry(async () => {
    const doc = await getSpreadsheet()
    const sheet = doc.sheetsByTitle['PAYMENTS']
    if (!sheet) throw new Error('PAYMENTS sheet not found')

    const rows = await sheet.getRows()
    const targetRow = rows.find((r) => r.rowNumber === rowNumber)
    if (!targetRow) throw new Error(`Row ${rowNumber} not found in PAYMENTS sheet`)

    // Validate: payments under $25 cannot be marked as membership
    if (isMembership === true) {
      const amount = parseFloat(
        targetRow.get('Amount') ||
          targetRow.get('Monto') ||
          targetRow.get('Cantidad') ||
          targetRow.get('amount') ||
          '0'
      )
      if (amount < MEMBERSHIP_FEE) {
        throw new Error(
          `Payments under $${MEMBERSHIP_FEE} cannot be marked as membership. Amount: $${amount}`
        )
      }
    }

    if (isMembership === null) {
      targetRow.set('is_membership', '')
    } else {
      targetRow.set('is_membership', isMembership ? 'true' : 'false')
    }
    await targetRow.save({ raw: true })

    // Invalidate both caches: payments data changed, and members depend on payment classification
    invalidateCache(CACHE_KEYS.PAYMENTS)
    invalidateCache(CACHE_KEYS.MEMBERS)

    return { rowNumber, is_membership: isMembership }
  })
}

/**
 * Get a single member by email from the CLEAN sheet.
 * Reuses getMembers() cache for efficiency, enriched with payment data.
 *
 * @param {string} email - Member email to look up
 * @returns {Promise<Object|null>} Member object or null if not found
 */
export async function getMemberByEmail(email) {
  const { data: allMembers } = await getMembers()
  const normalizedEmail = email.trim().toLowerCase()
  return (
    allMembers.find(
      (m) => m.email === normalizedEmail || m.sacEmail?.toLowerCase() === normalizedEmail
    ) || null
  )
}

/**
 * Update editable profile fields for a member in the CLEAN sheet.
 * Creates the photoFileId column if it doesn't exist yet.
 *
 * @param {string} email - Member email (used to find the row)
 * @param {Object} fields - Fields to update (keys map to spreadsheet columns)
 * @returns {Promise<{success: boolean}>}
 */
export async function updateMemberProfile(email, fields) {
  return withRetry(async () => {
    const doc = await getSpreadsheet()
    const sheet = doc.sheetsByTitle['CLEAN']
    if (!sheet) throw new Error('CLEAN sheet not found in spreadsheet')

    // Ensure photoFileId column exists (same pattern as writeGeoData)
    await sheet.loadHeaderRow()
    const headers = sheet.headerValues
    if (!headers.includes('photoFileId')) {
      await sheet.setHeaderRow([...headers, 'photoFileId'])
      await sheet.loadHeaderRow()
    }

    const rows = await sheet.getRows()
    const normalizedEmail = email.trim().toLowerCase()
    const targetRow = rows.find((row) => {
      const rowEmail = (row.get('E-mail') || row.get('email') || row.get('Email') || '')
        .trim()
        .toLowerCase()
      const rowSacEmail = (row.get('sac_email') || row.get('SAC_Email') || '')
        .trim()
        .toLowerCase()
      return rowEmail === normalizedEmail || rowSacEmail === normalizedEmail
    })

    if (!targetRow) throw new Error(`Member not found: ${email}`)

    // Map update field keys to spreadsheet column names
    const fieldMap = {
      firstName: 'Nombre',
      initial: 'Inicial',
      lastName: 'Apellidos',
      town: 'Pueblo',
      postalAddress: 'Dirección postal',
      zipcode: 'Zipcode',
      telescopeModel: 'Modelo de telescopio',
      otherEquipment: 'Otros equipos',
      photoFileId: 'photoFileId',
    }

    const locationFields = ['town', 'postalAddress', 'zipcode']
    const locationChanged = locationFields.some((f) => fields[f] !== undefined)

    for (const [field, column] of Object.entries(fieldMap)) {
      if (fields[field] !== undefined) {
        targetRow.set(column, fields[field])
      }
    }

    // Clear geocoding so the pipeline re-generates coordinates
    if (locationChanged) {
      targetRow.set('geo_lat', '')
      targetRow.set('geo_lng', '')
    }

    await targetRow.save()
    invalidateCache(CACHE_KEYS.MEMBERS)

    return { success: true }
  })
}

// Re-export for testing or direct access
export { getSpreadsheet, MEMBERSHIP_FEE, calculateMembershipStatus }
