import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/types.ts', 'src/__tests__/**'],
      thresholds: {
        lines: 55,
        functions: 50,
        branches: 30,
        statements: 50,
      },
    },
  },
});