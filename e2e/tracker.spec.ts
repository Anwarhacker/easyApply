import { test, expect, chromium } from "@playwright/test";
import path from "node:path";
import { existsSync } from "node:fs";

test("tracker saves follow-ups, updates status, filters and restores deleted records", async () => {
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
    await page.getByRole("button", { name: "Application Tracker", exact: true }).click();
    await page.getByRole("button", { name: "+ Add application", exact: true }).click();
    await page.getByLabel("Company", { exact: true }).fill("Example Labs");
    await page.getByLabel("Position", { exact: true }).fill("Frontend Engineer");
    await page.getByLabel("Follow-up date", { exact: true }).fill("2026-01-01");
    await page.getByLabel("Notes / next step", { exact: true }).fill("Ask recruiter about the interview timeline.");
    await page.getByRole("button", { name: "Save application", exact: true }).click();
    const record = page.locator(".tracker-record");
    await expect(record).toHaveCount(1);
    await expect(record).toContainText("Follow-up overdue");
    await record.getByRole("combobox").selectOption("Interview");
    await expect(page.locator(".tracker").getByRole("status")).toContainText("Status updated");
    await page.getByRole("button", { name: "Follow-ups due (1)", exact: true }).click();
    await expect(record).toHaveCount(1);
    await page.screenshot({ path: "test-results/application-tracker.png" });
    await record.getByRole("button", { name: "Complete follow-up", exact: true }).click();
    await expect(record).toHaveCount(0);
    await page.getByRole("button", { name: "Clear filters", exact: true }).click();
    await record.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(record).toHaveCount(0);
    await page.getByRole("button", { name: "Undo delete", exact: true }).click();
    await expect(record).toHaveCount(1);
    await expect(record.getByRole("combobox")).toHaveValue("Interview");
    await record.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Application status", { exact: true }).selectOption("Withdrawn");
    await page.getByRole("button", { name: "Update application", exact: true }).click();
    await page.getByRole("button", { name: "Withdrawn (1)", exact: true }).click();
    await expect(record).toHaveCount(1);
    await page.reload();
    await page.getByRole("button", { name: "Application Tracker", exact: true }).click();
    await expect(record.getByRole("combobox")).toHaveValue("Withdrawn");
    await expect(record).not.toContainText("Follow-up overdue");
    await record.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Notes / next step", { exact: true }).fill("Local draft survives remote status changes");
    await page.evaluate(async () => {
      const { applications } = await chrome.storage.local.get("applications");
      await chrome.storage.local.set({ applications: [
        { ...applications[0], status: "Interview" },
        { ...applications[0], id: "remote-added", company: "Remote Company" },
      ] });
    });
    await expect(record).toHaveCount(2);
    await page.getByRole("button", { name: "Update application", exact: true }).click();
    const original = record.filter({ hasText: "Example Labs" });
    await expect(original).toContainText("Local draft survives remote status changes");
    await expect(original.getByRole("combobox")).toHaveValue("Interview");
    await expect(record).toHaveCount(2);
    await original.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Notes / next step", { exact: true }).fill("Conflicting local draft");
    await page.evaluate(async () => {
      const { applications } = await chrome.storage.local.get("applications");
      applications[0].notes = "Remote note must survive";
      await chrome.storage.local.set({ applications });
    });
    await expect(original).toContainText("Remote note must survive");
    await page.getByRole("button", { name: "Update application", exact: true }).click();
    await expect(page.locator(".tracker").getByRole("alert")).toContainText("notes changed in another window");
    await expect(page.getByLabel("Notes / next step", { exact: true })).toHaveValue("Conflicting local draft");
    await expect(original).toContainText("Remote note must survive");
  } finally { await context.close({ reason: "Tracker test completed" }); }
});




