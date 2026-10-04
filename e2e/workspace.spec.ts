import { test, expect, chromium } from "@playwright/test";
import path from "node:path";
import { existsSync } from "node:fs";
import { blankProfile, profileSchema } from "../src/model";

test("workspace connects saved answers, missing details and follow-ups", async () => {
  const extension = path.resolve(process.env.EASYAPPLY_EXTENSION_PATH || "dist");
  const context = await chromium.launchPersistentContext(path.resolve(".test-browser-profiles/workspace-" + Date.now()), {
    channel: "chromium", executablePath: process.env.APPLYEASE_CHROMIUM ?? (existsSync(".browser/chrome.exe") ? path.resolve(".browser/chrome.exe") : undefined),
    headless: true, ignoreDefaultArgs: ["--disable-extensions"], viewport: { width: 1200, height: 950 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const manager = await context.newPage();
    await manager.goto("chrome://extensions");
    const card = manager.locator("extensions-item").filter({ hasText: "easyApply" });
    await expect(card).toBeVisible();
    const id = await card.getAttribute("id");
    const page = await context.newPage();
    await page.goto(`chrome-extension://${id}/settings.html`);
    const profile = blankProfile("Frontend engineer");
    profile.values.firstName = "Alex";
    profile.values.fullName = "Alex Morgan";
    profile.values.email = "alex@example.com";
    profile.values.linkedin = "https://www.linkedin.com/in/alex";
    profile.customFieldAnswers = { "Do you have experience working in BFSI Domain": "No" };
    profileSchema.parse(profile);
    await page.evaluate(async profile => {
      await chrome.storage.local.set({ profiles: [profile], activeProfileId: profile.id, "onboarding:v2": { done: true, step: 0 }, applications: [
        { id: "app1", company: "Example Labs", position: "Frontend engineer", url: "", appliedDate: "2025-01-01", followUpDate: "2025-01-02", status: "Interview", resume: "", notes: "" },
        { id: "app2", company: "Closed opportunity", position: "Engineer", url: "", appliedDate: "2025-01-01", followUpDate: "2025-01-02", status: "Withdrawn", resume: "", notes: "" },
      ] });
    }, profile);
    await page.reload();
    const dashboard = page.getByRole("region", { name: "Your application workspace" });
    await expect(dashboard).toContainText("Make your next move, Alex.");
    await expect(dashboard.getByRole("progressbar")).toHaveAttribute("value", "2");
    await expect(dashboard).toContainText("1 due");
    await expect(dashboard).not.toContainText("Closed opportunity");
    await page.screenshot({ path: "test-results/workspace-desktop.png" });
    await dashboard.getByRole("button", { name: "+ Add Mobile", exact: true }).click();
    await expect(page.locator("#profile-mobile")).toBeFocused();
    await dashboard.locator("summary").click();
    await dashboard.getByLabel("Find a saved answer").fill("BFSI");
    await expect(dashboard.locator(".workspace-answer-list article")).toHaveCount(1);
    await expect(dashboard.locator(".workspace-answer-list")).toContainText("No");
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (value: string) => { document.body.dataset.copied = value; } } }));
    await dashboard.getByRole("button", { name: "Copy Do you have experience working in BFSI Domain", exact: true }).click();
    await expect(dashboard.getByRole("status")).toContainText("copied. Ready to paste.");
    await expect(page.locator("body")).toHaveAttribute("data-copied", "No");
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Denied"); } } }));
    await dashboard.getByRole("button", { name: "Copy Do you have experience working in BFSI Domain", exact: true }).click();
    await expect(dashboard.getByRole("status")).toContainText("Clipboard unavailable");
    await dashboard.getByRole("button", { name: "Review follow-ups" }).click();
    await expect(page.locator(".tracker")).toBeVisible();
    await page.getByRole("button", { name: "Job Profiles", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: "test-results/workspace-mobile.png" });
    expect(await dashboard.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.goto(`chrome-extension://${id}/index.html`);
    await expect(page.getByRole("button", { name: "Scan application form", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "1 follow-up due" })).toBeVisible();
    await page.screenshot({ path: "test-results/workspace-popup.png", fullPage: true });
    await page.evaluate(async () => chrome.storage.local.set({ profiles: [], activeProfileId: "" }));
    await page.reload();
    await expect(page.getByRole("button", { name: "Create my first profile" })).toBeVisible();
  } finally { await context.close(); }
});

