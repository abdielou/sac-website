import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'

/**
 * Parse comma-separated email list from environment variable
 * @param {string|undefined} envValue
 * @returns {string[]}
 */
function parseAuthorizedEmails(envValue) {
  if (!envValue) return []
  return envValue
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0)
}

const AUTHORIZED_ADMIN_EMAILS = parseAuthorizedEmails(process.env.AUTHORIZED_ADMIN_EMAILS)
const AUTHORIZED_DOMAIN = 'sociedadastronomia.com'

/**
 * Check if an email is authorized to access the admin dashboard
 * @param {string} email
 * @returns {boolean}
 */
function isAuthorizedEmail(email) {
  const normalizedEmail = email.toLowerCase()

  // Check if email is in the allowlist
  if (AUTHORIZED_ADMIN_EMAILS.includes(normalizedEmail)) {
    return true
  }

  // Check if email domain matches authorized domain
  const domain = normalizedEmail.split('@')[1]
  if (domain === AUTHORIZED_DOMAIN) {
    return true
  }

  return false
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    /**
     * Control whether a user is allowed to sign in
     * @param {object} params
     * @param {object} params.user
     * @param {object} params.account
     * @param {object} params.profile
     * @returns {boolean}
     */
    signIn({ user, account, profile }) {
      const email = user.email?.toLowerCase()

      if (!email) {
        console.log('Sign-in attempt without email')
        return false
      }

      if (isAuthorizedEmail(email)) {
        return true
      }

      console.log(`Unauthorized login attempt: ${email}`)
      return false
    },

    /**
     * Persist user ID in the JWT token
     * @param {object} params
     * @param {object} params.token
     * @param {object} params.user
     * @returns {object}
     */
    jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id
      }
      return token
    },

    /**
     * Include user ID in the session
     * @param {object} params
     * @param {object} params.session
     * @param {object} params.token
     * @returns {object}
     */
    session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id
      }
      return session
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
})
