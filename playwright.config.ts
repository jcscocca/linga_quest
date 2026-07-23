import { defineConfig, devices } from '@playwright/test'

// With DEPLOY_BASE set, run against the production build served under the same
// sub-path GitHub Pages uses, so base-path breakage fails here and not live.
const base = process.env.DEPLOY_BASE ?? '/'
const preview = base !== '/'
const url = `http://localhost:${preview ? 4173 : 5173}${base}`

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL: url, trace: 'off' },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Some environments ship a prebuilt Chromium; point PW_CHROMIUM at it.
        // Otherwise use whatever `playwright install` put in place.
        ...(process.env.PW_CHROMIUM
          ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
          : {}),
      },
    },
  ],
  webServer: {
    command: preview ? 'npm run preview' : 'npm run dev',
    url,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
