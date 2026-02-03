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

/**
 * Check if an email is authorized to access the admin dashboard
 * Only emails explicitly listed in AUTHORIZED_ADMIN_EMAILS are allowed
 * @param {string} email
 * @returns {boolean}
 */
function isAuthorizedEmail(email) {
  const normalizedEmail = email.toLowerCase()

  // Only allow emails explicitly in the allowlist
  return AUTHORIZED_ADMIN_EMAILS.includes(normalizedEmail)
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
