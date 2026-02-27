import { auth } from './auth'
import { NextResponse } from 'next/server'

const proxy = auth((req) => {
  const isLoggedIn = !!req.auth
  const { pathname } = req.nextUrl

  const isAdminApiRoute = pathname.startsWith('/api/admin')
  const isAdminRoute = pathname.startsWith('/admin')
  const isMemberApiRoute = pathname.startsWith('/api/member')
  const isMemberRoute = pathname.startsWith('/member')
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

  // Admin API routes: reject non-admin authenticated users
  if (isAdminApiRoute && isLoggedIn) {
    const isAdmin = req.auth?.user?.isAdmin
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'No autorizado', details: 'Admin access required' },
        { status: 403 }
      )
    }
  }

  // Admin page routes: redirect to sign-in
  if (isAdminRoute && !isLoggedIn) {
    const signInUrl = new URL('/auth/signin', req.url)
    signInUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(signInUrl)
  }

  // Admin routes: reject non-admin authenticated users (e.g., members)
  if (isAdminRoute && isLoggedIn) {
    const isAdmin = req.auth?.user?.isAdmin
    if (!isAdmin) {
      return NextResponse.redirect(new URL('/member', req.url))
    }
  }

  // Member API routes: return 401 JSON
  if (isMemberApiRoute && !isLoggedIn) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  // Member page routes: redirect to sign-in
  if (isMemberRoute && !isLoggedIn) {
    const signInUrl = new URL('/auth/signin', req.url)
    signInUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(signInUrl)
  }

  // Redirect authenticated users from /auth pages to appropriate area
  if (isAuthRoute && isLoggedIn) {
    const isAdmin = req.auth?.user?.isAdmin
    const destination = isAdmin ? '/admin' : '/member'
    return NextResponse.redirect(new URL(destination, req.url))
  }

  return NextResponse.next()
})

export { proxy }

export const config = {
  matcher: [
    '/admin',
    '/admin/:path*',
    '/api/admin/:path*',
    '/member',
    '/member/:path*',
    '/api/member/:path*',
    '/auth/:path*',
    '/api/auth/:path*',
  ],
}
