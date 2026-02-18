import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

const root = process.cwd()

/**
 * Get author data from local data/authors/*.md file
 * @param {string} authorSlug - Author slug (filename without extension)
 * @returns {Promise<object>} Author frontmatter data
 */
export async function getAuthorData(authorSlug) {
  try {
    const authorPath = path.join(root, 'data', 'authors', `${authorSlug}.md`)
    const source = fs.readFileSync(authorPath, 'utf8')
    const { data } = matter(source)
    return data
  } catch (error) {
    // Fall back to default author if specific author not found
    const defaultPath = path.join(root, 'data', 'authors', 'default.md')
    const source = fs.readFileSync(defaultPath, 'utf8')
    const { data } = matter(source)
    return data
  }
}

/**
 * Get details for multiple authors
 * @param {string[]} authorSlugs - Array of author slugs
 * @returns {Promise<object[]>} Array of author frontmatter objects
 */
export async function getAuthorDetails(authorSlugs) {
  const authors = await Promise.all(authorSlugs.map((slug) => getAuthorData(slug)))
  return authors
}
