import {
  putArticleJSON,
  getArticleJSON,
  deleteArticleJSON,
  getArticleIndex,
  putArticleIndex,
} from '@/lib/articles-s3'

export const ARTICLE_FIELDS = [
  'title',
  'date',
  'lastmod',
  'tags',
  'summary',
  'content',
  'images',
  'imgWidth',
  'imgHeight',
  'authors',
  'draft',
  'archived',
  'slug',
]

export const INDEX_FIELDS = [
  'title',
  'date',
  'lastmod',
  'tags',
  'summary',
  'images',
  'imgWidth',
  'imgHeight',
  'authors',
  'draft',
  'archived',
  'slug',
]

const ACCENT_MAP = {
  '\u00e1': 'a',
  '\u00e9': 'e',
  '\u00ed': 'i',
  '\u00f3': 'o',
  '\u00fa': 'u',
  '\u00c1': 'a',
  '\u00c9': 'e',
  '\u00cd': 'i',
  '\u00d3': 'o',
  '\u00da': 'u',
  '\u00f1': 'n',
  '\u00d1': 'n',
  '\u00fc': 'u',
  '\u00dc': 'u',
}

function removeAccents(str) {
  return str.replace(/[áéíóúÁÉÍÓÚñÑüÜ]/g, (char) => ACCENT_MAP[char] || char)
}

function generateSlug(title, date) {
  const d = new Date(date)
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')

  const slugified = removeAccents(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return `${year}/${month}/${day}/${slugified}`
}

function articleKey(slug) {
  return `articles/${slug}.json`
}

function extractIndexFields(article) {
  const entry = {}
  for (const field of INDEX_FIELDS) {
    if (article[field] !== undefined) {
      entry[field] = article[field]
    }
  }
  return entry
}

function sortByDateDesc(articles) {
  return articles.sort((a, b) => new Date(b.date) - new Date(a.date))
}

async function rebuildIndexEntry(action, article, oldSlug) {
  const index = await getArticleIndex()
  let articles = index.articles || []

  if (action === 'add') {
    articles.push(extractIndexFields(article))
    articles = sortByDateDesc(articles)
  } else if (action === 'update') {
    const matchSlug = oldSlug || article.slug
    const idx = articles.findIndex((a) => a.slug === matchSlug)
    if (idx !== -1) {
      articles[idx] = extractIndexFields(article)
    } else {
      articles.push(extractIndexFields(article))
    }
    articles = sortByDateDesc(articles)
  } else if (action === 'remove') {
    articles = articles.filter((a) => a.slug !== oldSlug)
  }

  await putArticleIndex({
    articles,
    updatedAt: new Date().toISOString(),
  })
}

export async function createArticle(data) {
  const slug = data.slug || generateSlug(data.title, data.date)
  const now = new Date().toISOString()
  const dateStr = data.date instanceof Date ? data.date.toISOString() : data.date

  const article = {
    title: data.title,
    date: dateStr,
    lastmod: now,
    tags: data.tags || [],
    summary: data.summary || '',
    content: data.content || '',
    images: data.images || [],
    imgWidth: data.imgWidth || null,
    imgHeight: data.imgHeight || null,
    authors: data.authors || [],
    draft: data.draft !== undefined ? data.draft : true,
    archived: data.archived !== undefined ? data.archived : false,
    slug,
  }

  await putArticleJSON(articleKey(slug), article)
  await rebuildIndexEntry('add', article)

  return article
}

export async function getArticle(slug) {
  return getArticleJSON(articleKey(slug))
}

export async function updateArticle(slug, updates) {
  const current = await getArticleJSON(articleKey(slug))
  const updatedArticle = { ...current, ...updates }
  updatedArticle.lastmod = new Date().toISOString()

  const newSlug = updates.slug && updates.slug !== slug ? updates.slug : slug

  if (newSlug !== slug) {
    await deleteArticleJSON(articleKey(slug))
    updatedArticle.slug = newSlug
  }

  await putArticleJSON(articleKey(newSlug), updatedArticle)
  await rebuildIndexEntry('update', updatedArticle, slug)

  return updatedArticle
}

export async function deleteArticle(slug) {
  await deleteArticleJSON(articleKey(slug))
  await rebuildIndexEntry('remove', null, slug)

  return { deleted: true, slug }
}

export async function listArticles({
  includeDrafts = true,
  tag = null,
  page = 1,
  pageSize = 50,
} = {}) {
  const index = await getArticleIndex()
  let articles = index.articles || []

  // Filter out archived
  articles = articles.filter((a) => a.archived !== true)

  // Filter drafts
  if (!includeDrafts) {
    articles = articles.filter((a) => a.draft !== true)
  }

  // Filter by tag (case-insensitive)
  if (tag) {
    const tagLower = tag.toLowerCase()
    articles = articles.filter(
      (a) => Array.isArray(a.tags) && a.tags.some((t) => t.toLowerCase() === tagLower)
    )
  }

  // Sort newest-first
  articles = sortByDateDesc(articles)

  const total = articles.length
  const totalPages = Math.ceil(total / pageSize)
  const start = (page - 1) * pageSize
  const paginated = articles.slice(start, start + pageSize)

  return {
    articles: paginated,
    total,
    page,
    pageSize,
    totalPages,
  }
}
