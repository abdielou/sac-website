# Coding Conventions

**Analysis Date:** 2026-01-26

## Naming Patterns

**Files:**
- PascalCase for React components: `Card.js`, `GalleryGrid.js`, `GalleryFilters.js`
- camelCase for utility/helper functions: `galleryUtils.js`, `formatDate.js`, `htmlEscaper.js`
- camelCase for API routes: `apod.js`, `photos.js`, `mailchimp.js`, `buttondown.js`
- lowercase with hyphens for directories organizing by feature: `components/`, `layouts/`, `lib/utils/`

**Functions:**
- PascalCase for React component functions: `export default function GalleryGrid({ images, onSelect })`
- camelCase for regular functions: `getAvailableYears()`, `getMonthNames()`, `formatDate()`, `extractImgSrc()`
- PascalCase for higher-order components and factory functions
- Arrow functions used for small inline utilities: `const OptimizedImage = ({ alt, imageOptimize, ...rest }) => ...`

**Variables:**
- camelCase for all variables and state: `searchTerm`, `setSearchTerm`, `initialDisplayPosts`, `mockGalleryGridProps`
- Descriptive names with context: `postDateTemplate`, `NASA_APOD_RSS_URL` (constants in UPPER_SNAKE_CASE)
- Prefixed with mock/test context in tests: `mockReq`, `mockRes`, `mockProps`, `mockImages`

**Types:**
- Props objects structured with destructuring in function parameters
- No PropTypes validation (explicit disable in ESLint config: `'react/prop-types': 0`)
- Implicit prop shape through JSDoc comments or inline documentation

## Code Style

**Formatting:**
- Prettier 2.2.1 is used for code formatting
- Line length: Not explicitly set, follows default Prettier behavior
- No semicolons enforced: `'prettier/prettier': ['error', { semi: false }]` in ESLint config
- Two-space indentation (Prettier default)

**Linting:**
- ESLint 7.29.0 with next configuration
- Extended configs: `eslint:recommended`, `plugin:jsx-a11y/recommended`, `plugin:prettier/recommended`, `next`, `next/core-web-vitals`
- Key rules:
  - `'react/react-in-jsx-scope': 'off'` - Not needed in React 17+
  - `'jsx-a11y/anchor-is-valid'` - Custom config for Next.js Link components
  - `'no-unused-vars': 0` - Disabled (rely on IDE/Prettier)
  - `'react/no-unescaped-entities': 0` - Allow raw HTML entities in JSX

**Lint Command:**
```bash
npm run lint  # ESLint with auto-fix on pages, components, lib, layouts, scripts
```

## Import Organization

**Order:**
1. External library imports (React, next, third-party packages): `import React from 'react'`, `import Link from 'next/link'`, `import AWS from 'aws-sdk'`
2. Absolute path aliases (using @ prefix): `import { getAllFilesFrontMatter } from '@/lib/mdx'`, `import GalleryGrid from '@/components/GalleryGrid'`
3. Relative imports: `import formatDate from '../../lib/utils/formatDate'`

**Path Aliases:**
- `@/components/*` → `components/*`
- `@/pages/*` → `pages/*`
- `@/lib/*` → `lib/*`
- `@/layouts/*` → `layouts/*`
- `@/css/*` → `css/*`
- `@/data/*` → `data/*`

Used consistently throughout components and pages, defined in `jsconfig.json`.

## Error Handling

**Patterns:**
- Try-catch blocks in API routes with explicit error responses:
  ```javascript
  try {
    // operation
    return res.status(200).json(apod)
  } catch (error) {
    return res.status(500).json({ error: 'Something went wrong' })
  }
  ```

- Input validation before processing:
  ```javascript
  if (!email) {
    return res.status(400).json({ error: 'Email is required' })
  }
  ```

- Detailed error logging in catch blocks:
  ```javascript
  console.error('S3 list error:', error)
  return res.status(500).json({ error: 'Failed to load gallery' })
  ```

- Optional chaining for safe property access: `head.Metadata.title || ''`, `req.query?.year`

## Logging

**Framework:** `console` object directly

**Patterns:**
- `console.error()` used for API error logging with context: `console.error('S3 list error:', error)`
- Contextual error messages that describe what operation failed
- No structured logging or logging library (plain console)
- Error logging typically in catch blocks only

## Comments

**When to Comment:**
- Inline comments for regex patterns: `// S3 metadata keys are lowercased`
- Comments explaining non-obvious logic: `// Interpret 'false' explicitly as false; default to true`
- Comments for workarounds or platform-specific code: `// https://github.com/kentcdodds/mdx-bundler#nextjs-esbuild-enoent`
- Platform detection comments: `// replace is needed to work on Windows`

**JSDoc/TSDoc:**
- Not extensively used in codebase
- Functional comments above utility functions: `// Returns the distinct years present in an array of image metadata, sorted in descending order.`
- Function descriptions and parameter comments in utility functions

**ESLint Disable Comments:**
- `// eslint-disable-next-line [rule]` for specific rule suppression
- `/* eslint-disable-next-line @next/next/no-img-element */` for Next.js specific rules
- `/* eslint-disable [rule] */` for whole-file suppression

## Function Design

**Size:**
- Small, focused functions (most under 50 lines)
- API handlers typically 15-40 lines with error handling
- Utility functions 5-25 lines
- Complex utilities like MDX bundling broken into separate functions

**Parameters:**
- Destructured object parameters for components: `function GalleryGrid({ images, onSelect })`
- Named parameters in utility functions: `getMonthNames(locale = 'es')`
- Default parameter values used: `width = 1088`, `height = 612`, `imageOptimize = true`
- Spread operator for remaining props: `const OptimizedImage = ({ alt, imageOptimize, ...rest }) => ...`

**Return Values:**
- Explicit returns for components (JSX)
- Promise returns for async functions
- Error-first response pattern in API routes: return error OR success JSON
- Array and object returns in utility functions with clear types

## Module Design

**Exports:**
- Default exports for most components: `export default function Card(...)`
- Named exports for utility functions: `export function getAvailableYears(metadata)`, `export const logEvent = (...)`
- API route handlers always as default export: `export default async function handler(req, res)`

**Barrel Files:**
- Analytics functions exported with specific provider pattern: `export const logEvent` per provider (`GoogleAnalytics.js`, `Plausible.js`, `SimpleAnalytics.js`)
- Comments/analytics components re-export implementations through index files

---

*Convention analysis: 2026-01-26*
