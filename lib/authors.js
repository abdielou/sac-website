import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

const root = process.cwd()

/** Slug of the fallback author file. It stands for the organization itself. */
export const DEFAULT_AUTHOR_SLUG = 'default'

function authorsDir() {
  return path.join(root, 'data', 'authors')
}

function authorPath(authorSlug) {
  return path.join(authorsDir(), `${authorSlug}.md`)
}

/**
 * Every author slug that has a data/authors/<slug>.md file, sorted.
 * Used by the /authors/[slug] route to prerender one page per author file.
 * @returns {string[]} Author slugs, or an empty array when the directory is missing.
 */
export function listAuthorSlugs() {
  try {
    return fs
      .readdirSync(authorsDir())
      .filter((file) => file.endsWith('.md'))
      .map((file) => file.replace(/\.md$/, ''))
      .sort()
  } catch (error) {
    return []
  }
}

/**
 * Read one author file, frontmatter and markdown body.
 * @param {string} authorSlug - Author slug (filename without extension)
 * @returns {{slug: string, frontMatter: object, content: string}|null} Null when the file is missing.
 */
export function getAuthorProfile(authorSlug) {
  try {
    const source = fs.readFileSync(authorPath(authorSlug), 'utf8')
    const { data, content } = matter(source)
    return { slug: authorSlug, frontMatter: data, content }
  } catch (error) {
    return null
  }
}

/**
 * Get author data from local data/authors/*.md file
 *
 * The returned object carries the slug of the file that was actually read, so a
 * caller can build the /authors/<slug> link. When the requested author has no
 * file, the fallback resolves to the default author and the slug reports that.
 *
 * @param {string} authorSlug - Author slug (filename without extension)
 * @returns {Promise<object>} Author frontmatter data plus a `slug` field
 */
export async function getAuthorData(authorSlug) {
  try {
    const source = fs.readFileSync(authorPath(authorSlug), 'utf8')
    const { data } = matter(source)
    return { ...data, slug: authorSlug }
  } catch (error) {
    // Fall back to default author if specific author not found
    const source = fs.readFileSync(authorPath(DEFAULT_AUTHOR_SLUG), 'utf8')
    const { data } = matter(source)
    return { ...data, slug: DEFAULT_AUTHOR_SLUG }
  }
}

/**
 * Get details for multiple authors
 * @param {string[]} authorSlugs - Array of author slugs
 * @returns {Promise<object[]>} Array of author frontmatter objects, each with a `slug`
 */
export async function getAuthorDetails(authorSlugs) {
  const authors = await Promise.all(authorSlugs.map((slug) => getAuthorData(slug)))
  return authors
}
