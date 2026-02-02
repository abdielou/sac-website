import { auth } from './auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const { pathname } = req.nextUrl

  const isAdminRoute = pathname.startsWith('/admin')
  const isAuthRoute = pathname.startsWith('/auth')
  const isApiAuthRoute = pathname.startsWith('/api/auth')

  // Always allow API auth routes (OAuth callbacks, etc.)
  if (isApiAuthRoute) {
    return NextResponse.next()
  }

  // Redirect authenticated users from /auth pages to /admin
  if (isAuthRoute && isLoggedIn) {
    return NextResponse.redirect(new URL('/admin', req.url))
  }

  // Redirect unauthenticated users from /admin to /auth/signin
  if (isAdminRoute && !isLoggedIn) {
    const signInUrl = new URL('/auth/signin', req.url)
    signInUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(signInUrl)
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/admin/:path*', '/auth/:path*', '/api/auth/:path*'],
}
