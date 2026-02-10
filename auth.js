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
      authorization: {
        params: {
          access_type: 'offline',
          prompt: 'consent',
          scope: 'openid email profile https://www.googleapis.com/auth/drive.readonly',
        },
      },
    }),
  ],
  callbacks: {
    /**
     * Control whether a user is allowed to sign in
     */
    signIn({ user }) {
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
     * Persist user ID and Google OAuth tokens in the JWT.
     * On initial sign-in, account contains the tokens.
     * On subsequent requests, refresh the access token if expired.
     */
    async jwt({ token, user, account }) {
      // Initial sign-in: capture OAuth tokens
      if (account) {
        token.id = user?.id
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
        token.expiresAt = account.expires_at // epoch seconds
        return token
      }

      // Not expired yet — return as-is
      if (token.expiresAt && Date.now() < token.expiresAt * 1000) {
        return token
      }

      // Expired — refresh using the refresh token
      if (token.refreshToken) {
        try {
          const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: process.env.GOOGLE_CLIENT_ID,
              client_secret: process.env.GOOGLE_CLIENT_SECRET,
              grant_type: 'refresh_token',
              refresh_token: token.refreshToken,
            }),
          })
          const data = await response.json()

          if (data.access_token) {
            token.accessToken = data.access_token
            token.expiresAt = Math.floor(Date.now() / 1000) + data.expires_in
          }
        } catch (err) {
          console.error('Failed to refresh Google token:', err.message)
        }
      }

      return token
    },

    /**
     * Include user ID and access token in the session.
     * accessToken is used server-side by API routes to call Apps Script.
     */
    session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id
      }
      session.accessToken = token.accessToken
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
