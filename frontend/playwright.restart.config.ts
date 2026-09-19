import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./restart-tests",
  timeout: 90_000,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: { headless: true, viewport: { width: 1600, height: 1000 }, trace: "retain-on-failure" },
});
