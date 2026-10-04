import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    env: {
      VITE_PLEROMA_INSTANCE_URL: 'http://pleroma.test',
      VITE_REA_IPFS_API_URL: '/api',
      VITE_IPFS_GATEWAY_URL: 'http://ipfs.test',
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
