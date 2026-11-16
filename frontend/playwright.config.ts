import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 8123);
const PYTHON = process.env.PYTHON ?? "../.venv/bin/python";

/**
 * End-to-end tests run against the real stack: the FastAPI server serving the
 * production build of the frontend, with a fresh throwaway SQLite database.
 * Run `npm run build` first (the `e2e` npm script does).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: {
    command: `rm -f ../var/e2e.sqlite3* && EDISON_DB=../var/e2e.sqlite3 EDISON_FRONTEND_DIST=./dist ${PYTHON} -m uvicorn edison_api.main:app_factory --factory --host 127.0.0.1 --port ${PORT} --log-level info`,
    stdout: "pipe",
    stderr: "pipe",
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
