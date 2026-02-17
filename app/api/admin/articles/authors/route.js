import { auth } from '../../../../../auth'
import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

/**
 * GET /api/admin/articles/authors
 *
 * Returns the list of available authors from data/authors/*.md files.
 * Each author has a slug (filename without extension) and name (from frontmatter).
 */
export const GET = auth(async function GET(req) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  try {
    const authorsDir = path.join(process.cwd(), 'data', 'authors')
    const files = fs.readdirSync(authorsDir).filter((f) => f.endsWith('.md'))

    const authors = files
      .map((file) => {
        const slug = file.replace(/\.md$/, '')
        try {
          const source = fs.readFileSync(path.join(authorsDir, file), 'utf8')
          const { data } = matter(source)
          return { slug, name: data.name || slug }
        } catch {
          return { slug, name: slug }
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ authors })
  } catch (error) {
    console.error('Error listing authors:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    )
  }
})
