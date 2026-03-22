import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000, // 2 minutes per test (email flows can be slow)
  expect: { timeout: 15_000 },
  fullyParallel: false, // Run sequentially — tests may share org/project state
  retries: 1,
  workers: 1,

  use: {
    baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
