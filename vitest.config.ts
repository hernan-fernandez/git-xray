import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts', 'tests/**/*.prop.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/report/template/**'],
      // Real gate: fails the coverage run if these drop. Set slightly below
      // current measurements (≈79% lines / 64% branches) to catch regressions
      // without being flaky. Raise as coverage improves.
      thresholds: {
        lines: 75,
        functions: 75,
        statements: 75,
        branches: 60,
      },
    },
    testTimeout: 30000,
  },
});
