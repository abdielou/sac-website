import { auth } from '../../../../auth'
import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

/**
 * POST /api/admin/revalidate
 *
 * Request body:
 * - paths: string[] (optional) - Array of paths to revalidate
 *
 * If no paths provided, revalidates common blog paths (/blog, /tags, /feed.xml)
 * If specific paths provided, revalidates those paths + /blog and /tags
 */
export const POST = auth(async function POST(req) {
  // Auth check - return 401 if not authenticated
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  try {
    const body = await req.json().catch(() => ({}))
    const providedPaths = Array.isArray(body.paths) ? body.paths : []

    // Paths to revalidate
    const pathsToRevalidate = new Set()

    // If no specific paths provided, revalidate common blog paths
    if (providedPaths.length === 0) {
      pathsToRevalidate.add('/blog')
      pathsToRevalidate.add('/tags')
      pathsToRevalidate.add('/feed.xml')
    } else {
      // Add provided paths
      providedPaths.forEach((path) => pathsToRevalidate.add(path))

      // Always revalidate blog index and tags on any mutation
      pathsToRevalidate.add('/blog')
      pathsToRevalidate.add('/tags')
    }

    // Execute revalidation for each path
    const revalidated = []
    for (const path of pathsToRevalidate) {
      try {
        revalidatePath(path)
        revalidated.push(path)
      } catch (error) {
        console.error(`Error revalidating path ${path}:`, error)
      }
    }

    return NextResponse.json({
      revalidated: true,
      paths: revalidated,
    })
  } catch (error) {
    console.error('Error during revalidation:', error)
    return NextResponse.json(
      {
        error: 'Error al revalidar',
        details: error.message,
      },
      { status: 500 }
    )
  }
})
