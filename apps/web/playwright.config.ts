import { defineConfig, devices } from '@playwright/test';

const APP_URL = process.env['E2E_APP_URL'] ?? 'http://localhost:3000';
const PORT = new URL(APP_URL).port || '3000';

/**
 * Pruebas de interfaz (06 §6): escritorio (Chromium) y celular (iPhone, WebKit), con axe. Corren sobre el build de
 * producción con la pila completa: API, worker, PostgreSQL con la semilla local y Mailpit. La API y el worker los
 * arranca CI (o tú, en local); Playwright arranca la web. baseURL es APP_URL: el Origin de toda escritura debe
 * coincidir con el de la API.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  timeout: 60_000,
  reporter: process.env['CI'] ? [['github'], ['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: APP_URL,
    locale: 'es-PE',
    timezoneId: 'America/Lima',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
    { name: 'movil', use: { ...devices['iPhone 15'] } },
  ],
  webServer: {
    command: `next start --port ${PORT}`,
    url: `${APP_URL}/entrar`,
    reuseExistingServer: !process.env['CI'],
    env: { APP_ENV: 'local' },
    timeout: 60_000,
  },
});
