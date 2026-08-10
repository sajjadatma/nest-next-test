import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/integration/**/*.spec.ts'], environment: 'node', globals: true, globalSetup: ['./test/integration/global-setup.ts'], fileParallelism: false, testTimeout: 60_000, hookTimeout: 60_000 },
});
