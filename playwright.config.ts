import { defineConfig, devices } from '@playwright/test';

// Runs against `next start` and the local Supabase stack started by `supabase start` (see .github/workflows/checks.yml).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // The github reporter turns each failure into an annotation on the run, which can be read without downloading logs.
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  timeout: 45_000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000/login',
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
