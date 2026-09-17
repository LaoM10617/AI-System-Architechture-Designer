import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: ".\\.venv\\Scripts\\python.exe -m uvicorn backend:app --host 127.0.0.1 --port 8000",
      cwd: "..",
      env: { AI_PROVIDER: "fake", PYTHONDONTWRITEBYTECODE: "1" },
      url: "http://127.0.0.1:8000/health",
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: "pnpm dev --host 127.0.0.1",
      cwd: ".",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
