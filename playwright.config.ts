import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:3001', trace: 'on-first-retry' },
  webServer: [
    { command: 'npm run test:e2e:prepare && cross-env PORT=5051 FRONTEND_ORIGINS=http://127.0.0.1:3001 npm run start:prod', url: 'http://127.0.0.1:5051/api/docs', reuseExistingServer: !process.env.CI, timeout: 120_000 },
    { command: 'cross-env NEXT_PUBLIC_API_URL=http://127.0.0.1:5051/api npm --prefix dashboard run build && cross-env NEXT_PUBLIC_API_URL=http://127.0.0.1:5051/api npm --prefix dashboard run start -- --port 3001 --hostname 127.0.0.1', url: 'http://127.0.0.1:3001', reuseExistingServer: !process.env.CI, timeout: 120_000 },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
