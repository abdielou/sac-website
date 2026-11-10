module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/components/(.*)$': '<rootDir>/components/$1',
    '^@/data/(.*)$': '<rootDir>/data/$1',
    '^@/pages/(.*)$': '<rootDir>/pages/$1',
    '^@/lib/(.*)$': '<rootDir>/lib/$1',
    '^.+\\.svg$': '<rootDir>/test/__mocks__/svgMock.js',
  },
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': [
      'babel-jest',
      { presets: ['@babel/preset-env', '@babel/preset-react'] },
    ],
  },
  // The AI SDK and the AWS SDK v3 ship ESM (the AWS SDK for the browser
  // condition jsdom selects), so those packages must go through babel instead
  // of being skipped as node_modules.
  transformIgnorePatterns: [
    'node_modules/(?!(ai|@ai-sdk|@openrouter/ai-sdk-provider|@workflow/serde|@aws-sdk|@smithy)/)',
    '\\.pnp\\.[^\\\\]+$',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
  collectCoverageFrom: [
    '**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
  ],
}
