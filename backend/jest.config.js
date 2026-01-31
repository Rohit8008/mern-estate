/**
 * Jest Configuration for API Testing
 *
 * Run tests: npm test
 * Run in watch mode: npm run test:watch
 * Run with coverage: npm run test:coverage
 */

export default {
  // Use Node.js test environment
  testEnvironment: 'node',

  // File extensions to consider
  moduleFileExtensions: ['js', 'mjs', 'json'],

  // Transform ES modules
  transform: {},

  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js',
  ],

  // Setup files run before each test file
  setupFilesAfterEnv: ['./tests/setup.js'],

  // Coverage configuration
  collectCoverageFrom: [
    'controllers/**/*.js',
    'middleware/**/*.js',
    'utils/**/*.js',
    'models/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**',
  ],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 40,
      functions: 40,
      lines: 40,
      statements: 40,
    },
  },

  // Coverage output directory
  coverageDirectory: 'coverage',

  // Coverage reporters
  coverageReporters: ['text', 'lcov', 'html'],

  // Timeout for async tests (10 seconds)
  testTimeout: 10000,

  // Clear mocks between tests
  clearMocks: true,

  // Verbose output
  verbose: true,

  // Force exit after tests complete (for CI environments)
  forceExit: true,

  // Detect open handles that prevent Jest from exiting
  detectOpenHandles: true,

  // Global teardown
  globalTeardown: './tests/teardown.js',
};
