import { createServer } from "vite";
import { spawn } from "node:child_process";
import path from "node:path";

// Own Vite in this process instead of a nested npm/PowerShell process tree.
// That lets Windows shut down the test site cleanly after Playwright exits.
const url = "http://127.0.0.1:4174/test-form.html";
let server;
try {
  // Only this isolated build grants localhost access for automated fixtures.
  // The production dist manifest never includes testing permissions.
  const buildCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve("node_modules/vite/bin/vite.js"), "build", "--mode", "e2e"], { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (buildCode !== 0) throw new Error("E2E build failed");
  const running = await fetch(url, { signal: AbortSignal.timeout(2000) })
    .then((response) => response.ok).catch(() => false);
  if (!running) {
    server = await createServer({
      configFile: path.resolve("vite.site.config.ts"),
      server: { host: "127.0.0.1", port: 4174, strictPort: true },
    });
    await server.listen();
  }
  process.exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      path.resolve("node_modules/@playwright/test/cli.js"), "test", ...process.argv.slice(2),
    ], {
      stdio: "inherit",
      env: { ...process.env, EASYAPPLY_EXTERNAL_TEST_SITE: "1", EASYAPPLY_EXTENSION_PATH: path.resolve("dist-e2e") },
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
} finally {
  await server?.close();
}
