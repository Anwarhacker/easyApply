import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  outputDir: "playwright-results",
  timeout: 120000,
  webServer: process.env.EASYAPPLY_EXTERNAL_TEST_SITE ? undefined : {
    command: "node node_modules/vite/bin/vite.js --config vite.site.config.ts",
    url: "http://127.0.0.1:4174/test-form.html",
    reuseExistingServer: true,
  },
});
