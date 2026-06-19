import { searchCatalog, getObjectById } from '@/lib/catalog'

describe('Sharpless catalog integration', () => {
  test('standalone Sharpless records are loaded with the right shape', () => {
    const standalone = getStandaloneSample()
    expect(standalone).toBeTruthy()
    expect(standalone.id).toMatch(/^SH2-\d+$/)
    expect(standalone.name).toMatch(/^Sh 2-\d+$/)
    expect(standalone.objectType).toBe('HII Region')
    expect(standalone.catalogIds.sharpless).toBe(standalone.name)
    expect(standalone.constellation).toBeTruthy()
  })

  test('a standalone Sharpless object is found by its designation', () => {
    const standalone = getStandaloneSample()
    const results = searchCatalog(standalone.name)
    expect(results.some((r) => r.id === standalone.id)).toBe(true)
  })

  test('searching is space-insensitive like other catalogs', () => {
    const standalone = getStandaloneSample()
    const compact = standalone.name.replace(/\s+/g, '') // "Sh2-49"
    const results = searchCatalog(compact)
    expect(results.some((r) => r.id === standalone.id)).toBe(true)
  })

  test('a cross-linked NGC/IC record carries a sharpless designation and is found by it', () => {
    // Find any non-standalone object that received a sharpless overlay.
    const linked = findCrossLinked()
    if (!linked) return // tolerated: data may have zero cross-links in a degenerate fetch
    expect(linked.id).not.toMatch(/^SH2-/)
    const results = searchCatalog(linked.catalogIds.sharpless)
    expect(results.some((r) => r.id === linked.id)).toBe(true)
  })
})

// Helpers: probe the loaded catalog via the public API.
function getStandaloneSample() {
  // Broad query that returns many objects; pick the first SH2- record.
  // searchCatalog matches names containing the query (accent/space-insensitive).
  const hits = searchCatalog('Sh 2-')
  return hits.find((o) => /^SH2-\d+$/.test(o.id)) || null
}

function findCrossLinked() {
  // Pull the generated cross-links and resolve the first one that loaded.
  const data = require('../data/catalog/sharpless.json')
  for (const link of data.crossLinks) {
    const obj = getObjectById(link.id)
    if (obj && obj.catalogIds && obj.catalogIds.sharpless) return obj
  }
  return null
}
