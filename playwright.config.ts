import { defineConfig, devices } from "@playwright/test"

// SEGURIDAD: baseURL siempre apunta a localhost por default.
// Sobrescribir con BASE_URL=... sólo para dev/staging; NUNCA contra producción.
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3001",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
