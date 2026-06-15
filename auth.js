import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import {
  canAccessDashboard,
  getAccessibleFeatures,
  getAllPermissions,
  isAdmin,
} from './lib/permissions.js'

/**
 * Dev-only auth bypass. Active ONLY in non-production with an explicit opt-in flag.
 * Lets a local developer obtain an admin session without a real Google login.
 * Fails closed: in production the provider is never registered, regardless of the flag.
 */
export const devBypassEnabled =
  process.env.NODE_ENV !== 'production' && process.env.AUTH_DEV_BYPASS === 'true'

/**
 * Check if an email is authorized to access the admin dashboard
 * @param {string} email
 * @returns {boolean}
 */
function isAuthorizedEmail(email) {
  return canAccessDashboard(email)
}

const providers = [
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    authorization: {
      params: {
        access_type: 'offline',
        // Always show Google's account picker so members logged into a personal
        // Gmail in the browser can choose their @sociedadastronomia.com account.
        prompt: 'select_account consent',
        scope: 'openid email profile',
      },
    },
  }),
]

if (devBypassEnabled) {
  // Mock credentials provider: authorizes a single configurable dev identity.
  // The user's permissions still flow through ADMIN_PERMISSIONS via the jwt/session
  // callbacks. No real Google access token is issued (accessToken stays null), so any
  // Apps Script / Drive call fails gracefully — reinforcing prod-data isolation.
  providers.push(
    Credentials({
      id: 'dev-bypass',
      name: 'Dev Bypass',
      credentials: {},
      authorize() {
        return {
          id: 'dev-bypass',
          email: (process.env.AUTH_DEV_EMAIL || 'dev@local.test').toLowerCase(),
          name: 'Dev Admin',
        }
      },
    })
  )
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers,
  callbacks: {
    /**
     * Control whether a user is allowed to sign in
     */
    signIn({ user, account }) {
      // Dev-only bypass: allow the mock provider when explicitly enabled.
      if (devBypassEnabled && account?.provider === 'dev-bypass') {
        return true
      }

      const email = user.email?.toLowerCase()

      if (!email) {
        console.log('Sign-in attempt without email')
        return false
      }

      if (isAuthorizedEmail(email)) {
        return true
      }

      // SAC member domain
      if (email.endsWith('@sociedadastronomia.com')) {
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

        // Role determination
        const email = token.email?.toLowerCase()
        token.isMember = email?.endsWith('@sociedadastronomia.com') || false
        token.isAdmin = isAuthorizedEmail(email) || false

        // For members, also store the sign-in email as their SAC email
        // (members sign in with their SAC Google account, so this IS their SAC email)
        if (token.isMember) {
          token.sacEmail = email
        }

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
     * Also include user permissions for client-side access control.
     */
    session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id
      }
      session.accessToken = token.accessToken

      // Add user permissions to session for client-side access control
      if (session.user?.email) {
        session.user.accessibleFeatures = getAccessibleFeatures(session.user.email)
        session.user.accessibleActions = getAllPermissions(session.user.email)
        session.user.isAdmin = canAccessDashboard(session.user.email)
        session.user.isFullAdmin = isAdmin(session.user.email)
        // Member flag and SAC email from JWT
        session.user.isMember = token.isMember || false
        session.user.sacEmail = token.sacEmail || session.user.email
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
