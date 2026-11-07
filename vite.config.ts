import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Must match the GitHub repo name exactly (case-sensitive) — see CLAUDE.md C5.
export const BASE = '/Vatsim-Radar-For-Real-Life/';

export default defineConfig({
  base: BASE,
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
  },
});
