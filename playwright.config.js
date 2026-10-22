import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './browser-tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 2,
  timeout: 30000,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    channel: 'chromium',
    viewport: { width: 400, height: 600 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  }
})
