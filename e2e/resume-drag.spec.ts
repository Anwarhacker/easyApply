import { test, expect, chromium } from "@playwright/test";
import path from "node:path";
import { existsSync } from "node:fs";
import { blankProfile } from "../src/model";
import { readdir } from "node:fs/promises";

test("saved resume drags carry file bytes, preserve attachments and respect accepted formats", async () => {
  const extension = path.resolve(process.env.EASYAPPLY_EXTENSION_PATH || "dist");
  const loader = (await readdir(path.join(extension, "assets"))).find(name => name.startsWith("content.ts-loader-") && name.endsWith(".js"))!;
  const context = await chromium.launchPersistentContext(path.resolve(".test-browser-profiles/tracking-confirmation-" + Date.now()), {
    channel: "chromium", executablePath: process.env.APPLYEASE_CHROMIUM ?? (existsSync(".browser/chrome.exe") ? path.resolve(".browser/chrome.exe") : undefined),
    headless: true, ignoreDefaultArgs: ["--disable-extensions"],
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const manager = await context.newPage();
    await manager.goto("chrome://extensions");
    const card = manager.locator("extensions-item").filter({ hasText: "easyApply" });
    await expect(card).toBeVisible();
    const id = await card.getAttribute("id");
    const settings = await context.newPage();
    await settings.goto(`chrome-extension://${id}/settings.html`);
    const profile = blankProfile("Resume drag test");
    await settings.evaluate(async profile => {
      await chrome.storage.local.set({ profiles: [profile], activeProfileId: profile.id, "onboarding:v2": { done: true, step: 0 } });
    }, profile);
    await settings.reload();
    await settings.getByRole("button", { name: "Expand all sections", exact: true }).click();
    await settings.getByLabel("Upload resume document", { exact: true }).setInputFiles({ name: "resume.txt", mimeType: "text/plain", buffer: Buffer.from("My actual resume bytes") });
    await expect(settings.getByRole("region", { name: "Resume document", exact: true })).toContainText("Saved locally");
    const site = await context.newPage();
    const url = "http://127.0.0.1:4174/test-form.html?job=123";
    await site.goto(url);
    await site.evaluate(() => {
      document.body.innerHTML = `<label style="display:block;padding:40px">Resume<input id="resume" type="file" accept=".txt"></label>
        <label style="display:block;padding:40px">PDF only<input id="pdf" type="file" accept=".pdf"></label>
        <div id="custom" style="padding:40px;border:1px solid">Custom upload area</div>`;
      document.querySelector("#custom")!.addEventListener("drop", async event => {
        const file = (event as DragEvent).dataTransfer?.files[0];
        if (file) document.querySelector("#custom")!.textContent = await file.text();
      });
    });
    const tabId = await settings.evaluate(async ({ url, loader }) => {
      const tab = (await chrome.tabs.query({})).find(tab => tab.url === url)!;
      await chrome.scripting.executeScript({ target: { tabId: tab.id! }, files: [`assets/${loader}`] });
      return tab.id!;
    }, { url, loader });
    await expect.poll(() => settings.evaluate(async tabId => {
      try { return (await chrome.tabs.sendMessage(tabId, { type: "ping" }))?.ready; } catch { return false; }
    }, tabId)).toBe(true);
    await site.locator(".ea-fab").click();
    const drag = site.locator(".ea-drag-chip");
    await expect(drag).toBeVisible();
    await drag.dragTo(site.locator("#resume"));
    expect(await site.locator("#resume").evaluate(async el => (el as HTMLInputElement).files?.[0]?.text())).toBe("My actual resume bytes");
    await site.locator("#resume").setInputFiles({ name: "existing.txt", mimeType: "text/plain", buffer: Buffer.from("Keep this") });
    await drag.dragTo(site.locator("#resume"));
    expect(await site.locator("#resume").evaluate(el => (el as HTMLInputElement).files?.[0]?.name)).toBe("existing.txt");
    await drag.dragTo(site.locator("#pdf"));
    expect(await site.locator("#pdf").evaluate(el => (el as HTMLInputElement).files?.length)).toBe(0);
    await drag.dragTo(site.locator("#custom"));
    await expect(site.locator("#custom")).toHaveText("My actual resume bytes");
    await site.locator("#resume").setInputFiles([]);
    await site.getByRole("button", { name: "Attach ↗", exact: true }).click();
    await expect.poll(() => site.locator("#resume").evaluate(async el => (el as HTMLInputElement).files?.[0]?.text())).toBe("My actual resume bytes");
  } finally { await context.close(); }
});
