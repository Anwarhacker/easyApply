import { test, expect, chromium } from "@playwright/test";
import path from "node:path";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";

test("submit detection requires confirmed acceptance and valid details before tracking", async () => {
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
    const site = await context.newPage();
    const url = "http://127.0.0.1:4174/test-form.html?job=123";
    await site.goto(url);
    await site.evaluate(() => {
      document.body.innerHTML = '<h1>Frontend Engineer</h1><form><input aria-label="Name"><input aria-label="Email"><button type="submit">Submit application</button></form>';
      document.querySelector("form")!.addEventListener("submit", event => event.preventDefault());
    });
    const tabId = await settings.evaluate(async ({ url, loader }) => {
      const tab = (await chrome.tabs.query({})).find(tab => tab.url === url)!;
      await chrome.scripting.executeScript({ target: { tabId: tab.id! }, files: [`assets/${loader}`] });
      return tab.id!;
    }, { url, loader });
    await expect.poll(() => settings.evaluate(async tabId => {
      try { return (await chrome.tabs.sendMessage(tabId, { type: "ping" }))?.ready; } catch { return false; }
    }, tabId)).toBe(true);
    await site.evaluate(() => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true })));
    await expect(site.getByRole("button", { name: "Save to Tracker", exact: true })).toHaveCount(0);
    await site.getByRole("button", { name: "Submit application", exact: true }).click();
    const save = site.getByRole("button", { name: "Save to Tracker", exact: true });
    await expect(save).toBeVisible();
    await site.getByRole("textbox", { name: "Company name", exact: true }).fill("Example Labs");
    await site.getByRole("textbox", { name: "Position / Role", exact: true }).fill("Frontend Engineer");
    await expect(save).toBeDisabled();
    await site.getByLabel("I confirmed that the website accepted my application.", { exact: true }).check();
    await site.getByRole("textbox", { name: "Company name", exact: true }).fill("   ");
    await expect(save).toBeDisabled();
    await site.getByRole("textbox", { name: "Company name", exact: true }).fill("Example Labs");
    await expect(save).toBeEnabled();
    await save.click();
    await expect(save).toHaveCount(0);
    const applications = await settings.evaluate(async () => (await chrome.storage.local.get("applications")).applications);
    expect(applications).toHaveLength(1);
    expect(applications[0]).toMatchObject({ company: "Example Labs", position: "Frontend Engineer", status: "Applied", url });
  } finally { await context.close(); }
});
