/**
 * Vitest Configuration for Frontend Testing
 *
 * Run tests: npm test
 * Run with UI: npm run test:ui
 * Run with coverage: npm run test:coverage
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],

  // Mirrors vite.config.js. Without it `@/utils/http` — the import style used
  // throughout the codebase — does not resolve under vitest, so any test that
  // touched the API client failed to load at all. That is part of why this
  // suite was empty.
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  test: {
    // Enable global APIs (describe, it, expect)
    globals: true,

    // Use jsdom for DOM simulation
    environment: 'jsdom',

    // Setup file for test configuration
    // .jsx, not .js: this file builds a Provider/BrowserRouter wrapper in JSX,
    // and vite will not parse JSX out of a .js file. It failed to load on
    // every run, which meant no test could start — masked by the
    // --passWithNoTests flag that used to be on the test script.
    setupFiles: './src/tests/setup.jsx',

    // Test file patterns
    include: [
      'src/**/*.{test,spec}.{js,jsx}',
      'src/tests/**/*.{test,spec}.{js,jsx}',
    ],

    // Exclude patterns
    exclude: [
      'node_modules',
      'dist',
      '.idea',
      '.git',
      '.cache',
    ],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'src/tests/',
        '**/*.d.ts',
        '**/*.config.{js,ts}',
        '**/index.{js,jsx}',
      ],
      thresholds: {
        lines: 30,
        functions: 30,
        branches: 30,
        statements: 30,
      },
    },

    // Timeout for async tests
    testTimeout: 10000,

    // Reporter options
    reporters: ['verbose'],

    // Watch options
    watch: false,

    // CSS handling
    css: false,
  },
});
