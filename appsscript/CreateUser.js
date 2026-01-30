const MAINTENANCE_MODE = true

// #region Testing Entry Points
const TEST_ENTRY_ROWS = {
  RAW: 2,
  CLEAN: 2,
  PAYMENTS: 2,
}

function buildMockEventForRow(sheetName, row) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet()
  const sheet = spreadsheet.getSheetByName(sheetName)

  if (!sheet) {
    throw new Error(`Test sheet ${sheetName} not found`)
  }

  const lastColumn = Math.max(1, sheet.getLastColumn())
  const range = sheet.getRange(row, 1, 1, lastColumn)

  return {
    spreadsheet,
    sheet,
    event: {
      source: spreadsheet,
      range,
    },
  }
}

function test_formIsSubmitted() {
  const { event } = buildMockEventForRow('RAW', TEST_ENTRY_ROWS.RAW)
  handle_formIsSubmitted(event, getMockServices())
}

function test_userEditsRAW() {
  const { event } = buildMockEventForRow('RAW', TEST_ENTRY_ROWS.RAW)
  handle_sheetIsEdited(event, getMockServices())
}

function test_userEditsCLEAN() {
  const { event } = buildMockEventForRow('CLEAN', TEST_ENTRY_ROWS.CLEAN)
  handle_sheetIsEdited(event, getMockServices())
}

function test_userEditsPAYMENTS() {
  const { event } = buildMockEventForRow('PAYMENTS', TEST_ENTRY_ROWS.PAYMENTS)
  handle_sheetIsEdited(event, getMockServices())
}

function test_paymentScanRuns() {
  handle_scheduledPaymentScan(null, getMockServices())
}

function getMockServices() {
  const mockUser = {
    primaryEmail: 'test@example.com',
    name: { familyName: 'Doe', givenName: 'John' },
    emails: [{ address: 'test@example.com', type: 'home' }],
    phones: [{ value: '1234567890', type: 'mobile', primary: true }],
    recoveryEmail: 'test@example.com',
    password: 'password123',
  }
  const mockBody = `
  <div>
    <p><b>Amount:</b> $25.00</p>
    <p><b>From:</b> John Doe-(123) 456-7890</p>
    <p><b>Email:</b> john.a.doe@example.com</p>
    <p><b>Date:</b> May/25/2025, 01:47:24 PM</p>
    <p><b>Message:</b> Thank you for your payment!</p>
    <b>Mock Business Team</b><br />
    Copyright © 2025 Mock Provider, LLC. All rights reserved
  </div>`

  return {
    workspaceDirectory: {
      Users: {
        insert: (user) => {
          logger.log(`Inserted user ${user.primaryEmail}`)
          return {
            ...mockUser,
            primaryEmail: user.primaryEmail,
          }
        },
        get: (email) => {
          if (mockUser.primaryEmail === email) {
            return {
              ...mockUser,
              primaryEmail: email,
            }
          }
          throw new Error('Resource Not Found')
        },
      },
      Members: {
        insert: (member) => {
          logger.log(`Inserted member ${member.email}`)
          return {
            ...mockUser,
            email: member.email,
          }
        },
      },
    },
    gmailApp: {
      // sendEmail: (email, subject, body, options) => {
      //   // Use real Gmail service for sending emails
      //   return GmailApp.sendEmail(email, subject, body, options)
      // },
      sendEmail: (email, subject, body, options) =>
        logger.log(`Sent email: ${email} ${subject} ${body}`),
      search: (query) => {
        logger.log(`Mock search called with query: ${query}`)
        const mockThread = {
          getMessages: () => [
            {
              getFrom: () => EMAIL_FILTER_SENDER,
              getTo: () => EMAIL_FILTER_RECEIVER,
              getSubject: () => 'Mock Subject paid',
              getDate: () => new Date(),
              getId: () => 'mock-msg-1',
              getBody: () => mockBody,
              getRawContent: () =>
                `Original-Sender: mock-original@example.com\r\nReturn-Path: <mock-return@example.com>`,
            },
          ],
        }
        return [mockThread]
      },
    },
    driveApp: {
      getFileById: (id) => {
        return {
          getAs: (mimeType) => ({
            setName: (name) => name,
            name: 'Test welcome pdf.pdf',
            mimeType: mimeType,
            content: 'mock pdf content',
          }),
          makeCopy: () => {
            return {
              getId: () => id,
              setTrashed: () => true,
            }
          },
        }
      },
    },
    documentApp: {
      openById: (id) => ({
        getBody: () => ({
          replaceText: (search, replacement) =>
            logger.log(`Mock replace ${search} -> ${replacement}`),
          findText: (search) => ({ getMatch: () => search }),
        }),
        getName: () => 'Test welcome letter.docx',
        saveAndClose: () => logger.log(`Mock saveAndClose for doc ${id}`),
      }),
    },
  }
}
// #endregion

// #region Membership Status
const MEMBERSHIP_STATUS = {
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  NO_PAYMENT: 'NO_PAYMENT',
}

function buildPaymentsIndex(spreadsheet) {
  const paymentsSheet = spreadsheet.getSheetByName('PAYMENTS')
  if (!paymentsSheet) {
    throw new Error('PAYMENTS sheet not found')
  }
  const data = paymentsSheet.getDataRange().getValues()
  if (!data || data.length < 2) {
    return { emailToPayments: new Map(), phoneToPayments: new Map() }
  }
  const headers = data[0].map((h) =>
    String(h || '')
      .trim()
      .toLowerCase()
  )
  const col = (candidates) => {
    for (let i = 0; i < headers.length; i++) {
      if (candidates.includes(headers[i])) return i
    }
    return -1
  }
  const amountCol = col(['amount', 'monto', 'cantidad'])
  const senderEmailCol = col(['sender email', 'sender_email', 'e-mail', 'email'])
  const senderPhoneCol = col([
    'sender phone',
    'sender_phone',
    'telefono',
    'teléfono',
    'tel',
    'celular',
    'whatsapp',
  ])
  const paymentDateTimeCol = col(['payment datetime', 'payment_datetime'])
  const paymentDateCol = col(['payment date', 'payment_date', 'fecha de pago'])
  const emailDateCol = col(['email date', 'email_date'])
  const paymentTimeCol = col(['payment time', 'payment_time', 'hora'])
  const messageIdCol = col(['message id', 'message_id'])

  const emailToPayments = new Map()
  const phoneToPayments = new Map()

  for (let r = 1; r < data.length; r++) {
    const row = data[r]
    const rawAmount = amountCol !== -1 ? row[amountCol] : ''
    const amount = parseAmountNumber(rawAmount)
    const email = senderEmailCol !== -1 ? normalizeEmail(row[senderEmailCol]) : ''
    const phone = senderPhoneCol !== -1 ? normalizePhone(row[senderPhoneCol]) : ''
    let when = null
    const dt = paymentDateTimeCol !== -1 ? row[paymentDateTimeCol] : null
    if (dt instanceof Date && !isNaN(dt)) when = dt
    if (!when && paymentDateCol !== -1) {
      const d = row[paymentDateCol]
      if (d instanceof Date && !isNaN(d)) when = d
      if (paymentTimeCol !== -1) {
        // best effort: if time is a string, Date parsing handles it poorly; ignore to keep logic simple
      }
    }
    if (!when && emailDateCol !== -1) {
      const ed = row[emailDateCol]
      if (ed instanceof Date && !isNaN(ed)) when = ed
    }
    const messageId = messageIdCol !== -1 ? String(row[messageIdCol] || '') : ''

    if (!email && !phone) continue
    if (!when) continue

    const p = { date: when, amount, messageId, kind: 'AUTO' }
    if (email) {
      const arr = emailToPayments.get(email) || []
      arr.push(p)
      emailToPayments.set(email, arr)
    }
    if (phone) {
      const arr = phoneToPayments.get(phone) || []
      arr.push(p)
      phoneToPayments.set(phone, arr)
    }
  }

  // Include MANUAL_PAYMENTS (optional sheet)
  const manualSheet = spreadsheet.getSheetByName('MANUAL_PAYMENTS')
  if (manualSheet) {
    const mData = manualSheet.getDataRange().getValues()
    if (mData && mData.length > 1) {
      const mHeaders = mData[0].map((h) =>
        String(h || '')
          .trim()
          .toLowerCase()
      )
      const mCol = (cands) => {
        for (let i = 0; i < mHeaders.length; i++) {
          if (cands.includes(mHeaders[i])) return i
        }
        return -1
      }
      const mEmailCol = mCol(['e-mail', 'email'])
      const mPhoneCol = mCol(['teléfono', 'telefono', 'phone', 'tel'])
      const mAmountCol = mCol(['amount', 'monto', 'cantidad'])
      const mDateCol = mCol(['date', 'fecha'])
      const mTypeCol = mCol(['payment_type'])
      for (let r = 1; r < mData.length; r++) {
        const row = mData[r]
        const email = mEmailCol !== -1 ? normalizeEmail(row[mEmailCol]) : ''
        const phone = mPhoneCol !== -1 ? normalizePhone(row[mPhoneCol]) : ''
        let when = null
        const d = mDateCol !== -1 ? row[mDateCol] : null
        if (d instanceof Date && !isNaN(d)) when = d
        else if (typeof d === 'string' && d) {
          const parsed = new Date(d)
          if (!isNaN(parsed)) when = parsed
        }
        const rawAmount = mAmountCol !== -1 ? row[mAmountCol] : ''
        const amount = parseAmountNumber(rawAmount)
        const ptype =
          mTypeCol !== -1
            ? String(row[mTypeCol] || '')
                .trim()
                .toUpperCase()
            : ''
        if (!email && !phone) continue
        if (!when) continue
        const p = {
          date: when,
          amount,
          messageId: '',
          kind: ptype === MANUAL_PAYMENT_TYPE.GIFT ? 'GIFT' : 'MANUAL',
        }
        if (email) {
          const arr = emailToPayments.get(email) || []
          arr.push(p)
          emailToPayments.set(email, arr)
        }
        if (phone) {
          const arr = phoneToPayments.get(phone) || []
          arr.push(p)
          phoneToPayments.set(phone, arr)
        }
      }
    }
  }

  return { emailToPayments, phoneToPayments }
}

function parseAmountNumber(value) {
  if (value === null || value === undefined) return NaN
  if (typeof value === 'number') return value
  const txt = String(value)
    .replace(/[^0-9.,-]/g, '')
    .replace(/,/g, '')
  const num = parseFloat(txt)
  return isNaN(num) ? NaN : num
}

function getMembershipStatusForMember(input, options) {
  // input: { sacEmail?, personalEmail?, phone? }
  // options: { spreadsheet?, paymentsIndex?, membershipFee? }
  const membershipFee = options && options.membershipFee ? options.membershipFee : MEMBERSHIP_FEE
  const spreadsheet =
    options && options.spreadsheet ? options.spreadsheet : SpreadsheetApp.openById(SPREADSHEET_ID)
  const paymentsIndex =
    options && options.paymentsIndex ? options.paymentsIndex : buildPaymentsIndex(spreadsheet)
  const now = new Date()

  const personal = normalizeEmail(input && input.personalEmail)
  const phoneKey = normalizePhone(input && input.phone)

  // Collect candidate payments once, dedup by messageId
  const candidates = []
  const seen = new Set()

  const pushPayments = (arr) => {
    if (!arr) return
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i]
      const id = p.messageId || `${p.date.getTime()}-${p.amount}`
      if (!seen.has(id)) {
        candidates.push(p)
        seen.add(id)
      }
    }
  }

  if (personal && paymentsIndex.emailToPayments.has(personal))
    pushPayments(paymentsIndex.emailToPayments.get(personal))
  if (phoneKey && paymentsIndex.phoneToPayments.has(phoneKey))
    pushPayments(paymentsIndex.phoneToPayments.get(phoneKey))

  if (candidates.length === 0) {
    return {
      status: MEMBERSHIP_STATUS.NO_PAYMENT,
      reason: 'No valid membership payments found',
      lastValidPayment: null,
    }
  }

  // Find latest valid payment across all time
  let latestValid = null
  for (let i = 0; i < candidates.length; i++) {
    const p = candidates[i]
    const isGift = p.kind === MANUAL_PAYMENT_TYPE.GIFT || p.kind === 'GIFT'
    const amountOk = typeof p.amount === 'number' && p.amount === membershipFee
    if (isGift || amountOk) {
      if (!latestValid || p.date > latestValid.date) latestValid = p
    }
  }

  if (!latestValid) {
    return {
      status: MEMBERSHIP_STATUS.NO_PAYMENT,
      reason: 'Payments exist but none with required fee',
      lastValidPayment: null,
    }
  }

  // Rolling one-year validity: now < (lastValid + 1 year) => ACTIVE
  const until = new Date(latestValid.date.getTime())
  until.setFullYear(until.getFullYear() + 1)
  const isActive = now < until

  return {
    status: isActive ? MEMBERSHIP_STATUS.ACTIVE : MEMBERSHIP_STATUS.EXPIRED,
    reason: '',
    lastValidPayment: {
      message_id: latestValid.messageId || '',
      date: latestValid.date,
      amount: latestValid.amount,
    },
  }
}

function ensureMembershipStatusSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName('MEMBERSHIP_STATUS')
  if (!sheet) {
    sheet = spreadsheet.insertSheet('MEMBERSHIP_STATUS')
    sheet
      .getRange(1, 1, 1, 7)
      .setValues([
        [
          'Nombre',
          'Inicial',
          'Apellidos',
          'E-mail',
          'Teléfono',
          'membership_status',
          'last_checked',
        ],
      ])
  }
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
  // Normalize headers map for lookups
  const norm = headers.map((h) =>
    String(h || '')
      .trim()
      .toLowerCase()
  )
  const idx = (name) => norm.indexOf(String(name || '').toLowerCase())
  return {
    sheet,
    headers,
    columns: {
      nombre: idx('nombre'),
      inicial: idx('inicial'),
      apellidos: idx('apellidos'),
      email: idx('e-mail'),
      telefono: idx('teléfono') !== -1 ? idx('teléfono') : idx('telefono'),
      status: idx('membership_status'),
      lastChecked: idx('last_checked'),
    },
  }
}
// #endregion

// #region Manual Overrides
let MANUAL_OVERRIDE_RANGE = '' // Manual override range, e.g. '5-15'

function manual_sendTestEmail() {
  setupServices({})
  // Use a template that delivers to NOTIFICATION_EMAIL to test lazy loading
  const userData = {
    firstName: 'Test',
    initial: '',
    lastName: 'User',
    slastName: '',
    email: 'test@example.com',
    phone: '',
  }
  const result = sendTemplatedEmail('EMAIL_CREATION_FAILURE', userData)
  if (result.success) {
    Logger.log('Test template email sent successfully (lazy load verified)')
  } else {
    Logger.log('Test template email failed: ' + result.error)
  }
}

function manual_reprocessRawSheet() {
  setupServices({})

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID)
  const rawSheet = spreadsheet.getSheetByName('RAW')

  if (!rawSheet) {
    logger.log('RAW sheet not found for manual reprocessing')
    return
  }

  const lastRow = rawSheet.getLastRow()
  if (lastRow <= 1) {
    logger.log('RAW sheet has no data rows to process')
    return
  }

  let startRow = 2
  let endRow = lastRow
  if (MANUAL_OVERRIDE_RANGE) {
    const parts = MANUAL_OVERRIDE_RANGE.split('-')
      .map((part) => part.trim())
      .filter(Boolean)
    if (parts.length > 0) {
      const parsedStart = parseInt(parts[0], 10)
      if (!isNaN(parsedStart)) {
        startRow = Math.max(2, parsedStart)
      }
    }
    if (parts.length > 1) {
      const parsedEnd = parseInt(parts[1], 10)
      if (!isNaN(parsedEnd)) {
        endRow = Math.min(lastRow, parsedEnd)
      }
    }
  }

  if (endRow < startRow) {
    logger.log(`Manual reprocess aborted: invalid range ${startRow}-${endRow}`)
    return
  }

  const rowsToProcess = endRow - startRow + 1
  logger.log(
    `Manual reprocess starting: processing ${rowsToProcess} row(s) from RAW (range ${startRow}-${endRow})`
  )

  let processed = 0
  for (let row = startRow; row <= endRow; row++) {
    const range = rawSheet.getRange(row, 1, 1, rawSheet.getLastColumn())
    const event = {
      source: spreadsheet,
      range,
    }

    try {
      handleFormSubmission(event)
      processed++
    } catch (error) {
      logger.log(`Manual reprocess failed at row ${row}: ${error.message}`)
    }
  }

  logger.log(`Manual reprocess completed: ${processed} row(s) handled from RAW`)
}

function manual_normalizePhonesInClean() {
  setupServices({})

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID)
  const cleanSheet = spreadsheet.getSheetByName('CLEAN')

  if (!cleanSheet) {
    logger.log('CLEAN sheet not found for phone normalization')
    return
  }

  const lastRow = cleanSheet.getLastRow()
  if (lastRow <= 1) {
    logger.log('CLEAN sheet has no data rows to process')
    return
  }

  const headers = cleanSheet.getRange(1, 1, 1, cleanSheet.getLastColumn()).getValues()[0]
  const phoneColIndex = findPhoneColumnIndex(headers)
  if (phoneColIndex === -1) {
    logger.log('Phone column not found in CLEAN; aborting normalization')
    return
  }

  let startRow = 2
  let endRow = lastRow
  if (MANUAL_OVERRIDE_RANGE) {
    const parts = MANUAL_OVERRIDE_RANGE.split('-')
      .map((part) => part.trim())
      .filter(Boolean)
    if (parts.length > 0) {
      const parsedStart = parseInt(parts[0], 10)
      if (!isNaN(parsedStart)) startRow = Math.max(2, parsedStart)
    }
    if (parts.length > 1) {
      const parsedEnd = parseInt(parts[1], 10)
      if (!isNaN(parsedEnd)) endRow = Math.min(lastRow, parsedEnd)
    }
  }

  if (endRow < startRow) {
    logger.log(`Phone normalization aborted: invalid range ${startRow}-${endRow}`)
    return
  }

  let updated = 0
  for (let row = startRow; row <= endRow; row++) {
    try {
      const cell = cleanSheet.getRange(row, phoneColIndex + 1)
      const value = cell.getValue()
      const formatted = formatPhoneForSheet(value)
      if (String(value) !== formatted && formatted) {
        cell.setValue(formatted)
        updated++
      }
    } catch (e) {
      logger.log(`Phone normalization failed at row ${row}: ${e.message}`)
    }
  }

  logger.log(
    `Phone normalization completed: updated ${updated} row(s) in CLEAN (${startRow}-${endRow})`
  )
}

const ENABLE_WORKSPACE_ADDITION = false
function manual_reconcileCleanWithWorkspace() {
  setupServices({})

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID)
  const cleanSheet = spreadsheet.getSheetByName('CLEAN')

  if (!cleanSheet) {
    logger.log('CLEAN sheet not found for manual reconciliation')
    return
  }

  const lastRow = cleanSheet.getLastRow()
  if (lastRow <= 1) {
    logger.log('CLEAN sheet has no data rows to process')
    return
  }

  // Determine range
  let startRow = 2
  let endRow = lastRow
  if (MANUAL_OVERRIDE_RANGE) {
    const parts = MANUAL_OVERRIDE_RANGE.split('-')
      .map((part) => part.trim())
      .filter(Boolean)
    if (parts.length > 0) {
      const parsedStart = parseInt(parts[0], 10)
      if (!isNaN(parsedStart)) {
        startRow = Math.max(2, parsedStart)
      }
    }
    if (parts.length > 1) {
      const parsedEnd = parseInt(parts[1], 10)
      if (!isNaN(parsedEnd)) {
        endRow = Math.min(lastRow, parsedEnd)
      }
    }
  }

  if (endRow < startRow) {
    logger.log(`Manual reconcile aborted: invalid range ${startRow}-${endRow}`)
    return
  }

  const headers = cleanSheet.getRange(1, 1, 1, cleanSheet.getLastColumn()).getValues()[0]
  const idx = (candidates) => {
    const normalized = headers.map((h) =>
      String(h || '')
        .trim()
        .toLowerCase()
    )
    for (let i = 0; i < normalized.length; i++) {
      if (candidates.includes(normalized[i])) return i
    }
    return -1
  }

  const firstNameIdx = idx(['nombre', 'first name', 'first_name'])
  const initialIdx = idx(['inicial', 'initial'])
  const fullLastNameIdx = idx(['apellidos', 'last name', 'last_name'])
  const emailIdx = idx(['e-mail', 'email'])
  const phoneIdx = findPhoneColumnIndex(headers)
  let sacEmailIdx = headers.indexOf('sac_email')
  const createdAtIdx = headers.indexOf('created_at')
  const dataStatusIdx = headers.indexOf('data_status')

  // Ensure sac_email column exists
  if (sacEmailIdx === -1) {
    const lastCol = cleanSheet.getLastColumn()
    cleanSheet.insertColumnAfter(lastCol)
    const newCol = lastCol + 1
    cleanSheet.getRange(1, newCol).setValue('sac_email')
    sacEmailIdx = newCol - 1
  }

  const rowsToProcess = endRow - startRow + 1
  logger.log(
    `Manual reconcile starting: processing ${rowsToProcess} row(s) from CLEAN (range ${startRow}-${endRow})`
  )

  let processed = 0
  let matched = 0
  let updated = 0
  // New counters
  let withSacEmails = 0
  let activeNoSac = 0
  let noPaymentWithSac = 0
  let noPaymentNoSac = 0

  // Load MEMBERSHIP_STATUS for lookups (optional)
  const membershipSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(
    'MEMBERSHIP_STATUS'
  )
  let msEmailCol = -1,
    msPhoneCol = -1,
    msStatusCol = -1,
    msData = []
  if (membershipSheet) {
    const msAll = membershipSheet.getDataRange().getValues()
    if (msAll && msAll.length > 1) {
      const msHeaders = msAll[0]
      const msNorm = msHeaders.map((h) =>
        String(h || '')
          .trim()
          .toLowerCase()
      )
      const f = (c) => msNorm.indexOf(c)
      msEmailCol = f('e-mail')
      msPhoneCol = f('teléfono') !== -1 ? f('teléfono') : f('telefono')
      msStatusCol = f('membership_status')
      msData = msAll
    }
  }
  const getMembershipStatus = (email, phone) => {
    if (!msData.length || msStatusCol === -1) return ''
    const lcEmail = normalizeEmail(email)
    const normPhone = normalizePhone(phone)
    for (let i = 1; i < msData.length; i++) {
      const row = msData[i]
      const e = msEmailCol !== -1 ? normalizeEmail(row[msEmailCol]) : ''
      const p = msPhoneCol !== -1 ? normalizePhone(row[msPhoneCol]) : ''
      if ((lcEmail && e && lcEmail === e) || (!lcEmail && normPhone && p && normPhone === p)) {
        return String(row[msStatusCol] || '')
          .trim()
          .toUpperCase()
      }
    }
    return ''
  }
  for (let row = startRow; row <= endRow; row++) {
    try {
      const rowValues = cleanSheet.getRange(row, 1, 1, cleanSheet.getLastColumn()).getValues()[0]

      // Skip if data_status exists and is not VALID (conservative to avoid false positives)
      if (dataStatusIdx !== -1) {
        const rawStatus = String(rowValues[dataStatusIdx] || '')
          .trim()
          .toUpperCase()
        if (rawStatus && rawStatus !== 'VALID') {
          logger.log(`Row ${row} skipped due to data_status=${rawStatus}`)
          continue
        }
      }

      const firstName = firstNameIdx !== -1 ? String(rowValues[firstNameIdx] || '').trim() : ''
      const initial = initialIdx !== -1 ? String(rowValues[initialIdx] || '').trim() : ''
      const fullLastName =
        fullLastNameIdx !== -1 ? String(rowValues[fullLastNameIdx] || '').trim() : ''
      const personalEmail =
        emailIdx !== -1
          ? String(rowValues[emailIdx] || '')
              .trim()
              .toLowerCase()
          : ''
      const phone = phoneIdx !== -1 ? String(rowValues[phoneIdx] || '') : ''
      const existingSac =
        sacEmailIdx !== -1
          ? String(rowValues[sacEmailIdx] || '')
              .trim()
              .toLowerCase()
          : ''

      // If sac_email already present, count and evaluate membership status, then skip
      if (existingSac) {
        withSacEmails++
        const ms = getMembershipStatus(personalEmail, phone)
        if (ms && ms !== 'ACTIVE') {
          noPaymentWithSac++
        }
        processed++
        continue
      }

      let lastName = ''
      let slastName = ''
      if (fullLastName) {
        const parts = fullLastName.split(/[\s-]/)
        lastName = parts[0] || ''
        slastName = parts[1] || ''
      }

      // 1) If sac_email exists, verify
      let confirmedEmail = ''
      if (existingSac) {
        try {
          const u = workspaceDirectory.Users.get(existingSac)
          if (u && u.primaryEmail) {
            confirmedEmail = existingSac
          }
        } catch (e) {}
      }

      // 2) If not confirmed, discover by candidate generation
      if (!confirmedEmail) {
        const candidates = generateEmailCandidates(
          { firstName, initial, lastName, slastName },
          SAC_DOMAIN
        )

        for (const cand of candidates) {
          try {
            const u = workspaceDirectory.Users.get(cand)
            if (u && u.primaryEmail) {
              confirmedEmail = cand
              break
            }
          } catch (e) {
            // ignore and continue on not found or errors
          }
        }
      }

      if (!confirmedEmail) {
        const ms = getMembershipStatus(personalEmail, phone)
        if (ms === 'ACTIVE') {
          const displayName = `${firstName || ''} ${fullLastName || ''}`.trim()
          const idStr = personalEmail || phone || '[no id]'
          if (ENABLE_WORKSPACE_ADDITION) {
            // Attempt to create Workspace user and assign sac_email
            let lastName = ''
            let slastName = ''
            if (fullLastName) {
              const parts = fullLastName.split(/[\s-]/)
              lastName = parts[0] || ''
              slastName = parts[1] || ''
            }
            const userData = {
              firstName: firstName || '',
              initial: initial || '',
              lastName,
              slastName,
              email: personalEmail || '',
              phone: normalizePhone(phone || ''),
            }
            const accountResult = createUserAccount(userData)
            if (accountResult && accountResult.success && accountResult.email) {
              // Write sac_email and created_at
              cleanSheet.getRange(row, sacEmailIdx + 1).setValue(accountResult.email)
              if (createdAtIdx !== -1) {
                cleanSheet.getRange(row, createdAtIdx + 1).setValue(new Date())
              }
              // Send simple credentials email to personal email
              try {
                const to = personalEmail || ''
                if (to) {
                  const subject = 'Tu cuenta SAC / Your SAC account'
                  const body =
                    `Hola ${firstName || ''} ${fullLastName || ''},\n\n` +
                    `Se ha creado tu cuenta de la Sociedad de Astronomía del Caribe.\n` +
                    `Correo (SAC): ${accountResult.email}\n` +
                    `Contraseña temporera: ${accountResult.password}\n\n` +
                    `Primeros pasos:\n` +
                    `1) Entra a https://mail.google.com\n` +
                    `2) Accede con tu correo SAC y la contraseña temporera\n` +
                    `3) El sistema te pedirá cambiarla en el primer inicio de sesión\n\n` +
                    `Gracias.\n\n` +
                    `— SAC`
                  const options = {}
                  if (CC_EMAIL) options.cc = CC_EMAIL
                  if (BCC_EMAIL) options.bcc = BCC_EMAIL
                  gmailApp.sendEmail(to, subject, body, options)
                }
              } catch (e) {
                logger.log(`[WARN] Failed to send simple credentials email: ${e.message}`)
              }
              withSacEmails++
              updated++
              logger.log(
                `[INFO] Created sac_email for ACTIVE user ${displayName}: ${accountResult.email} (was ${idStr})`
              )
              processed++
              continue
            } else {
              logger.log(
                `[WARN] Failed to create sac_email for ACTIVE user ${displayName} (${idStr}): ${
                  (accountResult && accountResult.error) || 'unknown error'
                }`
              )
              activeNoSac++
              processed++
              continue
            }
          } else {
            logger.log(`[WARN] ACTIVE user without sac_email: ${displayName} (${idStr})`)
            activeNoSac++
            processed++
            continue
          }
        } else {
          noPaymentNoSac++
          processed++
          continue
        }
      }

      matched++

      // Write sac_email immediately
      cleanSheet.getRange(row, sacEmailIdx + 1).setValue(confirmedEmail)
      withSacEmails++

      // Fetch user to obtain creation date; prefer reusing object from last check if available
      let userForDate = null
      try {
        userForDate = workspaceDirectory.Users.get(confirmedEmail)
      } catch (e) {
        // ignore; we'll fallback to now if column is empty
      }
      const createdAtFromUser = getUserCreationDate(userForDate)

      // Set created_at: prefer Directory creation date; if none and blank, set now
      if (createdAtIdx !== -1) {
        const curr = rowValues[createdAtIdx]
        if (createdAtFromUser) {
          cleanSheet.getRange(row, createdAtIdx + 1).setValue(createdAtFromUser)
          updated++
        } else if (!curr) {
          cleanSheet.getRange(row, createdAtIdx + 1).setValue(new Date())
          updated++
        }
      }

      // Single summary log per reconciled user
      try {
        const displayName = `${firstName || ''} ${fullLastName || ''}`.trim()
        const tz = Session.getScriptTimeZone && Session.getScriptTimeZone()
        const createdValue = createdAtFromUser
          ? utilities && tz
            ? utilities.formatDate(createdAtFromUser, tz, 'yyyy-MM-dd HH:mm:ss')
            : createdAtFromUser.toString()
          : createdAtIdx !== -1
          ? String(cleanSheet.getRange(row, createdAtIdx + 1).getValue() || '')
          : ''
        logger.log(
          `Reconciled ${displayName || '[unknown name]'}: sac_email=${confirmedEmail}` +
            (createdValue ? `, created_at=${createdValue}` : '')
        )
      } catch (e) {}

      processed++
    } catch (error) {
      logger.log(`Manual reconcile failed at row ${row}: ${error.message}`)
    }
  }

  logger.log(
    `Manual reconcile completed: processed=${processed}, matched=${matched}, updated=${updated}`
  )
  logger.log(
    `Manual reconcile membership summary: with_sac_emails=${withSacEmails}, active_no_sac=${activeNoSac}, no_payment_with_sac=${noPaymentWithSac}, no_payment_no_sac=${noPaymentNoSac}`
  )
}

function manual_validateNewUsersExists() {
  setupServices({})

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID)
  const cleanSheet = spreadsheet.getSheetByName('CLEAN')
  const newMembersSheet = spreadsheet.getSheetByName('NEW_MEMBERS_2025')

  if (!cleanSheet || !newMembersSheet) {
    logger.log('CLEAN or NEW_MEMBERS_2025 sheet not found')
    return
  }

  const newMembersLastRow = newMembersSheet.getLastRow()
  if (newMembersLastRow <= 1) {
    logger.log('NEW_MEMBERS_2025 sheet has no data rows to process')
    return
  }

  const newMembersHeaders = newMembersSheet
    .getRange(1, 1, 1, newMembersSheet.getLastColumn())
    .getValues()[0]
  const newMembersEmailIdx = newMembersHeaders.indexOf('E-mail')
  const newMembersPhoneIdx = findPhoneColumnIndex(newMembersHeaders)
  const firstNameIdx =
    newMembersHeaders.indexOf('Nombre') !== -1
      ? newMembersHeaders.indexOf('Nombre')
      : newMembersHeaders.indexOf('first name') !== -1
      ? newMembersHeaders.indexOf('first name')
      : -1
  const lastNameIdx =
    newMembersHeaders.indexOf('Apellidos') !== -1
      ? newMembersHeaders.indexOf('Apellidos')
      : newMembersHeaders.indexOf('last name') !== -1
      ? newMembersHeaders.indexOf('last name')
      : -1

  if (newMembersEmailIdx === -1) {
    logger.log('E-mail column not found in NEW_MEMBERS_2025')
    return
  }

  // Determine range for NEW_MEMBERS_2025
  let startRow = 2
  let endRow = newMembersLastRow
  if (MANUAL_OVERRIDE_RANGE) {
    const parts = MANUAL_OVERRIDE_RANGE.split('-')
      .map((part) => part.trim())
      .filter(Boolean)
    if (parts.length > 0) {
      const parsedStart = parseInt(parts[0], 10)
      if (!isNaN(parsedStart)) startRow = Math.max(2, parsedStart)
    }
    if (parts.length > 1) {
      const parsedEnd = parseInt(parts[1], 10)
      if (!isNaN(parsedEnd)) endRow = Math.min(newMembersLastRow, parsedEnd)
    }
  }

  if (endRow < startRow) {
    logger.log(`User existence validation aborted: invalid range ${startRow}-${endRow}`)
    return
  }

  // Get all emails from CLEAN for fast lookup
  const cleanData = cleanSheet.getDataRange().getValues()
  const cleanHeaders = cleanData[0]
  const cleanEmailIdx = cleanHeaders.indexOf('E-mail')
  if (cleanEmailIdx === -1) {
    logger.log('E-mail column not found in CLEAN')
    return
  }

  const cleanEmails = new Set()
  for (let i = 1; i < cleanData.length; i++) {
    const email = String(cleanData[i][cleanEmailIdx] || '')
      .trim()
      .toLowerCase()
    if (email) cleanEmails.add(email)
  }

  logger.log(`Loaded ${cleanData.length - 1} emails from CLEAN for lookup`)

  // Iterate NEW_MEMBERS_2025 and check existence
  const foundUsers = []
  const notFoundUsers = []
  const withValidPayments = []
  const withoutValidPayments = []
  const paymentsIndex = buildPaymentsIndex(spreadsheet)
  for (let row = startRow; row <= endRow; row++) {
    try {
      const rowValues = newMembersSheet
        .getRange(row, 1, 1, newMembersSheet.getLastColumn())
        .getValues()[0]
      const personalEmail = String(rowValues[newMembersEmailIdx] || '')
        .trim()
        .toLowerCase()
      const phoneRaw = newMembersPhoneIdx !== -1 ? rowValues[newMembersPhoneIdx] : ''
      const phone = normalizePhone(phoneRaw)

      if (!personalEmail) continue

      const firstName = String(rowValues[firstNameIdx] || '').trim()
      const lastName = String(rowValues[lastNameIdx] || '').trim()
      const displayName = `${firstName} ${lastName}`.trim() || '[unknown name]'

      if (cleanEmails.has(personalEmail)) {
        foundUsers.push(`${displayName} (${personalEmail}) [row ${row}]`)
      } else {
        notFoundUsers.push(`${displayName} (${personalEmail}) [row ${row}]`)
      }

      // Check valid payment status (ACTIVE = valid within rolling year; gifts count)
      try {
        const status = getMembershipStatusForMember(
          { personalEmail, phone },
          { spreadsheet, paymentsIndex }
        )
        if (status && status.status === MEMBERSHIP_STATUS.ACTIVE) {
          withValidPayments.push({ email: personalEmail, phone })
        } else {
          withoutValidPayments.push({ email: personalEmail, phone })
        }
      } catch (e) {
        logger.log(`Payment status check failed for ${personalEmail} at row ${row}: ${e.message}`)
      }
    } catch (e) {
      logger.log(`Error processing NEW_MEMBERS_2025 row ${row}: ${e.message}`)
    }
  }

  // Log summaries
  logger.log(`USERS FOUND IN CLEAN: ${foundUsers.length}`)
  logger.log(
    `USERS NOT FOUND IN CLEAN: ${notFoundUsers.length} ${notFoundUsers.join(', ') || 'none'}`
  )
  logger.log(`USERS WITH VALID PAYMENTS: ${withValidPayments.length}`)
  logger.log(`USERS WITHOUT VALID PAYMENTS: ${withoutValidPayments.length}`)
  for (let i = 0; i < withoutValidPayments.length; i++) {
    const u = withoutValidPayments[i]
    const emailStr = u.email || ''
    const phoneStr = u.phone || ''
    logger.log(`${emailStr}${emailStr && phoneStr ? ' ' : ''}${phoneStr}`)
  }

  if (notFoundUsers.length > 0) {
    logger.log('[WARN] Not found users may need to be added to CLEAN manually')
  }
}

function manual_membershipStatusCheck() {
  setupServices({})
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID)
  const cleanSheet = spreadsheet.getSheetByName('CLEAN')
  if (!cleanSheet) {
    logger.log('CLEAN sheet not found for membership status logging')
    return
  }
  const paymentsIndex = buildPaymentsIndex(spreadsheet)
  const statusSheetInfo = ensureMembershipStatusSheet(spreadsheet)
  const statusSheet = statusSheetInfo.sheet
  const statusHeaders = statusSheetInfo.headers
  const statusCols = statusSheetInfo.columns
  const lastRow = cleanSheet.getLastRow()
  if (lastRow <= 1) {
    logger.log('CLEAN sheet has no data rows to process')
    return
  }
  const headers = cleanSheet.getRange(1, 1, 1, cleanSheet.getLastColumn()).getValues()[0]
  const norm = headers.map((h) =>
    String(h || '')
      .trim()
      .toLowerCase()
  )
  const col = (cands) => {
    for (let i = 0; i < norm.length; i++) {
      if (cands.includes(norm[i])) return i
    }
    return -1
  }
  const firstNameIdx = col(['nombre', 'first name', 'first_name'])
  const initialIdx = col(['inicial', 'initial'])
  const fullLastNameIdx = col(['apellidos', 'last name', 'last_name'])
  const sacEmailIdx = headers.indexOf('sac_email')
  const personalEmailIdx = col(['e-mail', 'email'])
  const phoneIdx = findPhoneColumnIndex(headers)

  let processed = 0
  let active = 0
  let expired = 0
  let noPayment = 0
  let startRow = 2
  let endRow = lastRow
  if (MANUAL_OVERRIDE_RANGE) {
    const parts = MANUAL_OVERRIDE_RANGE.split('-')
      .map((part) => part.trim())
      .filter(Boolean)
    if (parts.length > 0) {
      const parsedStart = parseInt(parts[0], 10)
      if (!isNaN(parsedStart)) startRow = Math.max(2, parsedStart)
    }
    if (parts.length > 1) {
      const parsedEnd = parseInt(parts[1], 10)
      if (!isNaN(parsedEnd)) endRow = Math.min(lastRow, parsedEnd)
    }
  }
  if (endRow < startRow) {
    logger.log(`Membership logging aborted: invalid range ${startRow}-${endRow}`)
    return
  }

  // Build lookup maps for upsert in MEMBERSHIP_STATUS
  const statusData = statusSheet.getDataRange().getValues()
  const emailToRow = new Map()
  const phoneToRow = new Map()
  if (statusData && statusData.length > 1) {
    for (let r = 1; r < statusData.length; r++) {
      const row = statusData[r]
      const emailVal =
        statusCols.email !== -1
          ? String(row[statusCols.email] || '')
              .trim()
              .toLowerCase()
          : ''
      const telVal = statusCols.telefono !== -1 ? normalizePhone(row[statusCols.telefono]) : ''
      if (emailVal) emailToRow.set(emailVal, r + 1) // 1-based row
      if (telVal) phoneToRow.set(telVal, r + 1)
    }
  }

  for (let row = startRow; row <= endRow; row++) {
    try {
      const rowValues = cleanSheet.getRange(row, 1, 1, cleanSheet.getLastColumn()).getValues()[0]
      const firstName = firstNameIdx !== -1 ? String(rowValues[firstNameIdx] || '').trim() : ''
      const initial = initialIdx !== -1 ? String(rowValues[initialIdx] || '').trim() : ''
      const fullLastName =
        fullLastNameIdx !== -1 ? String(rowValues[fullLastNameIdx] || '').trim() : ''
      const sacEmail =
        sacEmailIdx !== -1
          ? String(rowValues[sacEmailIdx] || '')
              .trim()
              .toLowerCase()
          : ''
      const personalEmail =
        personalEmailIdx !== -1
          ? String(rowValues[personalEmailIdx] || '')
              .trim()
              .toLowerCase()
          : ''
      const phone = phoneIdx !== -1 ? normalizePhone(rowValues[phoneIdx]) : ''

      const displayName = `${firstName || ''} ${fullLastName || ''}`.trim() || '[unknown]'
      const status = getMembershipStatusForMember(
        { sacEmail, personalEmail, phone },
        { spreadsheet, paymentsIndex }
      )

      if (status && status.status) {
        if (status.status === MEMBERSHIP_STATUS.ACTIVE) active++
        else if (status.status === MEMBERSHIP_STATUS.EXPIRED) expired++
        else if (status.status === MEMBERSHIP_STATUS.NO_PAYMENT) noPayment++
      }

      // Prepare upsert payload aligned to MEMBERSHIP_STATUS headers
      const emailForKey = personalEmail || ''
      const phoneForKey = phone || ''
      const payload = new Array(statusHeaders.length).fill('')
      if (statusCols.nombre !== -1) payload[statusCols.nombre] = firstName
      if (statusCols.inicial !== -1) payload[statusCols.inicial] = initial
      if (statusCols.apellidos !== -1) payload[statusCols.apellidos] = fullLastName
      if (statusCols.email !== -1) payload[statusCols.email] = personalEmail || ''
      if (statusCols.telefono !== -1) payload[statusCols.telefono] = phoneForKey
      if (statusCols.status !== -1) payload[statusCols.status] = status.status || ''
      if (statusCols.lastChecked !== -1) payload[statusCols.lastChecked] = new Date()

      // Find existing row by email, else phone
      let targetRow = null
      if (emailForKey && emailToRow.has(emailForKey)) {
        targetRow = emailToRow.get(emailForKey)
      } else if (!emailForKey && phoneForKey && phoneToRow.has(phoneForKey)) {
        targetRow = phoneToRow.get(phoneForKey)
      }

      if (targetRow) {
        statusSheet.getRange(targetRow, 1, 1, payload.length).setValues([payload])
      } else {
        statusSheet.appendRow(payload)
        const newRowNum = statusSheet.getLastRow()
        if (emailForKey) emailToRow.set(emailForKey, newRowNum)
        else if (phoneForKey) phoneToRow.set(phoneForKey, newRowNum)
      }

      processed++
    } catch (e) {
      logger.log(`Error logging membership for CLEAN row ${row}: ${e.message}`)
    }
  }
  logger.log(
    `Membership status logging completed: processed=${processed}, ACTIVE=${active}, EXPIRED=${expired}, NO_PAYMENT=${noPayment}`
  )
}

function manual_reconcileRenewal() {
  setupServices({})
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID)
  const renewalsSheet = spreadsheet.getSheetByName(RENEWAL_SHEET_NAME)
  const cleanSheet = spreadsheet.getSheetByName('CLEAN')
  const manualSheet =
    spreadsheet.getSheetByName('MANUAL_PAYMENTS') || spreadsheet.insertSheet('MANUAL_PAYMENTS')

  if (!renewalsSheet || !cleanSheet) {
    logger.log('RENEWAL_MEMBERS_2025 or CLEAN sheet not found')
    return
  }

  // Prepare MANUAL_PAYMENTS headers if first time
  if (manualSheet.getLastRow() === 0) {
    manualSheet
      .getRange(1, 1, 1, 6)
      .setValues([['E-mail', 'Teléfono', 'amount', 'date', 'payment_type', 'notes']])
  }

  // Build PAYMENTS index once
  const paymentsIndex = buildPaymentsIndex(spreadsheet)

  const lastRow = renewalsSheet.getLastRow()
  if (lastRow <= 1) {
    logger.log(`${RENEWAL_SHEET_NAME} has no data rows to process`)
    return
  }

  // Helpers for headers
  const renewHeaders = renewalsSheet.getRange(1, 1, 1, renewalsSheet.getLastColumn()).getValues()[0]
  const normRenew = renewHeaders.map((h) =>
    String(h || '')
      .trim()
      .toLowerCase()
  )
  const rcol = (cands) => {
    for (let i = 0; i < normRenew.length; i++) if (cands.includes(normRenew[i])) return i
    return -1
  }
  const rEmailIdx = rcol(['e-mail', 'email'])
  const rPhoneIdx = rcol(['teléfono', 'telefono', 'phone', 'tel'])

  const cleanHeaders = cleanSheet.getRange(1, 1, 1, cleanSheet.getLastColumn()).getValues()[0]
  const cleanEmailIdx = cleanHeaders.indexOf('E-mail')
  const cleanPhoneIdx = findPhoneColumnIndex(cleanHeaders)

  // Manual payments index for dedupe/update (by email/phone for RENEWAL_YEAR)
  const mData = manualSheet.getDataRange().getValues()
  const mHeaders = mData[0] || []
  const mNorm = mHeaders.map((h) =>
    String(h || '')
      .trim()
      .toLowerCase()
  )
  const mcol = (cands) => {
    for (let i = 0; i < mNorm.length; i++) if (cands.includes(mNorm[i])) return i
    return -1
  }
  const mEmailCol = mcol(['e-mail', 'email'])
  const mPhoneCol = mcol(['teléfono', 'telefono', 'phone', 'tel'])
  const mAmountCol = mcol(['amount', 'monto'])
  const mDateCol = mcol(['date', 'fecha'])
  const mTypeCol = mcol(['payment_type'])
  const mNotesCol = mcol(['notes'])
  const manualRows = mData.slice(1)

  const findManualRowForYear = (email, phone) => {
    if (!manualRows || manualRows.length === 0) return -1
    for (let i = 0; i < manualRows.length; i++) {
      const row = manualRows[i]
      const emailVal = mEmailCol !== -1 ? normalizeEmail(row[mEmailCol]) : ''
      const phoneVal = mPhoneCol !== -1 ? normalizePhone(row[mPhoneCol]) : ''
      const d = mDateCol !== -1 ? row[mDateCol] : null
      let year = null
      if (d instanceof Date && !isNaN(d)) year = d.getFullYear()
      else if (typeof d === 'string' && d) {
        const parsed = new Date(d)
        if (!isNaN(parsed)) year = parsed.getFullYear()
      }
      if (year !== RENEWAL_YEAR) continue
      if (
        (email && emailVal && emailVal === email) ||
        (!email && phone && phoneVal && phoneVal === phone)
      ) {
        return i + 2 // data starts at row 2
      }
    }
    return -1
  }

  // Counters
  let processed = 0
  let skippedMissingClean = 0
  let skippedWithValidPayment = 0
  let manualUpdated = 0
  let manualInserted = 0

  // Determine range per MANUAL_OVERRIDE_RANGE
  let startRow = 2
  let endRow = lastRow
  if (MANUAL_OVERRIDE_RANGE) {
    const parts = MANUAL_OVERRIDE_RANGE.split('-')
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length > 0) {
      const a = parseInt(parts[0], 10)
      if (!isNaN(a)) startRow = Math.max(2, a)
    }
    if (parts.length > 1) {
      const b = parseInt(parts[1], 10)
      if (!isNaN(b)) endRow = Math.min(lastRow, b)
    }
  }
  if (endRow < startRow) {
    logger.log(`manual_reconcileRenewal aborted: invalid range ${startRow}-${endRow}`)
    return
  }

  for (let row = startRow; row <= endRow; row++) {
    try {
      const values = renewalsSheet.getRange(row, 1, 1, renewalsSheet.getLastColumn()).getValues()[0]
      const personalEmail = rEmailIdx !== -1 ? normalizeEmail(values[rEmailIdx]) : ''
      const phone = rPhoneIdx !== -1 ? normalizePhone(values[rPhoneIdx]) : ''
      if (!personalEmail && !phone) {
        skippedMissingClean++
        continue
      }

      // Find matching CLEAN row (email preferred, else phone)
      let cleanRow = -1
      if (personalEmail && cleanEmailIdx !== -1) {
        cleanRow = findMatchingEmailRow(cleanSheet, cleanEmailIdx, personalEmail)
      }
      if (cleanRow === -1 && phone && cleanPhoneIdx !== -1) {
        cleanRow = findMatchingPhoneRow(cleanSheet, cleanPhoneIdx, phone)
      }
      if (cleanRow === -1) {
        logger.log(`[WARN] manual_reconcileRenewal: No CLEAN match for ${personalEmail || phone}`)
        skippedMissingClean++
        continue
      }

      // Check valid payment in PAYMENTS for RENEWAL_YEAR
      let hasValidPayment = false
      const candidates = []
      if (personalEmail && paymentsIndex.emailToPayments.has(personalEmail)) {
        candidates.push.apply(candidates, paymentsIndex.emailToPayments.get(personalEmail))
      }
      if (phone && paymentsIndex.phoneToPayments.has(phone)) {
        candidates.push.apply(candidates, paymentsIndex.phoneToPayments.get(phone))
      }
      for (let i = 0; i < candidates.length; i++) {
        const p = candidates[i]
        if (!(p.date instanceof Date) || isNaN(p.date)) continue
        const py = p.date.getFullYear()
        if (py !== RENEWAL_YEAR) continue
        const amountOk = typeof p.amount === 'number' && p.amount === MEMBERSHIP_FEE
        if (amountOk) {
          hasValidPayment = true
          break
        }
      }
      if (hasValidPayment) {
        skippedWithValidPayment++
        continue
      }

      // Upsert/update into MANUAL_PAYMENTS for this year
      const targetEmail = personalEmail || ''
      const targetPhone = phone || ''
      const existingRow = findManualRowForYear(targetEmail, targetPhone)
      const now = new Date()
      if (existingRow !== -1) {
        // Update date and notes, keep amount/type
        if (mDateCol !== -1) manualSheet.getRange(existingRow, mDateCol + 1).setValue(now)
        if (mNotesCol !== -1) {
          const prev = String(manualSheet.getRange(existingRow, mNotesCol + 1).getValue() || '')
          const updated = prev
            ? prev + '; reconciliation via manual_reconcileRenewal'
            : 'reconciliation via manual_reconcileRenewal'
          manualSheet.getRange(existingRow, mNotesCol + 1).setValue(updated)
        }
        manualUpdated++
      } else {
        const payload = new Array(Math.max(6, manualSheet.getLastColumn())).fill('')
        if (mEmailCol !== -1) payload[mEmailCol] = targetEmail
        if (mPhoneCol !== -1) payload[mPhoneCol] = targetPhone
        if (mAmountCol !== -1) payload[mAmountCol] = MEMBERSHIP_FEE
        if (mDateCol !== -1) payload[mDateCol] = now
        if (mTypeCol !== -1) payload[mTypeCol] = MANUAL_PAYMENT_TYPE.ADJUSTMENT
        if (mNotesCol !== -1) payload[mNotesCol] = 'reconciliation via manual_reconcileRenewal'
        manualSheet.appendRow(payload)
        manualInserted++
      }

      processed++
    } catch (e) {
      logger.log(`manual_reconcileRenewal error at row ${row}: ${e.message}`)
    }
  }

  logger.log(
    `manual_reconcileRenewal summary: processed=${processed}, skipped_missing_clean=${skippedMissingClean}, skipped_with_valid_payment=${skippedWithValidPayment}, manual_updated=${manualUpdated}, manual_inserted=${manualInserted}`
  )
}

let MANUAL_PAYMENT_SEARCH_WINDOW_RANGE = '' // e.g. '30' for 0-30 days, '30-60' for 30-60 days
function manual_reconcilePaymentsFromEmail() {
  setupServices({})

  // Build time window query: supports 'N' (0..N days) or 'A-B' (A..B days)
  let queryTime = ''
  const rangeStr = String(MANUAL_PAYMENT_SEARCH_WINDOW_RANGE || '').trim()
  if (rangeStr) {
    const parts = rangeStr
      .split('-')
      .map((p) => parseInt(p.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0)
    if (parts.length === 1) {
      queryTime = `newer_than:${parts[0]}d`
    } else if (parts.length >= 2) {
      // Gmail doesn't support older_than+newer_than combined on the same query reliably per docs,
      // but in practice we can AND them together.
      const a = Math.min(parts[0], parts[1])
      const b = Math.max(parts[0], parts[1])
      queryTime = `newer_than:${b}d older_than:${a}d`
    }
  }
  const query = `from:${EMAIL_FILTER_SENDER} to:${EMAIL_FILTER_RECEIVER} subject:${EMAIL_FILTER_SUBJECT_CONTAINS} ${queryTime}`

  let threads = []
  try {
    threads = gmailApp.search(query)
  } catch (e) {
    logger.log(`[ERROR] manual_reconcilePaymentsFromEmail search failed: ${e.message}`)
    return
  }

  let scannedThreads = 0
  let scannedMessages = 0
  let inserted = 0
  let duplicates = 0

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID)
  const paymentsSheet = spreadsheet.getSheetByName('PAYMENTS')
  if (!paymentsSheet) {
    throw new Error('PAYMENTS sheet not found in target spreadsheet. This must exist.')
  }

  threads.forEach((thread) => {
    scannedThreads++
    const messages = thread.getMessages()
    messages.forEach((msg) => {
      scannedMessages++
      try {
        const messageId = msg.getId()
        if (findExistingPayment(paymentsSheet, messageId)) {
          duplicates++
          return
        }
        const paymentData = extractPaymentData(msg)
        insertPaymentRecord(paymentsSheet, paymentData)
        inserted++
      } catch (e) {
        logger.log(`[ERROR] manual_reconcilePaymentsFromEmail failed on message: ${e.message}`)
      }
    })
  })

  logger.log(
    `manual_reconcilePaymentsFromEmail summary: threads=${scannedThreads}, messages=${scannedMessages}, inserted=${inserted}, duplicates=${duplicates}`
  )
}

let MANUAL_PAYMENT_ROW_NUMBER = -1
function manual_processManualPaymentRow() {
  setupServices({})

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID)
  const manualSheet = spreadsheet.getSheetByName('MANUAL_PAYMENTS')
  if (!manualSheet) {
    logger.log('Manual payments sheet not found')
    return
  }

  const lastRow = manualSheet.getLastRow()
  if (lastRow < 2) {
    logger.log('Manual payments sheet has no data rows')
    return
  }

  if (MANUAL_PAYMENT_ROW_NUMBER < 0) {
    logger.log('Manual payment row number is not configured')
    return
  }

  const targetRow = Number(MANUAL_PAYMENT_ROW_NUMBER)
  if (isNaN(targetRow) || targetRow < 2) {
    logger.log(`Manual payment row ${MANUAL_PAYMENT_ROW_NUMBER} is invalid`)
    return
  }

  if (targetRow > lastRow) {
    logger.log(`Manual payment row ${targetRow} is outside the available range (2-${lastRow})`)
    return
  }

  const headers = manualSheet.getRange(1, 1, 1, manualSheet.getLastColumn()).getValues()[0]
  const rowValues = manualSheet
    .getRange(targetRow, 1, 1, manualSheet.getLastColumn())
    .getValues()[0]

  const findIndex = (candidates) => {
    for (let i = 0; i < headers.length; i++) {
      const normalized = String(headers[i] || '')
        .trim()
        .toLowerCase()
      if (candidates.includes(normalized)) return i
    }
    return -1
  }

  const emailIdx = findIndex(['e-mail', 'email'])
  const phoneIdx = findIndex(['teléfono', 'telefono', 'phone', 'tel'])
  const amountIdx = findIndex(['amount', 'monto', 'cantidad'])
  const dateIdx = findIndex(['date', 'fecha'])
  const typeIdx = findIndex(['payment_type'])

  const rawEmail = emailIdx !== -1 ? rowValues[emailIdx] : ''
  const rawPhone = phoneIdx !== -1 ? rowValues[phoneIdx] : ''
  const normalizedEmail = normalizeEmail(rawEmail)
  const normalizedPhone = rawPhone ? normalizePhone(rawPhone) : ''

  if (!normalizedEmail && !normalizedPhone) {
    logger.log(`Manual payment row ${targetRow} is missing both email and phone`)
    return
  }

  const rawAmount = amountIdx !== -1 ? rowValues[amountIdx] : ''
  const amount = parseAmountNumber(rawAmount)
  if (isNaN(amount)) {
    logger.log(`Manual payment row ${targetRow} has invalid amount: ${rawAmount}`)
    return
  }

  const manualDateValue = dateIdx !== -1 ? rowValues[dateIdx] : null
  const paymentDatetime = parseManualPaymentDate(manualDateValue) || new Date()

  const tz =
    typeof Session !== 'undefined' && typeof Session.getScriptTimeZone === 'function'
      ? Session.getScriptTimeZone()
      : 'UTC'
  const formatField = (dateValue, pattern) => {
    if (!dateValue) return ''
    if (utilities && typeof utilities.formatDate === 'function') {
      return utilities.formatDate(dateValue, tz, pattern)
    }
    return dateValue.toISOString()
  }

  const payment_date = formatField(paymentDatetime, 'yyyy-MM-dd')
  const payment_time = formatField(paymentDatetime, 'HH:mm:ss')

  const rawType =
    typeIdx !== -1
      ? String(rowValues[typeIdx] || '')
          .trim()
          .toUpperCase()
      : ''
  const paymentType = rawType || 'MANUAL'

  const cleanSheet = spreadsheet.getSheetByName('CLEAN')
  if (!cleanSheet) {
    logger.log('CLEAN sheet not found for manual payment processing')
    return
  }

  const context = {
    cleanSheet,
    senderEmail: normalizedEmail,
    sentAmount: amount,
    senderPhone: normalizedPhone,
    senderPhoneRaw: rawPhone,
    paymentDate: payment_date,
    paymentTime: payment_time,
    paymentDatetime,
    paymentMessage: `Manual payment row ${targetRow}`,
    recipientName: 'Manual override',
    emailSubject: `Manual payment (${paymentType})`,
    emailFrom: '',
    emailTo: '',
    messageId: `manual-row-${targetRow}-${paymentDatetime.getTime()}`,
    paymentService: `Manual/${paymentType}`,
    serviceProvider: 'Manual entry',
    logPrefix: `Manual payment row ${targetRow}`,
    templateData: {
      sender_name: 'Manual override',
      sender_email: normalizedEmail,
      sender_phone: normalizedPhone,
      amount,
      payment_date,
      payment_time,
      payment_message: `Manual payment row ${targetRow}`,
      email_subject: `Manual payment (${paymentType})`,
      email_from: '',
      email_to: '',
      message_id: `manual-row-${targetRow}-${paymentDatetime.getTime()}`,
      payment_service: `Manual/${paymentType}`,
      service_provider: 'Manual entry',
    },
  }

  processPaymentRecordContext(context)
}

function parseManualPaymentDate(value) {
  if (value instanceof Date && !isNaN(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value)
    if (!isNaN(parsed)) return parsed
  }
  if (typeof value === 'number' && !isNaN(value)) {
    const parsed = new Date(value)
    if (!isNaN(parsed)) return parsed
  }
  return null
}
// #endregion

// #region Script Properties
let NOTIFICATION_EMAIL // Notification email address
let CC_EMAIL // CC email address used when sending welcom email and simple credentials email
let BCC_EMAIL // BCC email address used when sending welcom email and simple credentials email
let MEMBERSHIP_CERTIFICATE_TEMPLATE_ID // Membership certificate template ID
let WELCOME_LETTER_TEMPLATE_ID // Welcome letter template ID
let SPREADSHEET_ID // Spreadsheet ID
// #endregion

// #region Global service variables
let logger
let workspaceDirectory
let gmailApp
let driveApp
let utilities
let documentApp
const EMAIL_FILTER_SENDER = 'finance@sociedadastronomia.com'
const EMAIL_FILTER_RECEIVER = 'finance@sociedadastronomia.com'
const EMAIL_SEARCH_WINDOW_DAYS = 14
const EMAIL_FILTER_SUBJECT_CONTAINS = 'paid'
const SAC_DOMAIN = '@sociedadastronomia.com'
// Renewal reconciliation explicit scope
const RENEWAL_YEAR = 2025
const RENEWAL_SHEET_NAME = 'RENEWAL_MEMBERS_2025'
// Manual payments enum for sheet column payment_type
const MANUAL_PAYMENT_TYPE = Object.freeze({
  GIFT: 'GIFT',
  ADJUSTMENT: 'ADJUSTMENT',
  INTERNAL: 'INTERNAL',
})
// #endregion

// #region Entry Points - Real
function setupServices(services) {
  logger = services.logger || Logger
  workspaceDirectory = services.workspaceDirectory || WorkspaceDirectory
  gmailApp = services.gmailApp || GmailApp
  driveApp = services.driveApp || DriveApp
  utilities = services.utilities || Utilities
  documentApp = services.documentApp || DocumentApp
  if (typeof services.NOTIFICATION_EMAIL === 'string') {
    NOTIFICATION_EMAIL = services.NOTIFICATION_EMAIL
  } else {
    NOTIFICATION_EMAIL =
      PropertiesService.getScriptProperties().getProperty('NOTIFICATION_EMAIL') || ''
  }
  if (typeof services.CC_EMAIL === 'string') {
    CC_EMAIL = services.CC_EMAIL
  } else {
    CC_EMAIL = PropertiesService.getScriptProperties().getProperty('CC_EMAIL') || ''
  }
  if (typeof services.BCC_EMAIL === 'string') {
    BCC_EMAIL = services.BCC_EMAIL
  } else {
    BCC_EMAIL = PropertiesService.getScriptProperties().getProperty('BCC_EMAIL') || ''
  }
  if (typeof services.MEMBERSHIP_CERTIFICATE_TEMPLATE_ID === 'string') {
    MEMBERSHIP_CERTIFICATE_TEMPLATE_ID = services.MEMBERSHIP_CERTIFICATE_TEMPLATE_ID
  } else {
    MEMBERSHIP_CERTIFICATE_TEMPLATE_ID =
      PropertiesService.getScriptProperties().getProperty('MEMBERSHIP_CERTIFICATE_TEMPLATE_ID') ||
      ''
  }
  if (typeof services.WELCOME_LETTER_TEMPLATE_ID === 'string') {
    WELCOME_LETTER_TEMPLATE_ID = services.WELCOME_LETTER_TEMPLATE_ID
  } else {
    WELCOME_LETTER_TEMPLATE_ID =
      PropertiesService.getScriptProperties().getProperty('WELCOME_LETTER_TEMPLATE_ID') || ''
  }
  if (typeof services.SPREADSHEET_ID === 'string') {
    SPREADSHEET_ID = services.SPREADSHEET_ID
  } else {
    SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || ''
  }
}

function onFormSubmit(e) {
  if (MAINTENANCE_MODE) {
    Logger.log('Maintenance mode active: onFormSubmit halted')
    return
  }
  handle_formIsSubmitted(e, {})
}

function onEdit(e) {
  if (MAINTENANCE_MODE) {
    Logger.log('Maintenance mode active: onEdit halted')
    return
  }
  handle_sheetIsEdited(e, {})
}

function onNewMemberships(e) {
  if (MAINTENANCE_MODE) {
    Logger.log('Maintenance mode active: onNewMemberships halted')
    return
  }
  handle_scheduledPaymentScan(e, {})
}

function onChange(e) {
  if (MAINTENANCE_MODE) {
    Logger.log('Maintenance mode active: onChange halted')
    return
  }
  handle_sheetStructureChanged(e, {})
}

function handle_formIsSubmitted(e, services) {
  setupServices(services || {})
  return handleFormSubmission(e)
}

function handle_sheetIsEdited(e, services) {
  setupServices(services || {})
  return routeOnEdit(e)
}

function handle_onEditRAW(e, services) {
  if (services) setupServices(services)
  return handleFormSubmission(e)
}

function handle_onEditCLEAN(e, services) {
  if (services) setupServices(services)
  logger.log('Manual edit in CLEAN ignored by design')
}

function handle_onEditPAYMENTS(e, services) {
  if (services) setupServices(services)
  logger.log('Manual edit in PAYMENTS ignored by design')
}

function handle_scheduledPaymentScan(e, services) {
  setupServices(services || {})
  handleNewMemberships(e)
}

function routeOnEdit(e) {
  const sheet = e.range.getSheet()
  const sheetName = sheet.getName()

  switch (sheetName) {
    case 'RAW':
      return handle_onEditRAW(e)
    case 'PAYMENTS':
      return handle_onEditPAYMENTS(e)
    case 'CLEAN':
      return handle_onEditCLEAN(e)
    default:
      logger.log(`Unmanaged sheet event: ${sheetName}`)
      return
  }
}

function handle_sheetStructureChanged(e, services) {
  setupServices(services || {})
  if (!e || !e.changeType) {
    logger.log('Change event without changeType received')
    return
  }

  switch (e.changeType) {
    case 'REMOVE_ROW':
      handle_rowsRemoved(e)
      break
    default:
      logger.log(`Unmanaged change event type: ${e.changeType}`)
      break
  }
}

function handle_rowsRemoved(e) {
  const range = e.range
  if (!range) {
    logger.log('Row removal event received without range information')
    return
  }

  const sheet = range.getSheet()
  const sheetName = sheet.getName()
  if (!['RAW', 'CLEAN', 'PAYMENTS'].includes(sheetName)) {
    logger.log(`Row removal ignored on sheet: ${sheetName}`)
    return
  }

  const actor = getActiveUserEmail() || '[unknown]'
  logger.log(`${sheetName} row(s) deleted by ${actor}`)
}
// #endregion

// #region Process Payment Emails
function handleNewMemberships(e) {
  // ATH Movil emails (subject contains "paid")
  const athQuery = `from:${EMAIL_FILTER_SENDER} to:${EMAIL_FILTER_RECEIVER} subject:${EMAIL_FILTER_SUBJECT_CONTAINS} newer_than:${EMAIL_SEARCH_WINDOW_DAYS}d`

  // PayPal emails (subject contains "payment received from")
  const paypalQuery = `from:${EMAIL_FILTER_SENDER} to:${EMAIL_FILTER_RECEIVER} subject:"payment received from" newer_than:${EMAIL_SEARCH_WINDOW_DAYS}d`

  // Process ATH Movil emails
  const athThreads = gmailApp.search(athQuery)
  athThreads.forEach((thread) => {
    const messages = thread.getMessages()
    messages.forEach(processPaymentEmail)
  })

  // Process PayPal emails
  const paypalThreads = gmailApp.search(paypalQuery)
  paypalThreads.forEach((thread) => {
    const messages = thread.getMessages()
    messages.forEach(processPaymentEmail)
  })
}

function processPaymentEmail(msg) {
  // 1. Detect payment service and extract data with appropriate parser
  const serviceType = detectPaymentService(msg)
  let paymentData

  if (serviceType === 'paypal') {
    paymentData = extractPayPalPaymentData(msg)
  } else if (serviceType === 'ath_movil') {
    paymentData = extractPaymentData(msg)
  } else {
    logger.log(`Unknown payment service type for message: ${msg.getId()}`)
    return
  }

  // 2. Check if we already registered this payment in PAYMENTS sheet
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID)
  const paymentsSheet = spreadsheet.getSheetByName('PAYMENTS')

  if (!paymentsSheet) {
    logger.log('PAYMENTS sheet not found')
    return
  }

  // Check if payment already exists by message_id
  const existingPayment = findExistingPayment(paymentsSheet, paymentData.message_id)

  // 3. If we already registered this payment, skip
  if (existingPayment) {
    logger.log(`Payment already registered for message_id: ${paymentData.message_id}`)
    return
  }

  // 4. Find matching user in CLEAN sheet
  const cleanSheet = spreadsheet.getSheetByName('CLEAN')
  if (!cleanSheet) {
    logger.log('CLEAN sheet not found')
    return
  }

  // Get email column index in CLEAN sheet
  const cleanHeaders = cleanSheet.getRange(1, 1, 1, cleanSheet.getLastColumn()).getValues()[0]
  const emailColIndex = cleanHeaders.indexOf('E-mail')
  const phoneColIndex = findPhoneColumnIndex(cleanHeaders)

  if (emailColIndex === -1 && phoneColIndex === -1) {
    logger.log('Neither E-mail nor phone column found in CLEAN sheet')
    return
  }

  let matchedRow = -1
  const emailToMatch = normalizeEmail(paymentData.sender_email)
  if (emailColIndex !== -1 && emailToMatch) {
    matchedRow = findMatchingEmailRow(cleanSheet, emailColIndex, emailToMatch)
  }

  if (matchedRow === -1 && phoneColIndex !== -1) {
    const phoneToMatch = normalizePhone(paymentData.sender_phone)
    if (phoneToMatch) {
      matchedRow = findMatchingPhoneRow(cleanSheet, phoneColIndex, phoneToMatch)
    }
  }

  let matchStatus = 'UNMATCHED_NO_USER'
  if (matchedRow !== -1) {
    const amountNumber = Number(paymentData.amount)
    const createdAtIndex = cleanHeaders.indexOf('created_at')
    const createdAtValue =
      createdAtIndex !== -1 ? cleanSheet.getRange(matchedRow, createdAtIndex + 1).getValue() : ''
    if (createdAtValue || amountNumber !== MEMBERSHIP_FEE) {
      matchStatus = 'MATCHED_OTHER_PAYMENT'
    } else {
      matchStatus = 'MATCHED_MEMBERSHIP_PAYMENT'
    }
  }

  paymentData.match_status = matchStatus

  insertPaymentRecord(paymentsSheet, paymentData)
  logger.log(`Payment registered for ${paymentData.sender_email} - Amount: $${paymentData.amount}`)

  if (matchedRow === -1) {
    // TODO: Handle scenario where a user is added after an unmatched payment was recorded.
    const phoneDetails = paymentData.sender_phone ? ` or phone ${paymentData.sender_phone}` : ''
    logger.log(`No matching user found for email ${paymentData.sender_email}${phoneDetails}`)
    const emailResult = sendTemplatedEmail('PAYMENT_NO_USER', paymentData)
    if (!emailResult.success) {
      logger.log(`Failed to send payment no user notification: ${emailResult.error}`)
    }
    return
  }

  if (matchStatus === 'MATCHED_OTHER_PAYMENT') {
    logger.log(`Skipping onboarding for ${paymentData.sender_email}; payment marked as other.`)
    return
  }

  // 7. Handle Payment Recorded
  const row = paymentsSheet.getLastRow()
  handlePaymentRecorded(paymentsSheet, cleanSheet, row)
}

function findExistingPayment(paymentsSheet, messageId) {
  // Defensive: ensure sheet is provided (hard fail: this sheet must exist)
  if (!paymentsSheet || typeof paymentsSheet.getDataRange !== 'function') {
    throw new Error('findExistingPayment: PAYMENTS sheet is not available')
  }
  // Get all data from payments sheet
  const data = paymentsSheet.getDataRange().getValues()

  // Find message_id column (or use a predefined column index)
  // Assuming message_id is stored in a column, find which one
  const headers = data[0]
  let messageIdColIndex = headers.indexOf('message_id')

  if (messageIdColIndex === -1) {
    // If no message_id column exists, we can't check for duplicates
    logger.log('No message_id column found in PAYMENTS sheet')
    return false
  }

  // Check each row for matching message_id
  for (let i = 1; i < data.length; i++) {
    if (data[i][messageIdColIndex] === messageId) {
      return true
    }
  }

  return false
}

function insertPaymentRecord(paymentsSheet, paymentData) {
  // Get headers to know the column order
  const headers = paymentsSheet.getRange(1, 1, 1, paymentsSheet.getLastColumn()).getValues()[0]

  // Create a new row array matching the headers
  const newRow = []

  // Map payment data to columns based on headers
  headers.forEach((header) => {
    switch (header.toLowerCase()) {
      case 'timestamp':
      case 'fecha':
        newRow.push(new Date())
        break
      case 'amount':
      case 'monto':
      case 'cantidad':
        newRow.push(paymentData.amount)
        break
      case 'sender name':
      case 'sender_name':
      case 'nombre':
        newRow.push(paymentData.sender_name)
        break
      case 'sender phone':
      case 'sender_phone':
      case 'teléfono':
      case 'telefono':
        newRow.push(paymentData.sender_phone)
        break
      case 'sender email':
      case 'sender_email':
      case 'e-mail':
      case 'email':
        newRow.push(paymentData.sender_email)
        break
      case 'payment date':
      case 'payment_date':
      case 'fecha de pago':
        newRow.push(paymentData.payment_date)
        break
      case 'payment time':
      case 'payment_time':
      case 'hora':
        newRow.push(paymentData.payment_time)
        break
      case 'payment datetime':
      case 'payment_datetime':
        newRow.push(paymentData.payment_datetime)
        break
      case 'message':
      case 'payment_message':
      case 'mensaje':
        newRow.push(paymentData.payment_message)
        break
      case 'recipient':
      case 'recipient_name':
        newRow.push(paymentData.recipient_name)
        break
      case 'email subject':
      case 'email_subject':
        newRow.push(paymentData.email_subject)
        break
      case 'email date':
      case 'email_date':
        newRow.push(paymentData.email_date)
        break
      case 'email from':
      case 'email_from':
        newRow.push(paymentData.email_from)
        break
      case 'email to':
      case 'email_to':
        newRow.push(paymentData.email_to)
        break
      case 'original sender':
      case 'original_sender':
        newRow.push(paymentData.original_sender)
        break
      case 'return path':
      case 'return_path':
        newRow.push(paymentData.return_path)
        break
      case 'payment service':
      case 'payment_service':
      case 'servicio':
        newRow.push(paymentData.payment_service)
        break
      case 'service provider':
      case 'service_provider':
      case 'proveedor':
        newRow.push(paymentData.service_provider)
        break
      case 'match status':
      case 'match_status':
      case 'status':
        newRow.push(paymentData.match_status || '')
        break
      case 'message id':
      case 'message_id':
        newRow.push(paymentData.message_id)
        break
      default:
        // For any unmatched columns, add empty value
        newRow.push('')
    }
  })

  // Append the new row to the sheet
  paymentsSheet.appendRow(newRow)
}

function detectPaymentService(msg) {
  const subject = msg.getSubject().toLowerCase()
  const raw = msg.getRawContent()

  // Extract original sender from headers (for forwarded emails)
  const originalMatch = raw.match(/Original-Sender:\s*([^\r\n]+)/i)
  const original_sender = originalMatch ? originalMatch[1].trim().toLowerCase() : ''
  const returnMatch = raw.match(/Return-Path:\s*<([^>]+)>/i)
  const return_path = returnMatch ? returnMatch[1].toLowerCase() : ''

  // PayPal: verify both subject AND sender
  if (subject.includes('payment received from')) {
    const isFromPayPal = original_sender.includes('paypal.com') || return_path.includes('paypal.com')
    if (isFromPayPal) {
      return 'paypal'
    }
    // Subject matches but sender doesn't - potential spoofing attempt
    logger.log(`Suspicious email: PayPal subject but sender is ${original_sender || return_path || 'unknown'}`)
    return 'unknown'
  }

  // ATH Movil: verify both subject AND sender
  if (subject.includes('paid')) {
    const isFromATH = original_sender.includes('athmovil') || return_path.includes('athmovil')
    if (isFromATH) {
      return 'ath_movil'
    }
    // Subject matches but sender doesn't - potential spoofing attempt
    logger.log(`Suspicious email: ATH subject but sender is ${original_sender || return_path || 'unknown'}`)
    return 'unknown'
  }

  return 'unknown'
}

function extractPaymentData(msg) {
  // Pull raw parts
  const message_id = msg.getId()
  const body = msg.getBody()
  const raw = msg.getRawContent()
  // amount
  const amountMatch = body.match(/<b>Amount:<\/b>\s*\$([0-9.,]+)/i)
  const amount = amountMatch ? amountMatch[1] : ''
  // sender name & phone
  const fromMatch = body.match(/<b>From:<\/b>\s*([^<\-]+)-\s*([^<]+)/i)
  const sender_name = fromMatch ? fromMatch[1].trim() : ''
  const sender_phone = fromMatch ? fromMatch[2].trim() : ''
  // sender email
  const emailMatch = body.match(/<b>Email:<\/b>\s*([^<]+)/i)
  const sender_email = emailMatch ? emailMatch[1].trim() : ''
  // date & time
  const dateMatch = body.match(/<b>Date:<\/b>\s*([^<]+)/i)
  let payment_date = '',
    payment_time = '',
    payment_datetime = null
  if (dateMatch) {
    const dateStr = dateMatch[1].trim()
    const parts = dateStr.split(',')
    payment_date = parts[0].trim()
    payment_time = parts[1] ? parts[1].trim() : ''
    payment_datetime = new Date(dateStr)
  }
  // message body
  const messageMatch = body.match(/<b>Message:<\/b>\s*([^<]*)/i)
  const payment_message = messageMatch ? messageMatch[1].trim() : ''
  // recipient sign-off
  const recipientMatch = body.match(/<b>([^<]+)<\/b>\s*<br\s*\/>/i)
  const recipient_name = recipientMatch ? recipientMatch[1] : ''
  // email headers
  const email_subject = msg.getSubject()
  const email_date = msg.getDate()
  const email_from = msg.getFrom()
  const email_to = msg.getTo()
  // original sender & return-path from raw headers
  const originalMatch = raw.match(/Original-Sender:\s*([^\r\n]+)/i)
  const original_sender = originalMatch ? originalMatch[1].trim() : ''
  const returnMatch = raw.match(/Return-Path:\s*<([^>]+)>/i)
  const return_path = returnMatch ? returnMatch[1] : ''
  // service info
  const payment_service = recipient_name
  const providerMatch = body.match(/Copyright[\s\S]*?©\s*\d{4}\s*([^.<]+)/i)
  const service_provider = providerMatch ? providerMatch[1].trim() : ''

  return {
    message_id,
    amount,
    sender_name,
    sender_phone,
    sender_email,
    payment_date,
    payment_time,
    payment_datetime,
    payment_message,
    recipient_name,
    email_subject,
    email_date,
    email_from,
    email_to,
    original_sender,
    return_path,
    payment_service,
    service_provider,
  }
}

function extractPayPalPaymentData(msg) {
  // Pull raw parts (same as ATH Movil)
  const message_id = msg.getId()
  const body = msg.getBody()
  const raw = msg.getRawContent()

  // Amount: "payment of $25.00 USD" or fallback "$25.00 USD"
  let amountMatch = body.match(/payment of \$([0-9.,]+)\s*USD/i)
  if (!amountMatch) {
    amountMatch = body.match(/\$([0-9.,]+)\s*USD/i)
  }
  const amount = amountMatch ? amountMatch[1] : ''

  // Transaction ID: look for alphanumeric ID after "<b>Transaction ID</b>"
  const txIdMatch = body.match(/<b>Transaction ID<\/b>[\s\S]*?([A-Z0-9]{10,})/i)
  const transaction_id = txIdMatch ? txIdMatch[1] : ''

  // Transaction date: "Jan 25, 2026 14:57:02 PST"
  const txDateMatch = body.match(
    /<b>Transaction date<\/b>[\s\S]*?(\w{3}\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}:\d{2}\s+\w+)/i
  )
  let payment_date = '',
    payment_time = '',
    payment_datetime = null
  if (txDateMatch) {
    const dateStr = txDateMatch[1].trim()
    // Parse "Jan 25, 2026 14:57:02 PST" into date and time parts
    const dateTimeParts = dateStr.match(/(\w{3}\s+\d{1,2},\s+\d{4})\s+(\d{1,2}:\d{2}:\d{2}\s+\w+)/)
    if (dateTimeParts) {
      payment_date = dateTimeParts[1]
      payment_time = dateTimeParts[2]
    } else {
      payment_date = dateStr
    }
    // Create Date object (JavaScript can parse this format)
    payment_datetime = new Date(dateStr)
  }

  // Buyer information: name and email on separate lines after "<b>Buyer information</b>"
  const buyerMatch = body.match(
    /<b>Buyer information<\/b>[\s\S]*?<br\s*\/?>\s*([^<]+)<br\s*\/?>\s*([^<]+@[^<\s]+)/i
  )
  const sender_name = buyerMatch ? buyerMatch[1].trim() : ''
  const sender_email = buyerMatch ? buyerMatch[2].trim() : ''

  // PayPal has no phone number in payment emails
  const sender_phone = ''

  // Instructions from buyer (message)
  const messageMatch = body.match(/<b>Instructions from buyer<\/b>[\s\S]*?<br\s*\/?>\s*([^<]+)/i)
  const payment_message = messageMatch ? messageMatch[1].trim() : ''

  // Recipient name (not used for PayPal, but included for compatibility)
  const recipient_name = ''

  // Email headers (same as ATH Movil)
  const email_subject = msg.getSubject()
  const email_date = msg.getDate()
  const email_from = msg.getFrom()
  const email_to = msg.getTo()

  // Original sender & return-path from raw headers
  const originalMatch = raw.match(/Original-Sender:\s*([^\r\n]+)/i)
  const original_sender = originalMatch ? originalMatch[1].trim() : ''
  const returnMatch = raw.match(/Return-Path:\s*<([^>]+)>/i)
  const return_path = returnMatch ? returnMatch[1] : ''

  // Service info (hardcoded for PayPal)
  const payment_service = 'PayPal'
  const service_provider = 'PayPal, Inc.'

  return {
    message_id,
    amount,
    sender_name,
    sender_phone,
    sender_email,
    payment_date,
    payment_time,
    payment_datetime,
    payment_message,
    recipient_name,
    email_subject,
    email_date,
    email_from,
    email_to,
    original_sender,
    return_path,
    payment_service,
    service_provider,
    transaction_id,
  }
}
// #endregion

// #region Payment Recorded
const MEMBERSHIP_FEE = 25
function handlePaymentRecorded(paymentsSheet, cleanSheet, row) {
  const senderEmail = paymentsSheet.getRange(row, 5).getValue()
  const sentAmount = paymentsSheet.getRange(row, 2).getValue()

  if (!senderEmail || !sentAmount || sentAmount < MEMBERSHIP_FEE) {
    logger.log(
      `Invalid payment record at row ${row}: senderEmail=${senderEmail}, sentAmount=${sentAmount}`
    )
    const emailResult = sendTemplatedEmail('PAYMENT_INVALID', {
      row,
      senderEmail,
      sentAmount,
      membershipFee: MEMBERSHIP_FEE,
    })
    if (!emailResult.success) {
      logger.log(`Failed to send invalid payment email: ${emailResult.error}`)
    }
    return
  }

  const paymentsHeaders = paymentsSheet
    .getRange(1, 1, 1, paymentsSheet.getLastColumn())
    .getValues()[0]
  const senderPhoneColIndex = findHeaderColumnIndex(paymentsHeaders, [
    'sender phone',
    'sender_phone',
    'senderphone',
    'teléfono',
    'telefono',
    'phone',
    'tel',
  ])
  let paymentPhone = null
  if (senderPhoneColIndex !== -1) {
    paymentPhone = paymentsSheet.getRange(row, senderPhoneColIndex + 1).getValue()
  }

  const messageIdColIndex = findHeaderColumnIndex(paymentsHeaders, [
    'message id',
    'message_id',
    'messageid',
  ])
  const messageId =
    messageIdColIndex !== -1 ? paymentsSheet.getRange(row, messageIdColIndex + 1).getValue() : ''

  processPaymentRecordContext({
    cleanSheet,
    paymentsSheet,
    paymentRow: row,
    senderEmail,
    sentAmount,
    senderPhone: normalizePhone(paymentPhone),
    senderPhoneRaw: paymentPhone,
    paymentMessage: `Payment row ${row}`,
    recipientName: '',
    emailSubject: '',
    emailFrom: '',
    emailTo: '',
    messageId,
    paymentService: 'Email',
    serviceProvider: '',
    logPrefix: `PAYMENTS row ${row}`,
    templateData: {
      sender_name: '',
      sender_email: senderEmail,
      sender_phone: normalizePhone(paymentPhone) || '',
      amount: Number(sentAmount),
      payment_date: '',
      payment_time: '',
      payment_message: `Payment row ${row}`,
      email_subject: '',
      email_from: '',
      email_to: '',
      message_id: messageId || '',
      payment_service: 'Email',
    },
  })
}

function findHeaderColumnIndex(headers, candidates) {
  for (let i = 0; i < headers.length; i++) {
    const normalized = String(headers[i] || '')
      .trim()
      .toLowerCase()
    if (candidates.includes(normalized)) {
      return i
    }
  }
  return -1
}

function setPaymentMatchStatus(paymentsSheet, paymentRow, status) {
  if (!paymentsSheet || !paymentRow) return false
  const headers = paymentsSheet.getRange(1, 1, 1, paymentsSheet.getLastColumn()).getValues()[0]
  const col = findHeaderColumnIndex(headers, ['match status', 'match_status', 'status'])
  if (col === -1) {
    return false
  }
  paymentsSheet.getRange(paymentRow, col + 1).setValue(status)
  return true
}

function processPaymentRecordContext(context) {
  const {
    cleanSheet,
    paymentsSheet,
    paymentRow,
    senderEmail,
    sentAmount,
    senderPhone,
    senderPhoneRaw,
    paymentDate,
    paymentTime,
    paymentMessage,
    recipientName,
    emailSubject,
    emailFrom,
    emailTo,
    messageId,
    paymentService,
    serviceProvider,
    logPrefix,
    templateData,
  } = context

  if (!cleanSheet) {
    logger.log('CLEAN sheet not found for payment processing')
    return
  }

  const cleanHeaders = cleanSheet.getRange(1, 1, 1, cleanSheet.getLastColumn()).getValues()[0]
  const emailColIndex = cleanHeaders.indexOf('E-mail')
  const phoneColIndex = findPhoneColumnIndex(cleanHeaders)

  if (emailColIndex === -1 && phoneColIndex === -1) {
    logger.log(`Neither E-mail nor phone column found in CLEAN sheet`)
    return
  }

  const normalizedAmount = Number(sentAmount)
  const normalizedEmail = normalizeEmail(senderEmail)
  let matchedRow = -1
  if (emailColIndex !== -1 && normalizedEmail) {
    matchedRow = findMatchingEmailRow(cleanSheet, emailColIndex, normalizedEmail)
  }

  let matchedPhone = ''
  if (matchedRow === -1 && phoneColIndex !== -1 && senderPhone) {
    matchedRow = findMatchingPhoneRow(cleanSheet, phoneColIndex, senderPhone)
    matchedPhone = senderPhoneRaw || senderPhone
  }

  let matchStatus = 'UNMATCHED_NO_USER'
  if (matchedRow !== -1) {
    const createdAtIndex = cleanHeaders.indexOf('created_at')
    const createdAtValue =
      createdAtIndex !== -1 ? cleanSheet.getRange(matchedRow, createdAtIndex + 1).getValue() : ''
    if (createdAtValue || normalizedAmount !== MEMBERSHIP_FEE) {
      matchStatus = 'MATCHED_OTHER_PAYMENT'
    } else {
      matchStatus = 'MATCHED_MEMBERSHIP_PAYMENT'
    }
  }

  const paymentTemplateData = templateData || {
    sender_name: recipientName || '',
    sender_email: senderEmail || '',
    sender_phone: senderPhone || '',
    amount: normalizedAmount,
    payment_date: paymentDate || '',
    payment_time: paymentTime || '',
    payment_message: paymentMessage || '',
    email_subject: emailSubject || '',
    email_from: emailFrom || '',
    email_to: emailTo || '',
    message_id: messageId || '',
    payment_service: paymentService || '',
    service_provider: serviceProvider || '',
  }

  if (matchedRow === -1) {
    const phoneDetails = matchedPhone ? ` or phone ${matchedPhone}` : ''
    logger.log(
      `${
        logPrefix || 'Payment'
      }: User with email ${senderEmail}${phoneDetails} not found in CLEAN sheet`
    )
    const emailResult = sendTemplatedEmail('PAYMENT_NO_USER', paymentTemplateData)
    if (!emailResult.success) {
      logger.log(`Failed to send payment no user notification: ${emailResult.error}`)
    }
    return
  }

  if (matchStatus === 'MATCHED_OTHER_PAYMENT') {
    logger.log(
      `${logPrefix || 'Payment'}: Skipping onboarding for ${senderEmail}; payment marked as other.`
    )
    return
  }

  const dataStatusIndex = cleanHeaders.indexOf('data_status')
  if (dataStatusIndex !== -1) {
    const rawStatus = cleanSheet.getRange(matchedRow, dataStatusIndex + 1).getValue()
    const normalizedStatus = String(rawStatus || '')
      .trim()
      .toUpperCase()
    if (normalizedStatus && normalizedStatus !== 'VALID') {
      const updated = setPaymentMatchStatus(paymentsSheet, paymentRow, 'UNMATCHED_USER_DIRTY')
      if (updated) {
        logger.log(
          `${
            logPrefix || 'Payment'
          }: flagged as UNMATCHED_USER_DIRTY due to user data_status=${normalizedStatus}`
        )
      } else {
        logger.log(`PAYMENTS match_status column not found; could not flag UNMATCHED_USER_DIRTY`)
      }
      return
    }
  }

  const caIndex = cleanHeaders.indexOf('created_at')
  if (caIndex !== -1) {
    const existingTimestamp = cleanSheet.getRange(matchedRow, caIndex + 1).getValue()
    if (existingTimestamp) {
      logger.log(`User with email ${senderEmail} already created at ${existingTimestamp}`)
      return
    }
  }

  const rowValues = cleanSheet.getRange(matchedRow, 1, 1, cleanHeaders.length).getValues()[0]
  const firstName = rowValues[2]
  const fullLastName = rowValues[4]
  const name = `${firstName} ${fullLastName}`.trim()
  const phone = normalizePhone(rowValues[6])

  logger.log(
    `${
      logPrefix || 'Payment'
    }: Processing payment for ${name} ${senderEmail} ${phone} ${sentAmount}`
  )

  const initial = rowValues[3]
  let lastName = ''
  let slastName = ''
  if (fullLastName) {
    const nameParts = fullLastName.split(/[\s-]/)
    lastName = nameParts[0] || ''
    slastName = nameParts[1] || ''
  }
  const userData = { firstName, initial, lastName, slastName, email: senderEmail, phone }
  const accountResult = createUserAccount(userData)
  if (!accountResult.success) {
    logger.log(`User creation failed: ${accountResult.error}`)
    const emailFailureResult = sendTemplatedEmail('EMAIL_CREATION_FAILURE', userData)
    if (!emailFailureResult.success) {
      logger.log(`Failed to send email creation failure notification: ${emailFailureResult.error}`)
    }
    return
  }

  const groupResult = addUserToGroup(accountResult)
  if (!groupResult.success) {
    logger.log(`Failed to add user to group: ${groupResult.error}`)
  }

  const welcomeResult = sendWelcomeEmail(accountResult)
  if (!welcomeResult.success) {
    logger.log(`Failed to send welcome email: ${welcomeResult.error}`)
  }

  try {
    const to = senderEmail
    if (to) {
      const subject = 'Tu cuenta SAC / Your SAC account'
      const body =
        `Hola ${firstName} ${fullLastName},\n\n` +
        `Se ha creado tu cuenta de la Sociedad de Astronomía del Caribe.\n` +
        `Correo (SAC): ${accountResult.email}\n` +
        `Contraseña temporera: ${accountResult.password}\n\n` +
        `Primeros pasos:\n` +
        `1) Entra a https://mail.google.com\n` +
        `2) Accede con tu correo SAC y la contraseña temporera\n` +
        `3) El sistema te pedirá cambiarla en el primer inicio de sesión\n\n` +
        `Gracias.\n\n` +
        `— SAC`
      const options = {}
      if (CC_EMAIL) options.cc = CC_EMAIL
      if (BCC_EMAIL) options.bcc = BCC_EMAIL
      gmailApp.sendEmail(to, subject, body, options)
      logger.log(`Credentials email sent to ${to} for new workspace account ${accountResult.email}`)
    }
  } catch (e) {
    logger.log(`Failed to send credentials email: ${e.message}`)
  }

  const adminSubject = `New user account created: ${accountResult.email}`
  const adminBody =
    `A new user account has been created for ${firstName} ${fullLastName}.\n` +
    `Account Email: ${accountResult.email}\n` +
    `Personal Email: ${senderEmail}\n` +
    `Phone: ${phone}`
  const adminRecipient = (NOTIFICATION_EMAIL || '').trim()
  if (adminRecipient) {
    gmailApp.sendEmail(adminRecipient, adminSubject, adminBody)
  } else {
    logger.log('Admin notification not sent: NOTIFICATION_EMAIL is not set')
  }

  const createdAtIndex = cleanHeaders.indexOf('created_at')
  if (createdAtIndex !== -1) {
    cleanSheet.getRange(matchedRow, createdAtIndex + 1).setValue(new Date())
  } else {
    logger.log('created_at column not found in CLEAN sheet')
  }

  let sacEmailCol = cleanHeaders.indexOf('sac_email')
  if (sacEmailCol === -1) {
    const lastCol = cleanSheet.getLastColumn()
    cleanSheet.insertColumnAfter(lastCol)
    const newCol = lastCol + 1
    cleanSheet.getRange(1, newCol).setValue('sac_email')
    sacEmailCol = newCol - 1
  }
  cleanSheet.getRange(matchedRow, sacEmailCol + 1).setValue(accountResult.email)
}

function createUserAccount(userData) {
  try {
    const sacEmail = createEmail(
      userData.firstName,
      userData.initial,
      userData.lastName,
      userData.slastName
    )

    if (!sacEmail) throw new Error('Email creation failed: No available combinations')

    const passwordData = generatePassword()

    const user = createWorkspaceUser(userData, sacEmail, passwordData)
    if (!user) {
      return { success: false, error: 'User creation failed' }
    }

    return {
      success: true,
      email: sacEmail,
      password: passwordData.plainPassword,
      userData: userData,
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

function sanitizeNamePartForEmail(text) {
  if (!text) return ''
  const lower = String(text).trim().toLowerCase()
  // Remove diacritics (e.g., á -> a, ñ -> n) and strip non a-z characters
  const noDiacritics = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return noDiacritics.replace(/[^a-z]/g, '')
}

function getUserCreationDate(user) {
  try {
    if (!user) return null
    const candidates = [user.creationTime, user.createTime, user.creation_date]
    for (let i = 0; i < candidates.length; i++) {
      const v = candidates[i]
      if (!v) continue
      if (v instanceof Date) return v
      const asDate = new Date(v)
      if (!isNaN(asDate.getTime())) return asDate
    }
    return null
  } catch (e) {
    return null
  }
}

function generateEmailCandidates(parts, domain) {
  const fn = sanitizeNamePartForEmail(parts.firstName)
  const ini = sanitizeNamePartForEmail(parts.initial).charAt(0)
  const ln = sanitizeNamePartForEmail(parts.lastName)
  const sln = sanitizeNamePartForEmail(parts.slastName)

  const usernames = []
  if (fn && ln) usernames.push(`${fn}.${ln}`)
  if (fn && ln && sln) usernames.push(`${fn}.${ln}.${sln}`)
  if (fn && ini && ln) usernames.push(`${fn}.${ini}.${ln}`)
  if (fn && ini && ln && sln) usernames.push(`${fn}.${ini}.${ln}.${sln}`)

  return usernames.map((u) => `${u}${domain}`)
}

function createEmail(firstName, initial, lastName, slastName) {
  const domain = SAC_DOMAIN
  // Try different email combinations in order of preference using the single generator
  const emailCombinations = generateEmailCandidates(
    { firstName, initial, lastName, slastName },
    domain
  )

  for (const username of emailCombinations) {
    const sacEmail = String(username).includes('@') ? username : `${username}${domain}`
    if (!checkUserExists(sacEmail)) {
      logger.log(`Unique email created: ${sacEmail}`)
      return sacEmail
    }
    logger.log(`User ${sacEmail} already exists. Trying next combination.`)
  }

  // No available combinations found
  logger.log(`All email combinations exist. Manual review needed.`)
  return null
}

function checkUserExists(sacEmail) {
  try {
    const user = workspaceDirectory.Users.get(sacEmail)
    if (!user || !user.primaryEmail) {
      throw new Error('Resource Not Found')
    }
    logger.log(`User ${user.primaryEmail} exists.`)
    return true
  } catch (e) {
    if (e.message.includes('Resource Not Found')) {
      logger.log(`User ${sacEmail} does not exist.`)
      return false
    } else {
      logger.log(`Error checking user existence: ${e.message}`)
      throw e
    }
  }
}

function generatePassword() {
  const length = 16
  // Exclude ambiguous characters: 0,O,1,l,I and avoid punctuation for readability
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  let password = ''

  // Generate random password
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length)
    password += charset[randomIndex]
  }

  // Hash the password using SHA-1
  const hashedPassword = utilities.computeDigest(utilities.DigestAlgorithm.SHA_1, password)

  // Convert byte array to hex string
  const hexPassword = hashedPassword
    .map((byte) => ('0' + (byte & 0xff).toString(16)).slice(-2))
    .join('')

  return {
    password: hexPassword,
    hashFunction: 'SHA-1',
    plainPassword: password, // We'll need this for the welcome email
  }
}

function createWorkspaceUser(userData, primaryEmail, passwordData) {
  try {
    const familyName = `${userData.lastName} ${userData.slastName}`.trim()
    const givenName = `${userData.firstName} ${userData.initial}.`.trim()
    const address = userData.email
    const phone = userData.phone
    const recoveryEmail = userData.email
    const password = passwordData.password
    const hashFunction = passwordData.hashFunction

    const user = workspaceDirectory.Users.insert({
      primaryEmail,
      name: { familyName, givenName },
      emails: [{ address, type: 'home' }],
      phones: [{ value: normalizePhone(phone), type: 'mobile', primary: true }],
      recoveryEmail,
      password,
      hashFunction,
      changePasswordAtNextLogin: true,
    })

    return user
  } catch (error) {
    logger.log(`Error creating workspace user: ${error.message}`)
    return null
  }
}

function addUserToGroup(accountData) {
  const group = 'miembros@sociedadastronomia.com'

  var member = {
    email: accountData.email,
    role: 'MEMBER',
  }

  try {
    // Attempt to add the user to the group
    var addedMember = workspaceDirectory.Members.insert(member, group)

    logger.log(`User ${addedMember.primaryEmail} successfully added to group ${group}.`)
    return { success: true }
  } catch (e) {
    if (e.message.includes('Member already exists')) {
      logger.log(`User ${accountData.email} is already a member of group ${group}.`)
      return { success: true }
    } else {
      logger.log(`Error adding user ${accountData.email} to group ${group}: ${e.message}`)
      return { success: false, error: e.message }
    }
  }
}

function sendWelcomeEmail(accountData) {
  try {
    // Derive full name from firstName, lastName, slastName
    const { firstName, lastName, slastName } = accountData.userData
    const fullName = [firstName, lastName, slastName].filter(Boolean).join(' ')
    const emailBody = generateEmailBody(fullName)

    // Build membership certificate PDF with both last names
    const {
      firstName: nombre,
      initial: inicial,
      lastName: apellido1,
      slastName: apellido2,
    } = accountData.userData
    const certificatePdf = buildMembershipCertificatePdfBlob(nombre, inicial, apellido1, apellido2)
    // Build personalized welcome letter PDF
    const welcomeLetterPdf = buildWelcomeLetterPdfBlob(
      nombre,
      inicial,
      apellido1,
      apellido2,
      accountData.userData.email
    )

    // Set up email options with both attachments
    const emailOptions = { attachments: [certificatePdf, welcomeLetterPdf] }
    if (CC_EMAIL) {
      emailOptions.cc = CC_EMAIL
    }
    if (BCC_EMAIL) {
      emailOptions.bcc = BCC_EMAIL
    }

    gmailApp.sendEmail(
      accountData.userData.email,
      '¡Bienvenido/a a la Sociedad de Astronomía del Caribe!',
      emailBody,
      emailOptions
    )

    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

function generateEmailBody(fullName) {
  return (
    `Estimado/a ${fullName},\n\n` +
    `¡Bienvenido/a a la Sociedad de Astronomía del Caribe!\n` +
    `Adjunto encontrarás tu carta de bienvenida y tu certificado de membresía.\n\n` +
    `Saludos,\n\n` +
    `Rafael Emmanuelli Jiménez\n` +
    `Presidente, Sociedad de Astronomía del Caribe`
  )
}

function validateTemplatePlaceholders(doc, placeholders) {
  const body = doc.getBody()
  const templateName = doc.getName()
  placeholders.forEach((ph) => {
    if (!body.findText(ph)) {
      throw new Error(`Template placeholder ${ph} not found in ${templateName} template`)
    }
  })
}

function buildMembershipCertificatePdfBlob(nombre, inicial, apellido1, apellido2) {
  // 1. grab the real template
  const templateFile = driveApp.getFileById(MEMBERSHIP_CERTIFICATE_TEMPLATE_ID)

  // 2. make a *new* copy of it (this returns the copy)
  const tempFile = templateFile.makeCopy(`MembershipCert-${nombre}-${Date.now()}`)

  // 3. open THAT copy
  const tempId = tempFile.getId()
  const doc = documentApp.openById(tempId)
  const body = doc.getBody()

  // Validate placeholders in membership certificate template
  validateTemplatePlaceholders(doc, ['{{Fecha}}', '{{Nombre}}', '{{Inicial}}', '{{Apellidos}}'])

  // 4. do your replacements on the copy
  const fecha = formatDateSpanish(new Date())
  body.replaceText('{{Fecha}}', fecha)
  body.replaceText('{{Nombre}}', nombre)
  body.replaceText('{{Inicial}}', inicial || '')
  const fullApellidos = [apellido1, apellido2].filter(Boolean).join(' ')
  body.replaceText('{{Apellidos}}', fullApellidos)

  doc.saveAndClose()

  // 5. export PDF and then trash the copy
  const pdfBlob = driveApp
    .getFileById(tempId)
    .getAs(MimeType.PDF)
    .setName(`Certificado-${nombre}.pdf`)

  tempFile.setTrashed(true)
  return pdfBlob
}

function buildWelcomeLetterPdfBlob(nombre, inicial, apellido1, apellido2, email) {
  // 1. grab the real template
  const templateFile = driveApp.getFileById(WELCOME_LETTER_TEMPLATE_ID)

  // 2. make a *new* copy of it (this returns the copy)
  const tempFile = templateFile.makeCopy(`WelcomeLetter-${nombre}-${Date.now()}`)

  // 3. open THAT copy
  const tempId = tempFile.getId()
  const doc = documentApp.openById(tempId)
  const body = doc.getBody()

  // Validate placeholders in welcome letter template
  validateTemplatePlaceholders(doc, [
    '{{fecha}}',
    '{{Nombre}}',
    '{{Inicial}}',
    '{{Apellidos}}',
    '{{E-mail}}',
  ])

  // 4. do your replacements on the copy
  const fecha = utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy')
  body.replaceText('{{fecha}}', fecha)
  body.replaceText('{{Nombre}}', nombre)
  body.replaceText('{{Inicial}}', inicial || '')
  const fullApellidos = [apellido1, apellido2].filter(Boolean).join(' ')
  body.replaceText('{{Apellidos}}', fullApellidos)
  body.replaceText('{{E-mail}}', email)

  doc.saveAndClose()

  // 5. export PDF and then trash the copy
  const pdfBlob = driveApp
    .getFileById(tempId)
    .getAs(MimeType.PDF)
    .setName(`CartaBienvenida-${nombre}.pdf`)

  tempFile.setTrashed(true)
  return pdfBlob
}
// #endregion

// #region Form Submission
function handleFormSubmission(e) {
  try {
    const userData = extractUserData(e)

    // Hard validations (blockers): only email and phone
    const emailError = validateEmail(userData.email)
    const phoneError = validatePhone(userData.phone)

    if (emailError || phoneError) {
      const blockingErrors = [emailError, phoneError].filter(Boolean)
      logger.log(`Validation errors (blocking): ${blockingErrors.join(', ')}`)
      userData.validationErrors = blockingErrors
      sendTemplatedEmail('USER_DATA_VALIDATION_FAILURE', userData)
      return
    }

    // Soft validations (non-blocking): name, initial, last name(s)
    const softErrors = []
    const firstNameError = validateName(userData.firstName, 'First name')
    if (firstNameError) softErrors.push(firstNameError)

    const fullLastNameError = validateName(userData.fullLastName, 'Last name')
    if (fullLastNameError) {
      softErrors.push(fullLastNameError)
    } else {
      const lastNameError = validateName(userData.lastName, 'Last name (first part)')
      if (lastNameError) softErrors.push(lastNameError)
      if (userData.slastName) {
        const slastNameError = validateName(userData.slastName, 'Last name (second part)')
        if (slastNameError) softErrors.push(slastNameError)
      }
    }

    const initialError = validateInitial(userData.initial)
    if (initialError) softErrors.push(initialError)

    const hasSoftErrors = softErrors.length > 0
    if (hasSoftErrors) {
      logger.log(`Non-blocking validation issues: ${softErrors.join(', ')}`)
    }

    // Proceed with upsert
    const spreadsheet = e.source
    const sourceSheet = e.range.getSheet()
    const sourceRow = e.range.getRow()

    const upsertResult = upsertToCleanSheet(spreadsheet, sourceSheet, sourceRow)

    if (upsertResult.success) {
      logger.log(upsertResult.message)
      if (upsertResult.row) {
        const status = hasSoftErrors ? 'INVALID_DATA' : 'VALID'
        setCleanDataStatus(spreadsheet, upsertResult.row, status)
        if (status === 'INVALID_DATA') {
          // Send notification mirroring original behaviour
          userData.validationErrors = softErrors
          sendTemplatedEmail('USER_DATA_VALIDATION_FAILURE', userData)
        }
      }
    } else {
      logger.log(`Error during upsert: ${upsertResult.error}`)
    }
  } catch (error) {
    logger.log(`Error in handleFormSubmission: ${error.message}`)
  }
}

function extractUserData(e) {
  const sheet = e.source.getActiveSheet()
  const row = e.range.getRow()

  const purpose = sheet.getRange(row, 2).getValue()?.toString().trim()
  const firstNameRaw = sheet.getRange(row, 3).getValue()?.toString().trim()
  const firstName = stripCommonTitles(firstNameRaw)
  const initialRaw = sheet.getRange(row, 4).getValue()?.toString().trim()
  const initial = initialRaw ? initialRaw.charAt(0).toUpperCase() : '' // Extract first letter and capitalize
  const fullLastName = sheet.getRange(row, 5).getValue()?.toString().trim()

  let lastName = ''
  let slastName = ''
  if (fullLastName) {
    const nameParts = fullLastName.split(/[\s-]/)
    lastName = nameParts[0] || ''
    slastName = nameParts[1] || ''
  }

  const email = sheet.getRange(row, 6).getValue()
  const phoneRaw = sheet.getRange(row, 7).getValue()
  const phone = normalizePhone(phoneRaw)

  return {
    purpose,
    firstName,
    initial,
    lastName,
    slastName,
    fullLastName,
    email,
    phone,
  }
}

function validateUserData(userData) {
  // Array to collect validation errors
  const errors = []

  // Name validations
  const firstNameError = validateName(userData.firstName, 'First name')
  if (firstNameError) errors.push(firstNameError)

  // Check full last name first
  const fullLastNameError = validateName(userData.fullLastName, 'Last name')
  if (fullLastNameError) {
    errors.push(fullLastNameError)
  } else {
    // Only validate the split parts if the full last name passed validation
    const lastNameError = validateName(userData.lastName, 'Last name (first part)')
    if (lastNameError) errors.push(lastNameError)

    // Only validate second last name if it exists
    if (userData.slastName) {
      const slastNameError = validateName(userData.slastName, 'Last name (second part)')
      if (slastNameError) errors.push(slastNameError)
    }
  }

  // Initial validation
  const initialError = validateInitial(userData.initial)
  if (initialError) errors.push(initialError)

  // Email validation
  const emailError = validateEmail(userData.email)
  if (emailError) errors.push(emailError)

  // Phone validation
  const phoneError = validatePhone(userData.phone)
  if (phoneError) errors.push(phoneError)

  // Return validation result with any errors
  return {
    valid: errors.length === 0,
    errors: errors,
  }
}

function validateName(name, fieldName) {
  if (!name) {
    return `${fieldName} is missing`
  }

  if (name.length < 2) {
    return `${fieldName} is too short (minimum 2 characters)`
  }

  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ\s'-]+$/.test(name)) {
    return `${fieldName} contains invalid characters`
  }

  return null
}

function validateInitial(initial) {
  if (!initial) {
    return null // Initial is optional
  }

  if (!/^[A-Za-z]$/.test(initial)) {
    return 'Initial should be a single letter'
  }

  return null
}

function validateEmail(email) {
  if (!email) {
    return 'Email is missing'
  }

  // RFC 5322 compliant email regex
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

  if (!emailRegex.test(email)) {
    return 'Email format is invalid'
  }

  if (email.length > 320) {
    // Max email length per spec
    return 'Email is too long (maximum 320 characters)'
  }

  return null
}

function validatePhone(phone) {
  // Check if phone is undefined, null, or empty string
  if (phone === undefined || phone === null || phone === '') {
    return 'Phone number is missing'
  }

  // Convert to string (handles number types from spreadsheet)
  const phoneStr = String(phone)

  // Check if it's just whitespace
  if (phoneStr.trim() === '') {
    return 'Phone number is missing'
  }

  // Remove all non-numeric characters for validation
  const numericPhone = phoneStr.replace(/\D/g, '')

  // Check for reasonable phone number length
  if (numericPhone.length < 7) {
    return `Phone number is too short (minimum 7 digits) ${numericPhone}`
  }

  if (numericPhone.length > 15) {
    // Max length per ITU-T E.164
    return `Phone number is too long (maximum 15 digits) ${numericPhone}`
  }

  // Check only for potentially harmful characters, not format
  if (/[^0-9\s()+\-.]/.test(phoneStr)) {
    return `Phone number contains invalid characters ${phoneStr}`
  }

  return null
}

function upsertToCleanSheet(spreadsheet, sourceSheet, sourceRow) {
  try {
    const cleanSheet = spreadsheet.getSheetByName('CLEAN')

    if (!cleanSheet) {
      return { success: false, error: 'CLEAN sheet not found' }
    }

    // Get column headers to ensure we're mapping correctly
    const sourceHeaders = sourceSheet.getRange(1, 1, 1, sourceSheet.getLastColumn()).getValues()[0]
    const cleanHeaders = cleanSheet.getRange(1, 1, 1, cleanSheet.getLastColumn()).getValues()[0]

    // Get the full row data from source
    const rowData = sourceSheet.getRange(sourceRow, 1, 1, sourceHeaders.length).getValues()[0]

    // Find email column indices
    const sourceEmailIndex = findHeaderIndex(sourceHeaders, 'E-mail')
    const cleanEmailIndex = findHeaderIndex(cleanHeaders, 'E-mail')

    if (sourceEmailIndex === -1 || cleanEmailIndex === -1) {
      return { success: false, error: 'Email column not found in one of the sheets' }
    }

    // Get the email from source row (normalized)
    const sourceEmail = String(rowData[sourceEmailIndex] || '')
      .trim()
      .toLowerCase()

    if (!sourceEmail) {
      return { success: false, error: 'Source email is empty' }
    }

    // Find matching row in CLEAN sheet or -1 if not found
    const matchingRow = findMatchingEmailRow(cleanSheet, cleanEmailIndex, sourceEmail)

    if (matchingRow > 1) {
      // Row found (skip header row)
      // Merge data with existing row
      mergeRowData(cleanSheet, matchingRow, cleanHeaders, rowData, sourceHeaders)
      const message = `Updated existing record in CLEAN sheet at row ${matchingRow}`
      return {
        success: true,
        message,
        action: 'updated',
        row: matchingRow,
      }
    } else {
      // No match found, insert new row mapped to CLEAN headers only
      const mappedRow = cleanHeaders.map((header) => {
        const sourceIndex = findHeaderIndex(sourceHeaders, header)
        if (sourceIndex === -1) return ''
        const headerKey = String(header || '')
          .trim()
          .toLowerCase()
        const rawValue = rowData[sourceIndex]
        if (headerKey === 'inicial' || headerKey === 'initial') {
          return normalizeInitialValue(rawValue)
        } else if (headerKey === 'e-mail' || headerKey === 'email') {
          return typeof rawValue === 'string' ? rawValue.trim().toLowerCase() : rawValue
        } else if (
          headerKey === 'phone' ||
          headerKey === 'telefono' ||
          headerKey === 'teléfono' ||
          headerKey === 'phone number' ||
          headerKey === 'tel' ||
          headerKey === 'celular' ||
          headerKey === 'whatsapp'
        ) {
          return formatPhoneForSheet(rawValue)
        } else if (
          headerKey === 'zip' ||
          headerKey === 'zipcode' ||
          headerKey === 'postal code' ||
          headerKey === 'código postal' ||
          headerKey === 'codigo postal'
        ) {
          return formatZipForSheet(rawValue)
        }
        return rawValue
      })
      cleanSheet.appendRow(mappedRow)
      const newRow = cleanSheet.getLastRow()
      return {
        success: true,
        message: `Added new record to CLEAN sheet at row ${newRow}`,
        action: 'inserted',
        row: newRow,
      }
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

function normalizeInitialValue(value) {
  if (value === null || value === undefined) return ''
  const text = String(value).trim()
  if (!text) return ''
  return text.charAt(0).toUpperCase()
}

function stripCommonTitles(text) {
  if (!text) return ''
  let value = String(text).trim()
  const titlePattern = /^(?:dr|dra|ing|ingr|lic|sr|sra|prof|arq|msc|phd)\.?\s+/i
  // Remove repeated titles if present
  while (titlePattern.test(value)) {
    value = value.replace(titlePattern, '').trim()
  }
  return value
}

function ensureCleanStatusColumn(spreadsheet) {
  const cleanSheet = spreadsheet.getSheetByName('CLEAN')
  if (!cleanSheet) return { sheet: null, colIndex: -1 }

  const lastCol = cleanSheet.getLastColumn()
  const headers = cleanSheet.getRange(1, 1, 1, lastCol).getValues()[0]
  let colIndex = headers.indexOf('data_status')

  if (colIndex === -1) {
    // Append a new header column for data_status
    cleanSheet.insertColumnAfter(lastCol)
    const newCol = lastCol + 1
    cleanSheet.getRange(1, newCol).setValue('data_status')
    colIndex = newCol - 1 // zero-based for internal usage
  }

  // Return 0-based index for internal logic and the actual sheet
  return { sheet: cleanSheet, colIndex }
}

function setCleanDataStatus(spreadsheet, targetRow, statusValue) {
  const { sheet, colIndex } = ensureCleanStatusColumn(spreadsheet)
  if (!sheet || colIndex === -1) return

  // Convert 0-based index to 1-based column for Range API
  const colNumber = colIndex + 1
  sheet.getRange(targetRow, colNumber).setValue(statusValue)
}

function findMatchingEmailRow(sheet, emailColIndex, emailToMatch) {
  if (!emailToMatch) return -1

  // Get all data from the sheet
  const data = sheet.getDataRange().getValues()

  // Skip header row, search for matching email
  for (let i = 1; i < data.length; i++) {
    const rowEmail = String(data[i][emailColIndex] || '')
      .trim()
      .toLowerCase()
    if (rowEmail === emailToMatch) {
      return i + 1 // Convert to 1-based row number
    }
  }

  return -1 // No match found
}

function findMatchingPhoneRow(sheet, phoneColIndex, phoneToMatch) {
  if (!phoneToMatch) return -1

  const data = sheet.getDataRange().getValues()

  for (let i = 1; i < data.length; i++) {
    const rowPhone = normalizePhone(data[i][phoneColIndex])
    if (rowPhone && rowPhone === phoneToMatch) {
      return i + 1
    }
  }

  return -1
}

function getPhoneFromSheetRow(sheet, row) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
  const phoneColIndex = findPhoneColumnIndex(headers)
  if (phoneColIndex === -1) return null
  return sheet.getRange(row, phoneColIndex + 1).getValue()
}

function findPhoneColumnIndex(headers) {
  const normalizedHeaders = headers.map((header) =>
    String(header || '')
      .trim()
      .toLowerCase()
  )
  const candidates = ['phone', 'phone number', 'telefono', 'teléfono', 'tel', 'celular', 'whatsapp']

  for (let i = 0; i < normalizedHeaders.length; i++) {
    if (candidates.includes(normalizedHeaders[i])) {
      return i
    }
  }

  return -1
}

function normalizeEmail(email) {
  if (!email) return ''
  return String(email).trim().toLowerCase()
}

function normalizePhoneDigits(phone) {
  if (!phone) return ''
  return String(phone).replace(/\D/g, '').replace(/^0+/, '')
}

// Backward compatibility for existing calls; use digits-only for logic/matching
function normalizePhone(phone) {
  return normalizePhoneDigits(phone)
}

function formatPhoneForSheet(phoneRaw) {
  const raw = String(phoneRaw || '')
  const hasPlus = raw.trim().startsWith('+')
  const digits = normalizePhoneDigits(raw)
  const formatted = hasPlus ? `+${digits}` : digits
  // Wrap in double quotes if starts with '+' to prevent Sheets from treating as formula/number
  return hasPlus ? '"' + formatted + '"' : formatted
}

function formatZipForSheet(zipRaw) {
  const raw = String(zipRaw || '')
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  // Handle ZIP+4 if 9 digits present
  if (digits.length >= 9) {
    const zip5 = digits.slice(0, 5).padStart(5, '0')
    const plus4 = digits.slice(5, 9)
    return "'" + `${zip5}-${plus4}`
  }
  // Pad to 5 digits for standard ZIP
  const zip5 = digits.slice(-5).padStart(5, '0')
  return "'" + zip5
}

function normalizeHeader(header) {
  return String(header || '').trim().toLowerCase()
}

function findHeaderIndex(headers, headerName) {
  const normalizedTarget = normalizeHeader(headerName)
  for (let i = 0; i < headers.length; i++) {
    if (normalizeHeader(headers[i]) === normalizedTarget) {
      return i
    }
  }
  return -1
}

const SPANISH_MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

function formatDateSpanish(date) {
  if (!date || isNaN(date.getTime())) return ''
  const tz =
    typeof Session !== 'undefined' && typeof Session.getScriptTimeZone === 'function'
      ? Session.getScriptTimeZone()
      : 'UTC'
  const day = utilities.formatDate(date, tz, 'd')
  const monthIndex = Number(utilities.formatDate(date, tz, 'M')) - 1
  const year = utilities.formatDate(date, tz, 'yyyy')
  const month =
    SPANISH_MONTH_NAMES[Math.max(0, Math.min(monthIndex, SPANISH_MONTH_NAMES.length - 1))]
  return `${day} de ${month} de ${year}`
}

function mergeRowData(targetSheet, targetRow, targetHeaders, sourceData, sourceHeaders) {
  // Get existing data from target row
  const existingData = targetSheet.getRange(targetRow, 1, 1, targetHeaders.length).getValues()[0]

  // Create merged data row
  const mergedData = []

  for (let i = 0; i < targetHeaders.length; i++) {
    const header = targetHeaders[i]
    const sourceIndex = findHeaderIndex(sourceHeaders, header)

    // If header exists in source and has a non-empty value, use source value
    if (sourceIndex !== -1 && sourceData[sourceIndex] !== null && sourceData[sourceIndex] !== '') {
      const headerKey = String(header || '')
        .trim()
        .toLowerCase()
      let rawValue = sourceData[sourceIndex]
      if (typeof rawValue === 'string') rawValue = rawValue.trim()
      if (headerKey === 'inicial' || headerKey === 'initial') {
        mergedData[i] = normalizeInitialValue(rawValue)
      } else if (headerKey === 'e-mail' || headerKey === 'email') {
        mergedData[i] = typeof rawValue === 'string' ? rawValue.toLowerCase() : rawValue
      } else if (
        headerKey === 'phone' ||
        headerKey === 'telefono' ||
        headerKey === 'teléfono' ||
        headerKey === 'phone number' ||
        headerKey === 'tel' ||
        headerKey === 'celular' ||
        headerKey === 'whatsapp'
      ) {
        mergedData[i] = formatPhoneForSheet(rawValue)
      } else if (
        headerKey === 'zip' ||
        headerKey === 'zipcode' ||
        headerKey === 'postal code' ||
        headerKey === 'código postal' ||
        headerKey === 'codigo postal'
      ) {
        mergedData[i] = formatZipForSheet(rawValue)
      } else {
        mergedData[i] = rawValue
      }
    } else {
      // Otherwise keep existing value
      mergedData[i] = existingData[i]
    }
  }

  // Update the target row with merged data
  targetSheet.getRange(targetRow, 1, 1, mergedData.length).setValues([mergedData])
}

// #endregion

// #region Emails
function sendTemplatedEmail(templateId, data, options = {}) {
  try {
    const template = EMAIL_TEMPLATES[templateId]

    if (!template) {
      logger.log(`Email template "${templateId}" not found`)
      return { success: false, error: 'Template not found' }
    }

    // Evaluate template.to if it's a function; otherwise use its value.
    const templateTo = typeof template.to === 'function' ? template.to(data) : template.to
    // Resolve recipient at send-time with a fallback to the current NOTIFICATION_EMAIL
    const recipient = (options.to || templateTo || NOTIFICATION_EMAIL || '').trim()
    if (!recipient) {
      logger.log(`Template "${templateId}" not sent: no recipient configured`)
      return { success: false, error: 'no recipient' }
    }
    const subject = options.subject || template.subject
    const body = template.bodyGenerator(data)
    const emailOptions = options.emailOptions || {}

    gmailApp.sendEmail(recipient, subject, body, emailOptions)
    logger.log(`Template email "${templateId}" sent successfully to ${recipient}`)

    return { success: true }
  } catch (error) {
    logger.log(`Failed to send template email "${templateId}": ${error.message}`)
    return { success: false, error: error.message }
  }
}

const EMAIL_TEMPLATES = {
  EMAIL_CREATION_FAILURE: {
    to: NOTIFICATION_EMAIL,
    subject: 'Manual Review Required - Email Creation',
    bodyGenerator: (userData) => `
      Manual review needed for new user email creation:
      Name: ${userData.firstName} ${userData.initial || ''} ${userData.lastName} ${
      userData.slastName || ''
    }
      Personal Email: ${userData.email || 'Not provided'}
      Phone: ${userData.phone || 'Not provided'}
      
      All standard email combinations are already in use.
      Please review and create a custom email for this user.
    `,
  },
  USER_DATA_VALIDATION_FAILURE: {
    to: NOTIFICATION_EMAIL,
    subject: 'User Data Validation Failed',
    bodyGenerator: (userData) => {
      let errorDetails = ''
      if (userData.validationErrors && userData.validationErrors.length > 0) {
        errorDetails = 'Validation errors: "' + userData.validationErrors.join('", "') + '"'
      }

      return `
        User data validation failed for spreadsheet entry:
        
        ${errorDetails}
        
        Provided data:
        Name: ${userData.firstName || '[MISSING]'} ${userData.initial || ''} ${
        userData.lastName || '[MISSING]'
      } ${userData.slastName || ''}
        Personal Email: ${userData.email || '[MISSING]'}
        Phone: ${userData.phone || '[MISSING]'}
        
        Please review the spreadsheet entry and ensure all data meets validation requirements.
      `
    },
  },
  PAYMENT_INVALID: {
    to: NOTIFICATION_EMAIL,
    subject: 'Invalid membership payment detected',
    bodyGenerator: (data) => `
      An invalid membership payment was detected in the PAYMENTS sheet.
      Row: ${data.row}
      Sender Email: ${data.senderEmail || '[missing]'}
      Amount Sent: ${data.sentAmount}
      Required Fee: ${data.membershipFee}

      Please review this entry for potential issues.
    `,
  },
  PAYMENT_NO_USER: {
    to: NOTIFICATION_EMAIL,
    subject: 'Payment received from unregistered user',
    bodyGenerator: (paymentData) => `
      A payment was received from an email address not found in the CLEAN sheet.
      
      Payment Details:
      Sender Email: ${paymentData.sender_email}
      Sender Name: ${paymentData.sender_name}
      Sender Phone: ${paymentData.sender_phone}
      Amount: $${paymentData.amount}
      Date: ${paymentData.payment_date} ${paymentData.payment_time}
      Message: ${paymentData.payment_message || 'N/A'}
      
      Email Details:
      Subject: ${paymentData.email_subject}
      From: ${paymentData.email_from}
      To: ${paymentData.email_to}
      Message ID: ${paymentData.message_id}
      
      Action Required: Please add this user to the system manually or investigate the payment.
    `,
  },
  RENEWAL_PAYMENT_INVALID: {
    to: NOTIFICATION_EMAIL,
    subject: 'Invalid renewal payment amount',
    bodyGenerator: (data) => `
      An invalid renewal payment amount was received.
      
      Member Email: ${data.email}
      Amount Sent: $${data.sentAmount}
      Required Fee: $${data.membershipFee}
      
      Please review this payment and contact the member if necessary.
    `,
  },
}
// #endregion
