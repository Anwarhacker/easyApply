import { test, expect, chromium } from "@playwright/test";
import path from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { blankProfile } from "../src/model";

test("resume review preserves existing details and imports only selected values", async () => {
  const extension = path.resolve(process.env.EASYAPPLY_EXTENSION_PATH || "dist");
  const context = await chromium.launchPersistentContext(path.resolve(".test-browser-profiles/resume-" + Date.now()), {
    channel: "chromium", executablePath: process.env.APPLYEASE_CHROMIUM ?? (existsSync(".browser/chrome.exe") ? path.resolve(".browser/chrome.exe") : undefined),
    headless: true, ignoreDefaultArgs: ["--disable-extensions"],
    viewport: { width: 1100, height: 900 },
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
    const profile = blankProfile("Resume review test");
    profile.values.firstName = "Existing";
    profile.values.email = "existing@example.com";
    await page.evaluate(async profile => {
      await chrome.storage.local.set({ profiles: [profile], activeProfileId: profile.id, "onboarding:v2": { done: true, step: 0 } });
    }, profile);
    await page.reload();
    await page.getByRole("button", { name: "PDF resume", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: /^Resume Autofill/ });
    const upload = dialog.locator('input[type="file"]');
    await upload.setInputFiles({ name: "resume.docx", mimeType: "application/octet-stream", buffer: Buffer.from("bad") });
    await expect(dialog.getByRole("alert")).toContainText("Choose a PDF or TXT");
    await upload.setInputFiles({ name: "resume.txt", mimeType: "text/plain", buffer: Buffer.from("Asha Rao\nasha@example.com\n+91 9876543210\nTechnical Skills\nJavaScript React") });
    await expect(dialog.getByLabel("First Name", { exact: true })).not.toBeChecked();
    await expect(dialog.getByLabel("Email", { exact: true })).not.toBeChecked();
    await expect(dialog.getByLabel("Extracted Email", { exact: true })).toBeDisabled();
    await expect(dialog).toContainText("Current: existing@example.com");
    await dialog.getByRole("button", { name: "Select all", exact: true }).click();
    await expect(dialog).toContainText("existing values will be replaced");
    await dialog.getByRole("button", { name: "Only empty fields", exact: true }).click();
    await dialog.getByLabel("Search extracted details").fill("email");
    await expect(dialog.locator(".resume-field-row")).toHaveCount(1);
    await dialog.getByLabel("Search extracted details").clear();
    await page.screenshot({ path: "test-results/resume-review.png" });
    await dialog.getByLabel(/Save this file to Resume Vault/).uncheck();
    await dialog.getByRole("button", { name: /^Apply \d+ details$/ }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('[name="values.firstName"]')).toHaveValue("Existing");
    await expect(page.locator('[name="values.email"]')).toHaveValue("existing@example.com");
    await expect(page.locator('[name="values.mobile"]')).toHaveValue("+919876543210");
    await page.getByRole("button", {name:"Expand all sections", exact:true}).click();
    const documentCard = page.getByRole("region", {name:"Resume document", exact:true});
    await documentCard.getByLabel("Upload resume document", {exact:true}).setInputFiles({name:"application-resume.txt",mimeType:"text/plain",buffer:Buffer.from("My application resume")});
    await expect(documentCard).toContainText("Saved locally");
    await expect(documentCard).toContainText("application-resume.txt");
    await expect(documentCard).toContainText("TXT · 21 B");
    await expect(documentCard).toContainText("For Resume review test");
    await page.reload();
    await page.getByRole("button", {name:"Expand all sections",exact:true}).click();
    await expect(documentCard).toContainText("application-resume.txt");
    const replace = documentCard.getByLabel("Replace resume document",{exact:true});
    await replace.setInputFiles({name:"bad.html",mimeType:"text/html",buffer:Buffer.from("bad")});
    await expect(documentCard.getByRole("alert")).toContainText("Choose a PDF, DOCX, or TXT");
    await expect(documentCard).toContainText("application-resume.txt");
    await replace.setInputFiles({name:"application-resume.txt",mimeType:"text/plain",buffer:Buffer.from("Updated resume")});
    await expect(documentCard.getByRole("status")).toContainText("Saved application-resume.txt");
    const downloading = page.waitForEvent("download");
    await documentCard.getByRole("link", {name:"Download",exact:true}).click();
    const download = await downloading;
    await download.saveAs("test-results/saved-resume.txt");
    expect(await readFile("test-results/saved-resume.txt", "utf8")).toBe("Updated resume");
    await documentCard.getByRole("button", {name:"Remove",exact:true}).click();
    await documentCard.getByRole("button", {name:"Keep resume",exact:true}).click();
    await expect(documentCard).toContainText("application-resume.txt");
    await documentCard.screenshot({path:"test-results/resume-document.png"});
    const second = blankProfile("Second resume profile");
    await page.evaluate(async second => {
      const {profiles} = await chrome.storage.local.get("profiles");
      await chrome.storage.local.set({profiles:[...profiles,second]});
    }, second);
    await page.reload();
    await page.getByRole("button", {name:"Expand all sections",exact:true}).click();
    await page.getByLabel("Active profile", {exact:true}).selectOption(second.id);
    await expect(documentCard).toContainText("For Second resume profile");
    await expect(documentCard).toContainText("No resume saved for this profile");
    await expect(documentCard).not.toContainText("application-resume.txt");
    await page.getByLabel("Active profile", {exact:true}).selectOption(profile.id);
    await expect(documentCard).toContainText("application-resume.txt");

    await documentCard.getByRole("button", {name:"Remove",exact:true}).click();
    await documentCard.getByRole("button", {name:"Remove saved resume",exact:true}).click();
    await expect(documentCard).toContainText("No resume saved for this profile");
    await expect(page.locator('[name="values.firstName"]')).toHaveValue("Existing");

  } finally { await context.close(); }
});



