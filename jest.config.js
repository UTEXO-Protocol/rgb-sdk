/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  // Use ESM for tests since we have experimental flags
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        target: 'ES2020',
        module: 'ESNext',
        moduleResolution: 'node',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        skipLibCheck: true,
      },
      diagnostics: {
        ignoreCodes: [1343, 2351, 6059, 7016], // Ignore missing declaration file errors
      },
      isolatedModules: true,
      useESM: true,
    }],
  },
  // Don't transform ESM modules - let Node.js handle them with experimental flags
  transformIgnorePatterns: [
    'node_modules/(?!(@metamask|bitcoindevkit|@types)/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
  testTimeout: 30000, // Increased timeout for crypto operations
  // Set NODE_OPTIONS for WASM support
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
};

