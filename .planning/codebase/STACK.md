# Technology Stack

**Analysis Date:** 2026-01-26

## Languages

**Primary:**
- JavaScript - Used throughout frontend and backend (Node.js API routes)
- JSX/MDX - Used for React components and blog content

**Secondary:**
- CSS - Styling via Tailwind (no TypeScript in this project)

## Runtime

**Environment:**
- Node.js (no specific version locked; recommended via package.json usage patterns)

**Package Manager:**
- npm
- Lockfile: `package-lock.json` (assumed present, not in git)

## Frameworks

**Core:**
- Next.js 12.1.0 - Full-stack React framework with API routes and static generation
- React 17.0.2 - UI component library
- Preact 10.5.13 - Production build optimization (aliases React/React-DOM in webpack for smaller bundle)

**Styling:**
- Tailwind CSS 2.2.2 - Utility-first CSS framework
- PostCSS 8.3.5 - CSS processing
- @tailwindcss/forms 0.3.2 - Form component styles
- @tailwindcss/typography 0.4.0 - Prose styling for MDX content

**Content Processing:**
- mdx-bundler 6.0.1 - MDX compilation and bundling
- gray-matter 4.0.2 - YAML frontmatter parsing
- remark-gfm 2.0.0 - GitHub Flavored Markdown support
- remark-math 5.0.0 - Math/LaTeX support
- remark-footnotes 4.0.0 - Footnote support
- rehype-slug 5.0.0 - Auto-generate heading IDs
- rehype-autolink-headings 6.0.0 - Clickable heading links
- rehype-prism-plus 1.1.0 - Syntax highlighting for code blocks
- rehype-katex 6.0.0 - Math/LaTeX rendering

**UI Components:**
- react-month-picker 2.2.1 - Month selection widget
- react-month-picker-input 1.3.10 - Month input component
- react-player 2.9.0 - Video player
- react-responsive 10.0.1 - Responsive media queries
- react-masonry-css 1.0.16 - Masonry layout for photo gallery
- smoothscroll-polyfill 0.4.4 - Smooth scroll browser compatibility
- next-themes 0.0.14 - Dark mode theme switching

**Image & Media:**
- sharp 0.30.7 - Image processing and optimization
- image-size 1.0.0 - Extract image dimensions
- @svgr/webpack 6.2.1 - SVG as React components (webpack loader)
- file-loader 6.0.0 - Asset file loading

**Utilities:**
- swr 1.2.1 - Data fetching and caching
- node-cache 5.1.2 - In-memory caching for API responses (APOD)
- reading-time 1.3.0 - Estimate article read time
- github-slugger 1.3.0 - Generate GitHub-style URL slugs
- unist-util-visit 4.0.0 - AST tree traversal
- rss-to-json 2.0.2 - Parse RSS feeds (NASA APOD)
- esbuild 0.12.15 - JavaScript bundler (as dependency)
- autoprefixer 10.2.5 - CSS vendor prefixes

**Testing:**
- Jest 30.0.4 - Test framework
- jest-environment-jsdom 30.0.4 - DOM environment for browser tests
- babel-jest 30.0.4 - Babel integration for Jest

**Development & Build:**
- Babel 7.28.0 (@babel/core, @babel/preset-env, @babel/preset-react) - JavaScript transpilation
- ESLint 7.29.0 - Code linting
- eslint-config-next 12.0.1 - Next.js ESLint rules
- eslint-config-prettier 8.3.0 - Prettier integration
- eslint-plugin-jsx-a11y 6.4.1 - Accessibility linting
- eslint-plugin-prettier 3.3.1 - Prettier as ESLint rule
- Prettier 2.2.1 - Code formatting
- lint-staged 11.0.0 - Pre-commit hook runner
- @next/bundle-analyzer 12.0.1 - Bundle size analysis
- cross-env 7.0.3 - Cross-platform environment variables
- next-remote-watch 1.0.0 - Remote file watching for CMS
- socket.io 4.4.1 - WebSocket server (dev dependency)
- socket.io-client 4.1.3 - WebSocket client (dev dependency)

**Utilities:**
- inquirer 8.1.1 - Interactive CLI prompts (build scripts)
- globby 11.0.3 - File globbing utility
- csv-parse 5.6.0 - CSV parsing (dev dependency)
- csv-stringify 6.5.2 - CSV generation (dev dependency)
- dedent 0.7.0 - Template string dedenting

## Configuration

**Environment:**
- `.env` file (use `.env.template` as reference)
- Environment variables passed at build/runtime for:
  - AWS S3 credentials and region
  - Newsletter API keys (Mailchimp/Buttondown/ConvertKit)
  - Comment system (Giscus/Utterances/Disqus)
  - Google Analytics

**Build:**
- `next.config.js` - Next.js configuration with Preact aliasing, webpack customization, image domains
- `webpack` rules for PNG/JPG/GIF/MP4 and SVG file handling
- MDX page extension support (`pageExtensions: ['js', 'jsx', 'md', 'mdx']`)

**Code Style:**
- `.eslintrc.js` - ESLint configuration (extends Next.js + Prettier)
- `prettier.config.js` - Prettier formatting (semi: false, singleQuote: true, printWidth: 100)
- `jsconfig.json` - Path aliases (@/components, @/lib, @/layouts, @/data, @/css)

**Path Aliases (jsconfig.json):**
- `@/components/*` → `components/`
- `@/data/*` → `data/`
- `@/layouts/*` → `layouts/`
- `@/lib/*` → `lib/`
- `@/css/*` → `css/`

## Platform Requirements

**Development:**
- Node.js (version not explicitly locked; inferred to support ES2020+ features)
- npm package manager
- Bash/shell (for npm scripts using `node` directly)

**Production:**
- Vercel (deployment target, indicated in `siteMetadata.js`: `siteUrl: 'https://sac-website.vercel.app/'`)
- Supports serverless Node.js runtime for API routes

---

*Stack analysis: 2026-01-26*
