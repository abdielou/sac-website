# Testing Patterns

**Analysis Date:** 2026-01-26

## Test Framework

**Runner:**
- Jest 30.0.4
- Config: `jest.config.js`
- Test environment: jsdom

**Assertion Library:**
- Jest built-in expect API

**Run Commands:**
```bash
npm run test              # Run all tests (jest)
npx jest path/to/test.js  # Run single test file
npm run test -- --watch   # Watch mode (manual command)
```

## Test File Organization

**Location:**
- Co-located in separate `test/` directory at project root
- Organized by feature: `test/galleryPage/` contains all gallery-related component and utility tests

**Naming:**
- Pattern: `[ComponentName].test.js` or `[functionName].test.js`
- Examples: `Card.test.js`, `GalleryGrid.test.js`, `galleryUtils.test.js`, `photos.test.js`

**Structure:**
```
test/
├── galleryPage/
│   ├── Card.test.js
│   ├── GalleryFilters.test.js
│   ├── GalleryGrid.test.js
│   ├── GalleryImageModal.test.js
│   ├── gallery.test.js
│   ├── galleryUtils.test.js
│   └── photos.test.js
```

## Test Structure

**Suite Organization:**
```javascript
// Component test example from Card.test.js
describe('Card Component', () => {
  // Test data setup
  const mockProps = {
    title: 'Test Card Title',
    description: 'Test card description',
    imgSrc: 'http://example.com/test.jpg',
    width: 800,
    height: 600,
    imageOptimize: false,
  }

  // Individual tests
  test('should render without crashing with required props', () => {
    const component = React.createElement(Card, mockProps)
    expect(component).toBeTruthy()
    expect(component.type).toBe(Card)
  })
})
```

**Patterns:**
- Setup: Test data defined at top of describe block (`mockProps`, `mockImages`)
- Teardown: `beforeEach(() => { jest.clearAllMocks() })` used to reset mock state between tests
- Assertion pattern: Multiple expect statements per test for related assertions
- Component testing: Use `React.createElement()` to instantiate components (not shallow/mount rendering)

## Mocking

**Framework:** Jest built-in mock functions

**Patterns:**
```javascript
// Mock React component (from GalleryGrid.test.js)
jest.mock('react-masonry-css', () => {
  return function MockMasonry({ children }) {
    const React = require('react')
    return React.createElement('div', { 'data-testid': 'masonry' }, children)
  }
})

// Mock custom component
jest.mock('@/components/Card', () => {
  return function MockCard(props) {
    const React = require('react')
    global.mockCardProps = props
    return React.createElement('div', { 'data-testid': 'card' }, props.title)
  }
})

// Mock function tracking
const mockOnSelect = jest.fn()
// Later: expect(mockOnSelect).toHaveBeenCalledWith(expectedImage)

// Mock AWS SDK (from photos.test.js)
jest.mock('aws-sdk', () => ({
  S3: jest.fn(() => ({
    listObjectsV2: jest.fn(() => ({
      promise: jest.fn(() => Promise.resolve({ Contents: [] })),
    })),
  })),
}))
```

**What to Mock:**
- External library components (react-masonry-css, react-month-picker)
- External service SDKs (AWS SDK for S3)
- Internal child components when testing parent isolation
- API calls and async operations

**What NOT to Mock:**
- React or Next.js core (rarely needed)
- Utility functions from `lib/` (test the real implementations)
- Simple DOM helpers

## Fixtures and Factories

**Test Data:**
```javascript
// Array of test objects from GalleryGrid.test.js
const mockImages = [
  {
    href: 'image1',
    title: 'Test Image 1',
    description: 'Description 1',
    imgSrc: 'http://example.com/image1.jpg',
    width: 800,
    height: 600,
    imageOptimize: false,
  },
  {
    href: 'image2',
    title: 'Test Image 2',
    description: 'Description 2',
    imgSrc: 'http://example.com/image2.jpg',
    width: 1200,
    height: 800,
    imageOptimize: true,
  },
]

// Metadata fixture from galleryUtils.test.js
const metadata = [{ year: 2021 }, { year: 2022 }, { year: 2023 }]
```

**Location:**
- Defined within test files at describe block scope
- Reused within multiple test cases via beforeEach or direct reference

## Coverage

**Requirements:** Not enforced (no coverage threshold configured)

**Configuration in jest.config.js:**
```javascript
collectCoverageFrom: [
  '**/*.{js,jsx,ts,tsx}',
  '!**/*.d.ts',
  '!**/node_modules/**',
  '!**/.next/**',
]
```

**View Coverage:**
```bash
npx jest --coverage  # Run tests with coverage report
```

## Test Types

**Unit Tests:**
- Scope: Individual components and utility functions in isolation
- Approach: Mock dependencies, test props handling, input/output validation
- Examples: `Card.test.js` tests Card component with various prop combinations; `galleryUtils.test.js` tests utility functions with edge cases (empty arrays, invalid data, type conversion)

**Integration Tests:**
- Scope: Component interaction and data flow (limited in current suite)
- Approach: Test multiple components together with mocked external services
- Examples: `gallery.test.js` tests Gallery page component with mocked GalleryFilters and GalleryGrid; `photos.test.js` tests API endpoint with mocked S3

**E2E Tests:**
- Framework: Not implemented
- Current project relies on unit and integration tests only

## Common Patterns

**Async Testing:**
```javascript
// From photos.test.js
test('should handle successful request', async () => {
  await handler(mockReq, mockRes)

  expect(mockRes.status).toHaveBeenCalledWith(200)
  expect(mockRes.json).toHaveBeenCalled()
})
```

**Error Testing:**
```javascript
// From galleryUtils.test.js - handling invalid data
test('should handle metadata with null/invalid years', () => {
  const metadata = [{ year: null }, { year: 'invalid' }, { year: 2022 }]
  const result = getAvailableYears(metadata)
  expect(result).toContain(2022)
  expect(result.length).toBeGreaterThan(0)
})
```

**Props Validation Testing:**
```javascript
// From GalleryGrid.test.js
test('should validate image object structure', () => {
  const props = { images: mockImages, onSelect: mockOnSelect }
  const component = React.createElement(GalleryGrid, props)

  const firstImage = component.props.images[0]
  expect(typeof firstImage.href).toBe('string')
  expect(typeof firstImage.title).toBe('string')
  expect(typeof firstImage.width).toBe('number')
})
```

**Mock Function Verification:**
```javascript
// From Card.test.js pattern
const mockOnSelect = jest.fn()
test('should receive onSelect function prop', () => {
  const props = { images: mockImages, onSelect: mockOnSelect }
  const component = React.createElement(GalleryGrid, props)

  expect(component.props.onSelect).toBe(mockOnSelect)
  expect(typeof component.props.onSelect).toBe('function')
})
```

**Array and Object Testing:**
```javascript
// From galleryUtils.test.js
test('should return available years from metadata', () => {
  const metadata = [{ year: 2021 }, { year: 2022 }, { year: 2023 }]
  const result = getAvailableYears(metadata)

  expect(Array.isArray(result)).toBe(true)
  expect(result).toContain(2021)
  expect(result).toHaveLength(3)
})
```

## Test Helpers and Setup

**Jest Setup File:** `jest.setup.js`
```javascript
// Basic TextEncoder/TextDecoder polyfill for jsdom
if (typeof TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util')
  global.TextEncoder = TextEncoder
  global.TextDecoder = TextDecoder
}
```

**Module Name Mapping:**
```javascript
// From jest.config.js
moduleNameMapper: {
  '^@/components/(.*)$': '<rootDir>/components/$1',
  '^@/pages/(.*)$': '<rootDir>/pages/$1',
  '^@/lib/(.*)$': '<rootDir>/lib/$1',
}
```

Allows tests to import using path aliases matching source code conventions.

---

*Testing analysis: 2026-01-26*
