import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 30000, // 30 seconds for E2E tests
    pool: 'forks', // Use forked processes for better isolation
    poolOptions: {
      forks: {
        singleFork: true // Run tests sequentially to avoid database conflicts
      }
    },
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5434/gdi_test_db',
      DB_HOST: 'localhost',
      DB_PORT: '5434',
      DB_NAME: 'gdi_test_db',
      DB_USER: 'postgres',
      DB_PASSWORD: 'postgres'
    },
    include: [
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'src/test/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/coverage/**'
      ]
    }
  },
})
