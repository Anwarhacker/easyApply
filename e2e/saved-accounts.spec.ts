import { test, expect, chromium } from "@playwright/test";
import path from "node:path";
import { existsSync } from "node:fs";

test("saved accounts save directly without setup and restore email-password pairs", async () => {
  const extension = path.resolve(process.env.EASYAPPLY_EXTENSION_PATH || "dist");
  const context = await chromium.launchPersistentContext(path.resolve(".test-browser-profiles/tracker-" + Date.now()), {
    channel: "chromium", executablePath: process.env.APPLYEASE_CHROMIUM ?? (existsSync(".browser/chrome.exe") ? path.resolve(".browser/chrome.exe") : undefined),
    headless: true, ignoreDefaultArgs: ["--disable-extensions"], viewport: { width: 1200, height: 950 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  context.setDefaultTimeout(10000);
  try {
    const manager = await context.newPage();
    await manager.goto("chrome://extensions");
    const card = manager.locator("extensions-item").filter({ hasText: "easyApply" });
    await expect(card).toBeVisible();
    const id = await card.getAttribute("id");
    const page = await context.newPage();
    await page.goto(`chrome-extension://${id}/settings.html`);
    await page.evaluate(async () => {
      await chrome.storage.local.set({ "onboarding:v2": { done: true, step: 0 } });
    });
    await page.reload();
    const vault = page.getByRole("region", { name: "Saved login accounts" });
    const toggle = vault.getByRole("switch", { name: "Show saved accounts" });
    await expect(toggle).not.toBeChecked();
    await expect(vault.locator("#saved-accounts-content")).toBeHidden();
    await toggle.click();
    for (let i = 1; i <= 4; i++) {
      if (i > 1) await vault.getByRole("button", { name: "+ Add account", exact: true }).click();
      await vault.getByLabel(`Email for account ${i}`, { exact: true }).fill(`account${i}@example.com`);
      await vault.getByLabel(`Password for account ${i}`, { exact: true }).fill(`Password ${i}!`);
    }
    await vault.getByRole("button", { name: "+ Add account", exact: true }).click();
    // A spare empty card should not prevent saving the completed pairs.
    const password = vault.getByLabel("Password for account 4", { exact: true });
    await expect(password).toHaveAttribute("type", "password");
    await vault.getByRole("button", { name: "Show password for account 4", exact: true }).click();
    await expect(password).toHaveAttribute("type", "text");
    await toggle.click();
    await expect(password).toBeHidden();
    await toggle.click();
    await expect(password).toHaveAttribute("type", "password");
    await expect(password).toHaveValue("Password 4!");
    await vault.getByRole("button", { name: "Save accounts", exact: true }).click();
    await expect(vault.getByRole("status")).toContainText("Accounts saved");
    await expect(password).toHaveAttribute("type", "password");
    await expect(vault.locator(".account-card")).toHaveCount(4);
    expect(await vault.locator(".account-card-row").evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    await page.screenshot({ path: "test-results/saved-accounts.png" });
    await page.reload();
    await expect(toggle).not.toBeChecked();
    await vault.getByRole("button", { name: "View", exact: true }).click();
    await expect(toggle).not.toBeChecked();
    await expect(password).toHaveAttribute("readonly", "");
    await expect(password).toHaveAttribute("type", "password");
    await expect(vault.getByRole("button", { name: "Save accounts", exact: true })).toHaveCount(0);
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (value: string) => { (window as unknown as { copied: string }).copied = value; } } });
    });
    await vault.getByRole("button", { name: "Copy email for account 4", exact: true }).click();
    expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toBe("account4@example.com");
    await vault.getByRole("button", { name: "Copy password for account 4", exact: true }).click();
    expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toBe("Password 4!");
    await expect(password).toHaveAttribute("type", "password");
    await vault.getByRole("button", { name: "Show password for account 4", exact: true }).click();
    await expect(password).toHaveAttribute("type", "text");
    await vault.getByRole("button", { name: "Close", exact: true }).click();
    await expect(password).toBeHidden();
    await toggle.click();
    await expect(vault.getByLabel("Email for account 4", { exact: true })).toHaveValue("account4@example.com");
    await expect(password).toHaveAttribute("type", "password");
    await vault.getByLabel("Email for account 4", { exact: true }).fill("draft@example.com");
    await toggle.click();
    await vault.getByRole("button", { name: "View", exact: true }).click();
    await expect(vault.getByLabel("Email for account 4", { exact: true })).toHaveValue("account4@example.com");
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw Error("Denied"); } } });
    });
    await vault.getByRole("button", { name: "Copy email for account 4", exact: true }).click();
    await expect(vault.getByRole("alert")).toContainText("Clipboard access failed");
    await toggle.click();
    await expect(vault.getByLabel("Email for account 4", { exact: true })).toHaveValue("draft@example.com");
    await vault.getByRole("button", { name: "Remove account 4", exact: true }).click();
    await vault.getByRole("button", { name: "Save accounts", exact: true }).click();
    await expect(vault.getByRole("status")).toContainText("Accounts saved");
    await page.reload();
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(vault.locator(".account-card")).toHaveCount(3);
    await expect(vault.getByRole("button", { name: /unlock|vault|lock/i })).toHaveCount(0);
  } finally { await context.close(); }
});
