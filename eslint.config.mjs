import { defineConfig, globalIgnores } from 'eslint/config'
import nextConfig from 'eslint-config-next/core-web-vitals'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'

export default defineConfig([
  ...nextConfig,
  eslintPluginPrettierRecommended,
  {
    rules: {
      'prettier/prettier': ['error', { semi: false }],
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 0,
      'no-unused-vars': 0,
      'react/no-unescaped-entities': 0,
      'jsx-a11y/anchor-is-valid': [
        'error',
        {
          components: ['Link'],
          specialLink: ['hrefLeft', 'hrefRight'],
          aspects: ['invalidHref', 'preferButton'],
        },
      ],
      // Disable overly strict React 19 rules that flag valid hydration patterns
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/static-components': 'off',
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'node_modules/**',
    'appsscript/**/*.js',
    '**/venv/**',
    'scripts/**/venv/**',
  ]),
])
