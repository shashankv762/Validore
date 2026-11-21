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

    isolate: true,
    reporters: ['default'],
    // Parallel PGlite startup and export imports can exceed the default timeout
    // on slower machines.
    testTimeout: 15000,
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'tests/**/*.test.ts',
      'tests/**/*.test.tsx',
      'static webpage/tests/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/.next/**', 'tests/cloudflare-runtime.test.ts'],
  },

  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
