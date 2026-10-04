import { test, expect, chromium } from "@playwright/test";
import path from "node:path";
import { existsSync } from "node:fs";
import { blankProfile } from "../src/model";

test("production package removes profile resumes and retains unrelated application data", async () => {
  const extension = path.resolve("dist"); // Intentionally the store build, without test host access.
  const context = await chromium.launchPersistentContext(path.resolve(".test-browser-profiles/release-" + Date.now()), {
    executablePath: process.env.APPLYEASE_CHROMIUM ?? (existsSync(".browser/chrome.exe") ? path.resolve(".browser/chrome.exe") : undefined),
    channel: "chromium", headless: true, ignoreDefaultArgs: ["--disable-extensions"], viewport: { width: 1280, height: 800 },
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
    const profile = blankProfile("Frontend Developer");
    profile.values.firstName = "Asha"; profile.values.lastName = "Rao"; profile.values.email = "asha@example.com";
    await page.evaluate(async profile => {
      await chrome.storage.local.set({ profiles: [profile], activeProfileId: profile.id, "onboarding:v2": { done: true, step: 0 }, applications: [
        {id:"release-app",company:"Example Studio",position:"Frontend Developer",url:"https://example.com/careers",appliedDate:"2026-09-25",status:"Interview",notes:"Prepare portfolio walkthrough",resume:"frontend.pdf",followUpDate:"2026-09-28"},
        {id:"release-app-2",company:"Demo Labs",position:"React Developer",url:"",appliedDate:"2026-09-26",status:"Applied",notes:"",resume:"frontend.pdf"}
      ] });
      await chrome.runtime.sendMessage({ type:"save-stored-resume",profileId:profile.id,item:{name:"frontend.pdf",size:5,type:"application/pdf",dataBase64:"data:application/pdf;base64,JVBERi0=",updatedAt:new Date().toISOString()} });
    }, profile);
    await page.reload();
    await expect(page.getByLabel("Active profile")).toHaveValue(profile.id);
    await expect(page.getByRole("button", {name:"+ New profile",exact:true})).toBeEnabled();
    for (const [open, close] of [
      ["Cover letter", "Close Cover letter"], ["PDF resume", "Close Resume Autofill"],
      ["Smart fill", "Close Smart fill"], ["Saved info", "Close saved info"],
    ]) {
      await page.getByRole("button", {name:open,exact:true}).click();
      const cross = page.getByRole("button", {name:close,exact:true});
      await expect(cross).toBeVisible();
      await cross.click();
      await expect(cross).toHaveCount(0);
      if (open === "Smart fill") await expect(page.getByRole("button", {name:open,exact:true})).toBeFocused();
    }
    await page.screenshot({ path:"release/screenshots/profile-settings-current.png" });
    await page.getByRole("button",{name:"Application Tracker",exact:true}).click();
    await page.locator(".tracker").scrollIntoViewIfNeeded();
    await page.screenshot({ path:"release/screenshots/application-tracker-current.png" });
    await page.getByRole("button",{name:"Job Profiles",exact:true}).click();
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button",{name:"Delete profile",exact:true}).click();
    await expect(page.getByRole("status").filter({hasText:"Profile deleted."})).toBeVisible();
    const result = await page.evaluate(async profileId => ({
      data: await chrome.storage.local.get(["profiles","applications"]),
      resume: await chrome.runtime.sendMessage({type:"get-stored-resume",profileId}),
      permissions: await chrome.permissions.getAll(),
    }), profile.id);
    expect(result.data.profiles).toHaveLength(0);
    expect(result.data.applications).toHaveLength(2);
    expect(result.resume.resume).toBeNull();
    expect(result.permissions.origins || []).toEqual([]);
  } finally { await context.close(); }
});
