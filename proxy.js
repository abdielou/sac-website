import { auth } from './auth'
import { NextResponse } from 'next/server'

const proxy = auth((req) => {
  const isLoggedIn = !!req.auth
  const { pathname } = req.nextUrl

  const isAdminApiRoute = pathname.startsWith('/api/admin')
  const isAdminRoute = pathname.startsWith('/admin')
  const isAuthRoute = pathname.startsWith('/auth')
  const isApiAuthRoute = pathname.startsWith('/api/auth')

  // Always allow API auth routes (OAuth callbacks, etc.)
  if (isApiAuthRoute) {
    return NextResponse.next()
  }

  // Admin API routes: return 401 JSON (not redirect)
  if (isAdminApiRoute && !isLoggedIn) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  // Admin page routes: redirect to sign-in
  if (isAdminRoute && !isLoggedIn) {
    const signInUrl = new URL('/auth/signin', req.url)
    signInUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(signInUrl)
  }

  // Redirect authenticated users from /auth pages to /admin
  if (isAuthRoute && isLoggedIn) {
    return NextResponse.redirect(new URL('/admin', req.url))
  }

  return NextResponse.next()
})

export { proxy }

export const config = {
  matcher: ['/admin', '/admin/:path*', '/api/admin/:path*', '/auth/:path*', '/api/auth/:path*'],
}
