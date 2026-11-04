import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Windows runners can take longer to generate the local TLS certificate fixtures.
    hookTimeout: 30000,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/services/practice/**'],
      thresholds: {
        lines: 80,
      },
    },
  },
});
