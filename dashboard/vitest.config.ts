import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const directory = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: { '@': resolve(directory, 'src') } },
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], globals: true, restoreMocks: true },
});
