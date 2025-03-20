const TestScenarios = {
  CLEAN_ENTRY: 'A2:F2',
  MISSING_EMAIL_W_PHONE: 'A3:F3',
  MISSING_PHONE_W_EMAIL: 'A4:F4',
  MISSING_BOTH: 'A5:F5',
  BAD_EMAIL: 'A6:F6',
  BAD_PHONE: 'A7:F7',
  BAD_NAME: 'A8:F8',
}

function testOnEdit() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const sheet = ss.getActiveSheet()

  // Mocks
  const mockEvent = {
    source: {
      getActiveSheet: () => sheet,
    },
    range: sheet.getRange(TestScenarios.BAD_PHONE),
  }
  const mockUser = {
    primaryEmail: 'test@example.com',
    name: { familyName: 'Doe', givenName: 'John' },
    emails: [{ address: 'test@example.com', type: 'home' }],
    phones: [{ value: '1234567890', type: 'mobile', primary: true }],
    recoveryEmail: 'test@example.com',
    password: 'password123',
  }
  const mockServices = {
    workspaceDirectory: {
      Users: {
        insert: (user) => {
          Logger.log('Inserted user', user)
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
          Logger.log('Inserted member', member)
          return {
            ...mockUser,
            email: member.email,
          }
        },
      },
    },
    gmailApp: {
      sendEmail: (email, subject, body, options) =>
        Logger.log('Sent email', email, subject, body, options),
    },
    driveApp: {
      getFilesByName: (name) => {
        // Return an iterator-like object
        let hasBeenCalled = false
        return {
          hasNext: () => !hasBeenCalled,
          next: () => {
            if (!hasBeenCalled) {
              hasBeenCalled = true
              return {
                getAs: (mimeType) => ({
                  name: 'Test welcome pdf.pdf',
                  mimeType: mimeType,
                  content: 'mock pdf content',
                }),
              }
            }
            throw new Error('No more files')
          },
        }
      },
    },
  }

  // Call handleOnEdit with mock services
  handleOnEdit(mockEvent, mockServices)
}

// Global service variables
let logger
let workspaceDirectory
let gmailApp
let driveApp
let utilities
let NOTIFICATION_EMAIL = 'junta@sociedadastronomia.com'

function onEdit(e) {
  handleOnEdit(e, {
    logger: Logger,
    workspaceDirectory: WorkspaceDirectory,
    gmailApp: GmailApp,
    driveApp: DriveApp,
  })
}

function setupServices(services = {}) {
  logger = services.logger || Logger
  workspaceDirectory = services.workspaceDirectory || WorkspaceDirectory
  gmailApp = services.gmailApp || GmailApp
  driveApp = services.driveApp || DriveApp
  utilities = services.utilities || Utilities
}

function handleOnEdit(e, services = null) {
  setupServices(services)

  try {
    const userData = extractUserData(e)

    // Get validation result
    const validationResult = validateUserData(userData)

    if (!validationResult.valid) {
      logger.log('Validation errors: ' + validationResult.errors.join(', '))
      userData.validationErrors = validationResult.errors
      sendTemplatedEmail('USER_DATA_VALIDATION_FAILURE', userData)
      return
    }

    logger.log('User data validated successfully')
  } catch (error) {
    logger.log(`Error in handleOnEdit: ${error.message}`)
  }
}

function extractUserData(e) {
  const sheet = e.source.getActiveSheet()
  const row = e.range.getRow()

  const purpose = sheet.getRange(row, 2).getValue()
  const firstName = sheet.getRange(row, 3).getValue()
  const initial = sheet.getRange(row, 4).getValue()
  const fullLastName = sheet.getRange(row, 5).getValue() // Single column for last name

  // Validate the full last name first
  let lastName = ''
  let slastName = ''

  if (fullLastName) {
    // Only split if there's something to split
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
    fullLastName, // Add the original full last name
    email,
    phone,
  }
}

/**
 * Validates the purpose of the form
 * @param {string} purpose - The purpose of the form
 * @returns {string|null} Error message or null if valid
 */
function validatePurpose(purpose) {
  if (purpose !== 'Nueva Membresía') {
    return `Invalid form purpose: can only handle new memberships ${purpose}`
  }
  return null
}

/**
 * Validates a person's name
 * @param {string} name - The name to validate
 * @param {string} fieldName - Field name for error messages
 * @returns {string|null} Error message or null if valid
 */
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

/**
 * Validates a name initial
 * @param {string} initial - The initial to validate
 * @returns {string|null} Error message or null if valid
 */
function validateInitial(initial) {
  if (!initial) {
    return null // Initial is optional
  }

  if (!/^[A-Za-z]$/.test(initial)) {
    return 'Initial should be a single letter'
  }

  return null
}

/**
 * Validates an email address
 * @param {string} email - The email to validate
 * @returns {string|null} Error message or null if valid
 */
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

/**
 * Validates a phone number
 * @param {string|number} phone - The phone number to validate
 * @returns {string|null} Error message or null if valid
 */
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

/**
 * Main validation function for user data
 * @param {Object} userData - User data to validate
 * @returns {Object} Validation result with structure: {valid: boolean, errors: string[]}
 */
function validateUserData(userData) {
  // Array to collect validation errors
  const errors = []

  // Validate form purpose
  const purposeError = validatePurpose(userData.purpose)
  if (purposeError) errors.push(purposeError)

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

function generatePassword() {
  const length = 12
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()'
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

function sendWelcomeEmail(accountData) {
  try {
    const subject = '¡Bienvenido a la Sociedad de Astronomia del Caribe!'
    const emailBody = generateEmailBody(
      accountData.userData.firstName,
      accountData.email,
      accountData.password
    )

    // Get welcome PDF files
    const pdfFiles = driveApp.getFilesByName('Test welcome pdf.pdf')

    // Set up email options
    const emailOptions = {}

    // Only add attachment if exactly one PDF is found
    if (pdfFiles.hasNext()) {
      const welcomePdf = pdfFiles.next()

      // Check there isn't more than one file (which would be unexpected)
      if (!pdfFiles.hasNext()) {
        emailOptions.attachments = [welcomePdf.getAs(MimeType.PDF)]
      } else {
        logger.log('Warning: Multiple welcome PDFs found, skipping attachment')
      }
    } else {
      logger.log('Warning: Welcome PDF not found, sending email without attachment')
    }

    gmailApp.sendEmail(accountData.userData.email, subject, emailBody, emailOptions)

    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

function generateEmailBody(firstName, sacEmail, password) {
  const template = {
    greeting: `Saludos, ${firstName}`,
    intro:
      '\n\nSu nueva cuenta ha sido creada. Revise en la linea inferior para los detalles. Adjunto se encuentra la carta de bienvenida',
    email: `\n\nSu dirección de correo electrónico: ${sacEmail}`,
    password: `\nSu contraseña: ${password}`,
    signature: '\nCordialmente,\nSociedad De Astronomia del Caribe',
  }

  return Object.values(template).join('')
}

function createEmail(firstName, initial, lastName, slastName) {
  const domain = '@sociedadastronomia.com'

  // Try different email combinations in order of preference
  const emailCombinations = [
    `${firstName}.${lastName}`.toLowerCase(),
    slastName && `${firstName}.${lastName}.${slastName}`.toLowerCase(),
    initial && `${firstName}.${initial}.${lastName}`.toLowerCase(),
    initial && slastName && `${firstName}.${initial}.${lastName}.${slastName}`.toLowerCase(),
  ].filter(Boolean) // Remove any undefined/null combinations

  for (const username of emailCombinations) {
    const sacEmail = `${username}${domain}`
    if (!checkUserExists(sacEmail)) {
      logger.log(`Unique email created: ${sacEmail}`)
      return sacEmail
    }
    logger.log(`User ${sacEmail} already exists. Trying next combination.`)
  }

  // No available combinations found
  logger.log('All email combinations exist. Manual review needed.')
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

// Email templates repository
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
}

/**
 * Generic function to send emails using templates
 * @param {string} templateId - The ID of the template to use
 * @param {Object} data - Data to populate the template
 * @param {Object} options - Additional email options (optional)
 * @returns {Object} Result of the email operation
 */
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
