// TODO:
// - [ ] Try to find workspace emails for existing users when override processing is running and populate if found
// - [ ] Read membership status from another spreadsheet sheet

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

// #region Manual Overrides
let MANUAL_OVERRIDE_RANGE = '' // Manual override range, e.g. '5-15'

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

      // If sac_email already present, skip silently
      if (existingSac) {
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
        const displayName = `${firstName || ''} ${fullLastName || ''}`.trim()
        logger.log(`[WARN] User ${displayName || '[unknown name]'} does not exist in the workspace`)
        processed++
        continue
      }

      matched++

      // Write sac_email immediately
      cleanSheet.getRange(row, sacEmailIdx + 1).setValue(confirmedEmail)

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
}
// #endregion

// #region Global service variables
let logger
let workspaceDirectory
let gmailApp
let driveApp
let utilities
let documentApp
let NOTIFICATION_EMAIL = 'abdiel.aviles@sociedadastronomia.com'
let CC_EMAIL = '' //'rafael.emmanuelli@sociedadastronomia.com'
const MEMBERSHIP_CERTIFICATE_TEMPLATE_ID = '15c_hbWVzQB5g-k93JRTQqhmJy3d3kz6r-g0fCN_OR14'
const WELCOME_LETTER_TEMPLATE_ID = '1A8kQTpqcDC7YyU7C3Cr9UNE-4wED5RBGSMxQD4C5tYA'
const SPREADSHEET_ID = '1-wdja5GQP5q5IQPloxjDTgJO1w2gS_spQK_IfFc5NNQ'
const EMAIL_FILTER_SENDER = 'finance@sociedadastronomia.com'
const EMAIL_FILTER_RECEIVER = 'finance@sociedadastronomia.com'
const EMAIL_SEARCH_WINDOW_DAYS = 14
const EMAIL_FILTER_SUBJECT_CONTAINS = 'paid'
const SAC_DOMAIN = '@sociedadastronomia.com'
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
  }
  if (typeof services.CC_EMAIL === 'string') {
    CC_EMAIL = services.CC_EMAIL
  }
}

function onFormSubmit(e) {
  handle_formIsSubmitted(e, {})
}

function onEdit(e) {
  handle_sheetIsEdited(e, {})
}

function onNewMemberships(e) {
  handle_scheduledPaymentScan(e, {})
}

function onChange(e) {
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
  const query = `from:${EMAIL_FILTER_SENDER} to:${EMAIL_FILTER_RECEIVER} subject:${EMAIL_FILTER_SUBJECT_CONTAINS} newer_than:${EMAIL_SEARCH_WINDOW_DAYS}d`
  const threads = gmailApp.search(query)
  threads.forEach((thread) => {
    const messages = thread.getMessages()
    messages.forEach(processPaymentEmail)
  })
}

function processPaymentEmail(msg) {
  // 1. Extract payment data
  const paymentData = extractPaymentData(msg)

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
// #endregion

// #region Payment Recorded
const MEMBERSHIP_FEE = 25
function handlePaymentRecorded(paymentsSheet, cleanSheet, row) {
  // 1. Retrieve and validate payment from event
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

  // 2. Find user from payment by email
  const emailToMatch = normalizeEmail(senderEmail)
  const cleanHeaders = cleanSheet.getRange(1, 1, 1, cleanSheet.getLastColumn()).getValues()[0]
  const emailColIndex = cleanHeaders.indexOf('E-mail')
  const phoneColIndex = findPhoneColumnIndex(cleanHeaders)

  if (emailColIndex === -1 && phoneColIndex === -1) {
    logger.log(`Neither E-mail nor phone column found in CLEAN sheet`)
    return
  }

  let matchedRow = -1
  if (emailColIndex !== -1) {
    matchedRow = findMatchingEmailRow(cleanSheet, emailColIndex, emailToMatch)
  }

  let matchedPhone = ''
  if (matchedRow === -1 && phoneColIndex !== -1) {
    const paymentPhone = getPhoneFromSheetRow(paymentsSheet, row)
    const phoneToMatch = normalizePhone(paymentPhone)
    if (phoneToMatch) {
      matchedRow = findMatchingPhoneRow(cleanSheet, phoneColIndex, phoneToMatch)
      matchedPhone = paymentPhone || phoneToMatch
    }
  }

  if (matchedRow === -1) {
    logger.log(
      `User with email ${senderEmail}${
        matchedPhone ? ` or phone ${matchedPhone}` : ''
      } not found in CLEAN sheet`
    )
    return
  }

  // 2.25 If user exists but CLEAN.data_status is not VALID, mark payment as UNMATCHED_USER_DIRTY and stop
  const dataStatusIndex = cleanHeaders.indexOf('data_status')
  if (dataStatusIndex !== -1) {
    const rawStatus = cleanSheet.getRange(matchedRow, dataStatusIndex + 1).getValue()
    const normalizedStatus = String(rawStatus || '')
      .trim()
      .toUpperCase()
    if (normalizedStatus && normalizedStatus !== 'VALID') {
      const paymentsHeaders = paymentsSheet
        .getRange(1, 1, 1, paymentsSheet.getLastColumn())
        .getValues()[0]
      let matchStatusCol = -1
      for (let i = 0; i < paymentsHeaders.length; i++) {
        const h = String(paymentsHeaders[i] || '')
          .trim()
          .toLowerCase()
        if (h === 'match status' || h === 'match_status' || h === 'status') {
          matchStatusCol = i + 1
          break
        }
      }
      if (matchStatusCol !== -1) {
        paymentsSheet.getRange(row, matchStatusCol).setValue('UNMATCHED_USER_DIRTY')
        logger.log(
          `Payment at row ${row} flagged as UNMATCHED_USER_DIRTY due to user data_status=${normalizedStatus}`
        )
      } else {
        logger.log(`PAYMENTS match_status column not found; could not flag UNMATCHED_USER_DIRTY`)
      }
      return
    }
  }

  // 2.5 Skip if user was already created
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
  const phone = rowValues[6]

  logger.log(`Processing payment for ${name} ${senderEmail} ${phone} ${sentAmount}`)

  // 3. Create user account account
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

  // 4. Add user to group
  const groupResult = addUserToGroup(accountResult)
  if (!groupResult.success) {
    logger.log(`Failed to add user to group: ${groupResult.error}`)
  }

  // 5. Send welcome email
  const welcomeResult = sendWelcomeEmail(accountResult)
  if (!welcomeResult.success) {
    logger.log(`Failed to send welcome email: ${welcomeResult.error}`)
  }

  // 6. Notify admin of new user account creation
  const adminSubject = `New user account created: ${accountResult.email}`
  const adminBody =
    `A new user account has been created for ${firstName} ${fullLastName}.\n` +
    `Account Email: ${accountResult.email}\n` +
    `Personal Email: ${senderEmail}\n` +
    `Phone: ${phone}`
  gmailApp.sendEmail(NOTIFICATION_EMAIL, adminSubject, adminBody)

  // 7. Mark user as created in CLEAN sheet
  const createdAtIndex = cleanHeaders.indexOf('created_at')
  if (createdAtIndex !== -1) {
    cleanSheet.getRange(matchedRow, createdAtIndex + 1).setValue(new Date())
  } else {
    logger.log('created_at column not found in CLEAN sheet')
  }

  // 7.1 Save generated SAC email in CLEAN sheet (column 'sac_email')
  let sacEmailCol = cleanHeaders.indexOf('sac_email')
  if (sacEmailCol === -1) {
    // Add new column at the end with header 'sac_email'
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
    const sacEmail = `${username}${domain}`
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
      phones: [{ value: phone, type: 'mobile', primary: true }],
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
  validateTemplatePlaceholders(doc, ['{{Nombre}}', '{{Inicial}}', '{{Apellidos}}'])

  // 4. do your replacements on the copy
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
  const phone = sheet.getRange(row, 7).getValue()

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
    const sourceEmailIndex = sourceHeaders.indexOf('E-mail')
    const cleanEmailIndex = cleanHeaders.indexOf('E-mail')

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
        const sourceIndex = sourceHeaders.indexOf(header)
        if (sourceIndex === -1) return ''
        const headerKey = String(header || '')
          .trim()
          .toLowerCase()
        const rawValue = rowData[sourceIndex]
        if (headerKey === 'inicial' || headerKey === 'initial') {
          return normalizeInitialValue(rawValue)
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

function normalizePhone(phone) {
  if (!phone) return ''
  return String(phone).replace(/\D/g, '').replace(/^0+/, '')
}

function mergeRowData(targetSheet, targetRow, targetHeaders, sourceData, sourceHeaders) {
  // Get existing data from target row
  const existingData = targetSheet.getRange(targetRow, 1, 1, targetHeaders.length).getValues()[0]

  // Create merged data row
  const mergedData = []

  for (let i = 0; i < targetHeaders.length; i++) {
    const header = targetHeaders[i]
    const sourceIndex = sourceHeaders.indexOf(header)

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

    const recipient = options.to || template.to
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
