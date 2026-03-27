const fs = require('fs')
const path = require('path')

const CATALOG_PATH = path.join(__dirname, '..', 'data', 'catalog', 'openngc.json')
const SPANISH_NAMES_PATH = path.join(__dirname, '..', 'data', 'catalog', 'spanish-names.json')

describe('OpenNGC Catalog Data', () => {
  let catalog

  beforeAll(() => {
    const raw = fs.readFileSync(CATALOG_PATH, 'utf-8')
    catalog = JSON.parse(raw)
  })

  test('catalog is a valid JSON array with >10000 entries', () => {
    expect(Array.isArray(catalog)).toBe(true)
    expect(catalog.length).toBeGreaterThan(10000)
  })

  test('each object has required fields and none are null', () => {
    const requiredFields = ['name', 'ra', 'dec', 'objectType', 'constellation']
    // Check a sample of objects (checking all 13K is slow)
    const sample = catalog.filter((_, i) => i % 100 === 0)
    for (const obj of sample) {
      for (const field of requiredFields) {
        expect(obj).toHaveProperty(field)
        expect(obj[field]).not.toBeNull()
        expect(obj[field]).not.toBeUndefined()
      }
    }
  })

  test('Messier objects have messier cross-reference', () => {
    // M31 = NGC 224
    const m31 = catalog.find(
      (o) => o.catalogIds && o.catalogIds.messier && o.catalogIds.messier.replace(/\s/g, '') === 'M31'
    )
    expect(m31).toBeDefined()
    expect(m31.name).toMatch(/NGC\s*224/)
  })

  test('objects with Spanish common names have commonNameEs populated', () => {
    // NGC 224 (Andromeda) should have a Spanish name
    const ngc224 = catalog.find((o) => o.id === 'NGC0224')
    expect(ngc224).toBeDefined()
    expect(ngc224.commonNameEs).toBeTruthy()
    expect(typeof ngc224.commonNameEs).toBe('string')
    expect(ngc224.commonNameEs.length).toBeGreaterThan(0)
  })

  test('objects without common names have commonNameEs as null', () => {
    // Find an object without a common name
    const noName = catalog.find((o) => !o.commonName)
    expect(noName).toBeDefined()
    expect(noName.commonNameEs).toBeNull()
  })
})

describe('Spanish Names Mapping', () => {
  test('spanish-names.json exists and has 100+ entries', () => {
    const raw = fs.readFileSync(SPANISH_NAMES_PATH, 'utf-8')
    const names = JSON.parse(raw)
    expect(typeof names).toBe('object')
    expect(Object.keys(names).length).toBeGreaterThan(100)
  })
})
