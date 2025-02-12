const TestScenarios = {
  CLEAN_ENTRY: 'A2:F2',
}

function testOnEdit() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const sheet = ss.getActiveSheet()

  // Mocks
  const mockEvent = {
    source: {
      getActiveSheet: () => sheet,
    },
    range: sheet.getRange(TestScenarios.CLEAN_ENTRY),
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
  // Set up services either from params or defaults
  setupServices(services)

  try {
    const userData = extractUserData(e)

    if (!validateUserData(userData)) {
      logger.log('Required fields missing')
      return
    }

    const accountData = createUserAccount(userData)
    if (!accountData.success) {
      logger.log(`User ${accountData.email} creation failed: ${accountData.error}`)
      return
    }

    const groupResult = addUserToGroup(accountData.email)
    if (!groupResult.success) {
      logger.log(`Group assignment failed: ${groupResult.error}`)
    }

    const emailResult = sendWelcomeEmail(accountData)
    if (!emailResult.success) {
      logger.log(`Email sending failed: ${emailResult.error}`)
    }
  } catch (error) {
    logger.log(`Error in handleOnEdit: ${error.message}`)
  }
}

function extractUserData(e) {
  const sheet = e.source.getActiveSheet()
  const row = e.range.getRow()

  const firstName = sheet.getRange(row, 3).getValue()
  const initial = sheet.getRange(row, 4).getValue()
  const fullLastName = sheet.getRange(row, 5).getValue() // Single column for last name

  // Split the last name on space or hyphen
  const [lastName, slastName = ''] = fullLastName.split(/[\s-]/)

  const email = sheet.getRange(row, 6).getValue()
  const phone = sheet.getRange(row, 7).getValue()

  return {
    firstName,
    initial,
    lastName,
    slastName,
    email,
    phone,
  }
}

function validateUserData(userData) {
  return Boolean(userData.firstName && userData.lastName && userData.email && userData.phone)
}

function createUserAccount(userData) {
  try {
    const sacEmail = createEmail(
      userData.firstName,
      userData.initial,
      userData.lastName,
      userData.slastName
    )

    if (!sacEmail) {
      // Handle admin notification here
      notifyAdminsForManualReview(userData)
      return { success: false, error: 'No available email combinations' }
    }

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

function addUserToGroup(sacEmail) {
  const group = 'miembros@sociedadastronomia.com'

  var member = {
    email: sacEmail,
    role: 'MEMBER',
  }

  try {
    // Attempt to add the user to the group
    var addedMember = workspaceDirectory.Members.insert(member, group)

    logger.log(`User ${addedMember.primaryEmail} successfully added to group ${group}.`)
    return { success: true }
  } catch (e) {
    if (e.message.includes('Member already exists')) {
      logger.log(`User ${sacEmail} is already a member of group ${group}.`)
      return { success: true }
    } else {
      logger.log(`Error adding user ${sacEmail} to group ${group}: ${e.message}`)
      return { success: false, error: e.message }
    }
  }
}

function notifyAdminsForManualReview(userData) {
  const adminEmail = 'admin@sociedadastronomia.com' // TODO: Replace with actual admin email
  const subject = 'Manual Review Required - Email Creation'
  const body = `
        Manual review needed for new user email creation:
        Name: ${userData.firstName} ${userData.initial} ${userData.lastName} ${userData.slastName}
        Personal Email: ${userData.email}
        Phone: ${userData.phone}
        
        All standard email combinations are already in use.
        Please review and create a custom email for this user.
      `

  try {
    gmailApp.sendEmail(adminEmail, subject, body)
    logger.log('Admin notification sent successfully')
  } catch (error) {
    logger.log(`Failed to send admin notification: ${error.message}`)
  }
}
