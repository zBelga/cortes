import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      // O motor de score é a peça mais valiosa do produto: cobertura total nele.
      include: ['src/modules/intelligence/scoring/**', 'src/common/utils/**'],
      thresholds: { lines: 80, branches: 70 },
    },
  },
});
