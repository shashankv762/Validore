import { defineConfig } from 'vitest/config'
import path from 'path'
import { config } from 'dotenv'

// Load .env.local when present (local dev); CI runs without it — all
// DB/network-dependent tests either mock those layers or are skipped via
// MISSING_DB guards inside the test files.
if (process.env.CI !== 'true') {
  config({ path: '.env.local' })
}

const isCI = process.env.CI === 'true'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,

    // Isolate each test file in its own module context.
    // Prevents shared state leakage between test files.
    isolate: true,

    // Fail fast in CI: no point running all tests when one is broken.
    bail: isCI ? 1 : 0,

    // JUnit output for Jenkins (enabled when CI=true).
    // The 'default' reporter keeps console output readable.
    // The 'junit' reporter emits reports/junit.xml for Jenkins junit() step.
    reporters: isCI
      ? ['default', 'junit']
      : ['default'],

    outputFile: isCI
      ? { junit: 'reports/junit.xml' }
      : undefined,

    // Explicit include pattern — avoids picking up stress-db-idempotency.ts
    // which is a utility script, not a test suite.
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'tests/**/*.test.ts',
      'tests/**/*.test.tsx',
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
      '@': path.resolve(__dirname, './src'),
    },
  },
})
