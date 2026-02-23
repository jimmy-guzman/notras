import { defineConfig, devices } from "@playwright/test";

const IS_CI = Boolean(process.env.CI);
const DB_SETUP = "SKIP_ENV_VALIDATION=1 pnpm db:push &&";

export default defineConfig({
  forbidOnly: IS_CI,
  fullyParallel: true,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  reporter: IS_CI ? [["github"], ["html"]] : [["html"]],
  retries: IS_CI ? 2 : 0,
  testDir: "./e2e",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: IS_CI ? `${DB_SETUP} pnpm start` : `${DB_SETUP} pnpm dev`,
    env: {
      DATABASE_PATH: "file:./data/notras-test.db",
    },
    reuseExistingServer: !IS_CI,
    url: "http://localhost:3000",
  },
  workers: IS_CI ? 1 : undefined,
});
