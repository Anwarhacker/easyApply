import { test, expect, chromium } from "@playwright/test";
import path from "node:path";
import { existsSync } from "node:fs";
import { blankProfile } from "../src/model";

test("profile drafts merge independent changes and dashboard updates live", async () => {
  const extension = path.resolve(process.env.EASYAPPLY_EXTENSION_PATH || "dist");
  const context = await chromium.launchPersistentContext(path.resolve(".test-browser-profiles/profile-consistency-" + Date.now()), {
    channel: "chromium", executablePath: process.env.APPLYEASE_CHROMIUM ?? (existsSync(".browser/chrome.exe") ? path.resolve(".browser/chrome.exe") : undefined),
    headless: true, ignoreDefaultArgs: ["--disable-extensions"],
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const manager = await context.newPage(); await manager.goto("chrome://extensions");
    const card = manager.locator("extensions-item").filter({ hasText: "easyApply" }); await expect(card).toBeVisible();
    const id = await card.getAttribute("id");
    const page = await context.newPage(); await page.goto(`chrome-extension://${id}/settings.html`);
    const first = blankProfile("Frontend"); const second = blankProfile("Backend");
    await page.evaluate(async profiles => chrome.storage.local.set({ profiles, activeProfileId: profiles[0].id, "onboarding:v2": { done: true, step: 0 } }), [first, second]);
    await page.reload();
    await page.getByRole("button", { name: "Expand all sections", exact: true }).click();
    await page.locator("#profile-email").fill("alex@example.com");
    page.once("dialog", dialog => dialog.dismiss());
    await page.getByLabel("Active profile").selectOption(second.id);
    await expect(page.getByLabel("Active profile")).toHaveValue(first.id);
    await expect(page.locator("#profile-email")).toHaveValue("alex@example.com");
    await page.evaluate(async profileId => {
      const { profiles } = await chrome.storage.local.get("profiles");
      profiles.find((p: {id: string}) => p.id === profileId).values.city = "Pune";
      await chrome.storage.local.set({ profiles });
    }, first.id);
    await page.getByRole("button", { name: "Save profile", exact: true }).click();
    await expect(page.getByText("Profile saved on this device.", { exact: true })).toBeVisible();
    await expect(page.locator("#profile-city")).toHaveValue("Pune");
    await expect(page.locator("#profile-email")).toHaveValue("alex@example.com");
    // Save clears the dirty state, so normal switching needs no discard prompt.
    await page.getByLabel("Active profile").selectOption(second.id);
    await expect(page.locator("#profile-email")).toHaveValue("");
    await page.getByLabel("Active profile").selectOption(first.id);
    await page.locator("#profile-city").fill("Mumbai");
    await page.evaluate(async profileId => {
      const { profiles } = await chrome.storage.local.get("profiles");
      profiles.find((p: {id: string}) => p.id === profileId).values.city = "Delhi";
      await chrome.storage.local.set({ profiles });
    }, first.id);
    await page.getByRole("button", { name: "Save profile", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("City changed in another window");
    await expect(page.locator("#profile-city")).toHaveValue("Mumbai");
    const stored = await page.evaluate(async () => (await chrome.storage.local.get("profiles")).profiles);
    expect(stored.find((p: {id: string}) => p.id === first.id).values.city).toBe("Delhi");
    expect(stored).toHaveLength(2);
    await page.evaluate(async () => chrome.storage.local.set({ applications: [
      { id: "due", company: "Due Company", position: "Engineer", status: "Applied", appliedDate: "2020-01-01", followUpDate: "2020-01-02", url: "", resume: "", notes: "" },
      { id: "future", company: "Future Company", position: "Engineer", status: "Applied", appliedDate: "2020-01-01", followUpDate: "2099-01-02", url: "", resume: "", notes: "" },
    ] }));
    const dashboard = page.getByRole("region", { name: "Your application workspace" });
    await expect(dashboard).toContainText("1 due");
    await dashboard.getByRole("button", { name: "Review follow-ups" }).click();
    await expect(page.locator(".tracker-record")).toHaveCount(1);
    await expect(page.locator(".tracker-record")).toContainText("Due Company");
  } finally { await context.close(); }
});
