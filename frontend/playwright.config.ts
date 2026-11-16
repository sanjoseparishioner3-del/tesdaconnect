import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const useLocalEdge = process.platform === 'win32' && !process.env.CI && !process.env.PW_USE_CHROMIUM;
const e2ePort = Number(process.env.PW_PORT ?? 4175);
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: path.join(configDir, 'e2e'),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: e2eBaseUrl,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(useLocalEdge ? { channel: 'msedge' } : {}),
      },
    },
  ],
  webServer: {
    command: `node ./node_modules/vite/bin/vite.js preview --port ${e2ePort} --host 127.0.0.1 --strictPort`,
    cwd: configDir,
    url: e2eBaseUrl,
    timeout: 30_000,
    reuseExistingServer: !process.env.CI,
  },
});
