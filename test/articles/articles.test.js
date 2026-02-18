// Article Data Layer Tests

// Track S3 calls for assertions
const mockPutObject = jest.fn(() => ({ promise: jest.fn(() => Promise.resolve({})) }))
const mockGetObject = jest.fn(() => ({
  promise: jest.fn(() =>
    Promise.resolve({
      Body: Buffer.from('{}'),
    })
  ),
}))
const mockDeleteObject = jest.fn(() => ({ promise: jest.fn(() => Promise.resolve({})) }))

jest.mock('aws-sdk', () => ({
  S3: jest.fn(() => ({
    putObject: mockPutObject,
    getObject: mockGetObject,
    deleteObject: mockDeleteObject,
  })),
}))

import {
  createArticle,
  getArticle,
  updateArticle,
  deleteArticle,
  listArticles,
  ARTICLE_FIELDS,
  INDEX_FIELDS,
} from '../../lib/articles.js'

import { getArticleIndex } from '../../lib/articles-s3.js'

// Helper to set up mockGetObject for specific keys
function mockGetObjectForKey(keyBodyMap) {
  mockGetObject.mockImplementation((params) => ({
    promise: jest.fn(() => {
      const body = keyBodyMap[params.Key]
      if (body === undefined) {
        const err = new Error('NoSuchKey')
        err.code = 'NoSuchKey'
        return Promise.reject(err)
      }
      return Promise.resolve({
        Body: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
      })
    }),
  }))
}

describe('Article Data Layer', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Default: no index exists (cold start)
    mockGetObjectForKey({})
  })

  describe('Constants', () => {
    test('ARTICLE_FIELDS includes content and all metadata fields', () => {
      expect(ARTICLE_FIELDS).toContain('title')
      expect(ARTICLE_FIELDS).toContain('content')
      expect(ARTICLE_FIELDS).toContain('slug')
      expect(ARTICLE_FIELDS).toContain('date')
      expect(ARTICLE_FIELDS).toContain('lastmod')
      expect(ARTICLE_FIELDS).toContain('tags')
      expect(ARTICLE_FIELDS).toContain('summary')
      expect(ARTICLE_FIELDS).toContain('images')
      expect(ARTICLE_FIELDS).toContain('imgWidth')
      expect(ARTICLE_FIELDS).toContain('imgHeight')
      expect(ARTICLE_FIELDS).toContain('authors')
      expect(ARTICLE_FIELDS).toContain('draft')
      expect(ARTICLE_FIELDS).toContain('archived')
    })

    test('INDEX_FIELDS excludes content but includes all other fields', () => {
      expect(INDEX_FIELDS).not.toContain('content')
      expect(INDEX_FIELDS).toContain('title')
      expect(INDEX_FIELDS).toContain('slug')
      expect(INDEX_FIELDS).toContain('date')
    })
  })

  describe('Slug generation (via createArticle)', () => {
    test('generates date-path slug from title and date', async () => {
      const result = await createArticle({
        title: 'Cometa Leonard',
        date: '2024-02-15T08:00:00Z',
        content: 'Article content',
      })

      expect(result.slug).toBe('2024/02/15/cometa-leonard')
    })

    test('removes Spanish accents from slugs', async () => {
      const result = await createArticle({
        title: 'Alineación de planetas',
        date: '2024-03-10T08:00:00Z',
        content: 'Content',
      })

      expect(result.slug).toBe('2024/03/10/alineacion-de-planetas')
    })

    test('uses custom slug when provided', async () => {
      const result = await createArticle({
        title: 'Some Title',
        date: '2024-01-01T08:00:00Z',
        slug: 'custom/slug/path',
        content: 'Content',
      })

      expect(result.slug).toBe('custom/slug/path')
    })
  })

  describe('createArticle', () => {
    test('writes article to S3 with correct key', async () => {
      const result = await createArticle({
        title: 'Test Article',
        date: '2024-06-01T08:00:00Z',
        content: 'Hello world',
      })

      expect(mockPutObject).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: `articles/${result.slug}.json`,
          ContentType: 'application/json',
        })
      )
    })

    test('stored JSON contains all ARTICLE_FIELDS', async () => {
      const result = await createArticle({
        title: 'Full Article',
        date: '2024-06-01T08:00:00Z',
        content: 'Content here',
        tags: ['cometa'],
        summary: 'A summary',
      })

      for (const field of ARTICLE_FIELDS) {
        expect(result).toHaveProperty(field)
      }
    })

    test('sets lastmod to a recent ISO timestamp', async () => {
      const before = new Date()
      const result = await createArticle({
        title: 'Timed Article',
        date: '2024-06-01T08:00:00Z',
        content: 'Content',
      })
      const after = new Date()

      const lastmod = new Date(result.lastmod)
      expect(lastmod.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000)
      expect(lastmod.getTime()).toBeLessThanOrEqual(after.getTime() + 1000)
    })

    test('draft defaults to true when not specified', async () => {
      const result = await createArticle({
        title: 'Draft Article',
        date: '2024-06-01T08:00:00Z',
        content: 'Content',
      })

      expect(result.draft).toBe(true)
    })

    test('updates the index after creation', async () => {
      await createArticle({
        title: 'Indexed Article',
        date: '2024-06-01T08:00:00Z',
        content: 'Content',
      })

      // putObject should be called twice: once for article, once for index
      expect(mockPutObject).toHaveBeenCalledTimes(2)
      const indexCall = mockPutObject.mock.calls.find(
        (call) => call[0].Key === 'articles/index.json'
      )
      expect(indexCall).toBeDefined()
    })
  })

  describe('getArticle', () => {
    test('returns parsed article from S3', async () => {
      const article = {
        title: 'Stored Article',
        slug: '2024/06/01/stored-article',
        content: 'Content',
      }
      mockGetObjectForKey({
        'articles/2024/06/01/stored-article.json': article,
      })

      const result = await getArticle('2024/06/01/stored-article')
      expect(result.title).toBe('Stored Article')
      expect(result.content).toBe('Content')
    })

    test('throws descriptive error when article not found', async () => {
      mockGetObjectForKey({})

      await expect(getArticle('nonexistent/slug')).rejects.toThrow('Article not found')
    })
  })

  describe('updateArticle', () => {
    test('reads existing article, merges updates, and writes back', async () => {
      const existing = {
        title: 'Original Title',
        slug: '2024/06/01/original-title',
        date: '2024-06-01T08:00:00Z',
        content: 'Original content',
        tags: ['old'],
        draft: true,
      }

      mockGetObjectForKey({
        'articles/2024/06/01/original-title.json': existing,
        'articles/index.json': { articles: [existing], updatedAt: null },
      })

      const result = await updateArticle('2024/06/01/original-title', {
        title: 'Updated Title',
        tags: ['new'],
      })

      expect(result.title).toBe('Updated Title')
      expect(result.tags).toEqual(['new'])
      expect(result.content).toBe('Original content') // preserved
    })

    test('refreshes lastmod on update', async () => {
      const existing = {
        title: 'Old Article',
        slug: '2024/06/01/old-article',
        lastmod: '2020-01-01T00:00:00Z',
        content: 'Content',
      }

      mockGetObjectForKey({
        'articles/2024/06/01/old-article.json': existing,
        'articles/index.json': { articles: [existing], updatedAt: null },
      })

      const before = new Date()
      const result = await updateArticle('2024/06/01/old-article', { title: 'New Title' })

      const lastmod = new Date(result.lastmod)
      expect(lastmod.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000)
    })

    test('updates index entry after edit', async () => {
      const existing = {
        title: 'Indexed',
        slug: '2024/06/01/indexed',
        date: '2024-06-01T08:00:00Z',
        content: 'Content',
      }

      mockGetObjectForKey({
        'articles/2024/06/01/indexed.json': existing,
        'articles/index.json': { articles: [{ title: 'Indexed', slug: '2024/06/01/indexed' }], updatedAt: null },
      })

      await updateArticle('2024/06/01/indexed', { title: 'Renamed' })

      const indexCall = mockPutObject.mock.calls.find(
        (call) => call[0].Key === 'articles/index.json'
      )
      expect(indexCall).toBeDefined()
      const indexData = JSON.parse(indexCall[0].Body)
      expect(indexData.articles[0].title).toBe('Renamed')
    })
  })

  describe('deleteArticle', () => {
    test('calls deleteObject with correct key', async () => {
      mockGetObjectForKey({
        'articles/index.json': {
          articles: [{ slug: '2024/06/01/to-delete', title: 'Delete Me' }],
          updatedAt: null,
        },
      })

      await deleteArticle('2024/06/01/to-delete')

      expect(mockDeleteObject).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: 'articles/2024/06/01/to-delete.json',
        })
      )
    })

    test('removes entry from index', async () => {
      mockGetObjectForKey({
        'articles/index.json': {
          articles: [
            { slug: '2024/06/01/keep', title: 'Keep' },
            { slug: '2024/06/01/remove', title: 'Remove' },
          ],
          updatedAt: null,
        },
      })

      await deleteArticle('2024/06/01/remove')

      const indexCall = mockPutObject.mock.calls.find(
        (call) => call[0].Key === 'articles/index.json'
      )
      expect(indexCall).toBeDefined()
      const indexData = JSON.parse(indexCall[0].Body)
      expect(indexData.articles).toHaveLength(1)
      expect(indexData.articles[0].slug).toBe('2024/06/01/keep')
    })

    test('returns deleted confirmation', async () => {
      mockGetObjectForKey({
        'articles/index.json': { articles: [], updatedAt: null },
      })

      const result = await deleteArticle('2024/06/01/gone')

      expect(result).toEqual({ deleted: true, slug: '2024/06/01/gone' })
    })
  })

  describe('listArticles', () => {
    const indexArticles = [
      {
        title: 'Draft Article',
        slug: '2024/06/01/draft',
        date: '2024-06-01T08:00:00Z',
        tags: ['cometa'],
        draft: true,
        archived: false,
      },
      {
        title: 'Published Recent',
        slug: '2024/07/15/published-recent',
        date: '2024-07-15T08:00:00Z',
        tags: ['eclipse'],
        draft: false,
        archived: false,
      },
      {
        title: 'Published Old',
        slug: '2024/01/10/published-old',
        date: '2024-01-10T08:00:00Z',
        tags: ['cometa', 'eclipse'],
        draft: false,
        archived: false,
      },
    ]

    beforeEach(() => {
      mockGetObjectForKey({
        'articles/index.json': { articles: indexArticles, updatedAt: '2024-07-15T12:00:00Z' },
      })
    })

    test('returns all non-archived articles by default (includeDrafts=true)', async () => {
      const result = await listArticles()

      expect(result.articles).toHaveLength(3)
      expect(result.total).toBe(3)
    })

    test('excludes drafts when includeDrafts is false', async () => {
      const result = await listArticles({ includeDrafts: false })

      expect(result.articles).toHaveLength(2)
      expect(result.articles.every((a) => a.draft !== true)).toBe(true)
    })

    test('filters by tag (case-insensitive)', async () => {
      const result = await listArticles({ tag: 'Cometa' })

      expect(result.articles).toHaveLength(2)
      expect(result.articles.every((a) => a.tags.some((t) => t.toLowerCase() === 'cometa'))).toBe(
        true
      )
    })

    test('sorts results newest-first by date', async () => {
      const result = await listArticles()

      expect(result.articles[0].slug).toBe('2024/07/15/published-recent')
      expect(result.articles[2].slug).toBe('2024/01/10/published-old')
    })

    test('paginates correctly', async () => {
      const result = await listArticles({ pageSize: 2, page: 1 })

      expect(result.articles).toHaveLength(2)
      expect(result.total).toBe(3)
      expect(result.totalPages).toBe(2)
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(2)

      // Page 2
      const page2 = await listArticles({ pageSize: 2, page: 2 })
      expect(page2.articles).toHaveLength(1)
    })

    test('excludes archived articles', async () => {
      mockGetObjectForKey({
        'articles/index.json': {
          articles: [
            ...indexArticles,
            {
              title: 'Archived',
              slug: '2023/01/01/archived',
              date: '2023-01-01T08:00:00Z',
              tags: [],
              draft: false,
              archived: true,
            },
          ],
          updatedAt: null,
        },
      })

      const result = await listArticles()
      expect(result.articles).toHaveLength(3)
      expect(result.articles.find((a) => a.slug === '2023/01/01/archived')).toBeUndefined()
    })
  })

  describe('Index cold start', () => {
    test('getArticleIndex returns empty index when no index.json exists', async () => {
      mockGetObjectForKey({})

      const result = await getArticleIndex()
      expect(result).toEqual({ articles: [], updatedAt: null })
    })

    test('createArticle works when no index exists (creates it)', async () => {
      mockGetObjectForKey({})

      const result = await createArticle({
        title: 'First Article',
        date: '2024-01-01T08:00:00Z',
        content: 'Content',
      })

      expect(result.title).toBe('First Article')
      // Should have written both article and index
      expect(mockPutObject).toHaveBeenCalledTimes(2)

      const indexCall = mockPutObject.mock.calls.find(
        (call) => call[0].Key === 'articles/index.json'
      )
      expect(indexCall).toBeDefined()
      const indexData = JSON.parse(indexCall[0].Body)
      expect(indexData.articles).toHaveLength(1)
      expect(indexData.articles[0].title).toBe('First Article')
      expect(indexData.updatedAt).toBeDefined()
    })
  })
})
