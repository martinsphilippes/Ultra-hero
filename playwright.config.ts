import { defineConfig, devices } from "@playwright/test";

// E2E contra o servidor de produção local (next start). Requer .env.local com Supabase.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    trace: "retain-on-failure",
    locale: "pt-BR",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npx next start -p 3100", url: "http://localhost:3100", reuseExistingServer: true, timeout: 120_000 },
});
