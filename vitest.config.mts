import { defineConfig } from 'vitest/config'
import path from 'path'
import { config } from 'dotenv'

// Manual tests never load the application's credentials. Database tests must
// opt into a separate, disposable database through .env.test.local.
config({ path: '.env.test.local', quiet: true })
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
else delete process.env.DATABASE_URL

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,

    // Isolate each test file in its own module context.
    // Prevents shared state leakage between test files.
    isolate: true,

    reporters: ['default'],

    // Explicit include pattern — avoids picking up stress-db-idempotency.ts
    // which is a utility script, not a test suite.
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'tests/**/*.test.ts',
      'tests/**/*.test.tsx',
      'static webpage/tests/**/*.test.ts',
    ],

    // Exclude DB idempotency script (it's a manual runner, not a test file).
    exclude: [
      '**/node_modules/**',
      '**/stress-db-idempotency.ts',
      '**/.next/**',
    ],
  },

  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
