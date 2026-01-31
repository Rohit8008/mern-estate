/**
 * Vitest Configuration for Frontend Testing
 *
 * Run tests: npm test
 * Run with UI: npm run test:ui
 * Run with coverage: npm run test:coverage
 */

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],

  test: {
    // Enable global APIs (describe, it, expect)
    globals: true,

    // Use jsdom for DOM simulation
    environment: 'jsdom',

    // Setup file for test configuration
    setupFiles: './src/tests/setup.js',

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
