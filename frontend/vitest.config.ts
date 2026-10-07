import { defineConfig } from 'vitest/config';

// Tests unitaires des fonctions pures (jsdom pour DOMParser dans stripTags/preview).
export default defineConfig({
  test: {
    root: __dirname,
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    globals: true,
  },
});
