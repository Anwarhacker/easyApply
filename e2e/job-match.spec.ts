import { test, expect, chromium } from "@playwright/test";
import path from "node:path";
import { existsSync } from "node:fs";
import { blankProfile } from "../src/model";

test("reads a structured job page and compares a selected resume locally", async () => {
  const extension = path.resolve(process.env.EASYAPPLY_EXTENSION_PATH || "dist");
  const context = await chromium.launchPersistentContext(path.resolve(".test-browser-profiles/job-match-" + Date.now()), {
    channel: "chromium", executablePath: process.env.APPLYEASE_CHROMIUM ?? (existsSync(".browser/chrome.exe") ? path.resolve(".browser/chrome.exe") : undefined),
    headless: true, ignoreDefaultArgs: ["--disable-extensions"], viewport: { width: 1100, height: 900 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const manager = await context.newPage();
    await manager.goto("chrome://extensions");
    const card = manager.locator("extensions-item").filter({ hasText: "easyApply" });
    await expect(card).toBeVisible();
    const id = await card.getAttribute("id");
    const page = await context.newPage();
    page.on("pageerror", error => console.error("Job match page error:", error.message));
    await page.goto(`chrome-extension://${id}/settings.html`);
    const profile = blankProfile("Frontend engineer");
    await page.evaluate(async profile => { await chrome.storage.local.set({ profiles: [profile], activeProfileId: profile.id, "onboarding:v2": { done: true, step: 0 } }); }, profile);
    await page.reload();
    const site = await context.newPage();
    const url = "http://127.0.0.1:4174/test-form.html?job-match";
    await site.goto(url);
    await site.evaluate(() => {
      document.body.innerHTML = `<main><h1>Frontend Engineer</h1><p>Job posting</p></main>`;
      const malformed = document.createElement("script"); malformed.type = "application/ld+json"; malformed.textContent = "{invalid"; document.head.append(malformed);
      const data = document.createElement("script"); data.type = "application/ld+json";
      data.textContent = JSON.stringify({ "@graph": [{ "@type": "JobPosting", title: "Frontend Engineer", description: "<h2>Requirements</h2><p>React, TypeScript and Java required.</p><p>3 years of frontend experience.</p><p>Bachelor's degree in computer science required.</p><h2>Preferred skills</h2><p>Docker</p>", jobLocation: { address: { addressLocality: "Bengaluru", addressCountry: "India" } }, baseSalary: { currency: "INR", value: { minValue: 1000000, maxValue: 1600000, unitText: "YEAR" } } }] });
      document.head.append(data);
    });
    // An extension page used as a test harness is itself a browser tab. Model
    // popup activeTab selection while retaining real executeScript extraction.
    await page.evaluate(url => {
      const query = chrome.tabs.query.bind(chrome.tabs);
      chrome.tabs.query = (async (options: chrome.tabs.QueryInfo) => options.active ? (await query({})).filter(tab => tab.url === url) : query(options)) as typeof chrome.tabs.query;
    }, url);
    await page.getByRole("button", { name: "Resume ↔ Job Match", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Resume ↔ Job Match" });
    await expect(dialog.getByLabel("Job description", { exact: true })).toHaveValue(/TypeScript/);
    await expect(dialog).toContainText("Bengaluru, India");
    await expect(dialog).toContainText("INR 1000000–1600000 YEAR");
    await dialog.getByRole("button", { name: "Compare resume with job", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("no saved resume");
    await dialog.getByLabel("Or choose a PDF or TXT resume").setInputFiles({ name: "alex-resume.txt", mimeType: "text/plain", buffer: Buffer.from("Alex Morgan\nFrontend engineer building accessible products with ReactJS and TypeScript.\n2 years of frontend experience.\nBachelor of Science in Computer Science.") });
    await dialog.getByRole("button", { name: "Compare resume with job", exact: true }).click();
    const results = dialog.getByRole("region", { name: "Resume comparison results" });
    await expect(results).toContainText("2 of 4 detected keywords found");
    await expect(results).toContainText("Not found in resume (2)");
    await expect(results).toContainText("3 years of frontend experience");
    await expect(results).toContainText("2 years of frontend experience");
    await expect(results).toContainText("alex-resume.txt");
    await results.locator("summary").filter({ hasText: "React" }).click();
    await expect(results).toContainText("Resume evidence:");
    await results.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/job-match-desktop.png" });
    // The saved-resume option must use this profile's document, not profile
    // skills or the file previously picked for a temporary comparison.
    await page.evaluate(async profileId => {
      const text = "A backend engineer with Java and Docker experience building enterprise applications.";
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("easyapply_vault", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("resumes", { keyPath: "id" });
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("resumes", "readwrite");
          tx.objectStore("resumes").put({ id: profileId, name: "saved-backend.txt", size: text.length, type: "text/plain", updatedAt: new Date().toISOString(), dataBase64: `data:text/plain;base64,${btoa(text)}` });
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => { db.close(); reject(tx.error); };
        };
      });
    }, profile.id);
    await dialog.getByLabel("Resume to compare", { exact: true }).selectOption("saved");
    await expect(results).toHaveCount(0);
    await dialog.getByRole("button", { name: "Compare resume with job", exact: true }).click();
    await expect(results).toContainText("saved-backend.txt");
    await expect(results).toContainText("2 of 4 detected keywords found");
    await expect(results.locator("section").filter({ has: page.getByRole("heading", { name: "Present in resume (2)", exact: true }) }).first()).toContainText("Java");
    // Editing the JD must invalidate the old comparison, including old metadata.
    await dialog.getByLabel("Job description", { exact: true }).fill("Required skills: Python and SQL. Location: Remote. Salary not disclosed.");
    await expect(results).toHaveCount(0);
    await expect(dialog).not.toContainText("INR 1000000");
    await dialog.getByRole("button", { name: "Compare resume with job", exact: true }).click();
    await expect(dialog.getByRole("region", { name: "Resume comparison results" })).toContainText("0 of 2 detected keywords found");
    await page.setViewportSize({ width: 480, height: 700 });
    await dialog.evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: "test-results/job-match-narrow.png" });
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Resume ↔ Job Match", exact: true })).toBeFocused();
  } finally { await context.close(); }
});
