// Read-only smoke checks: never fill, upload, log in, or submit on live sites.
import { chromium } from "@playwright/test";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const sites = [
  { name: "Greenhouse", url: "https://job-boards.greenhouse.io/intersystems/jobs/7885747003" },
  { name: "Lever", url: "https://jobs.lever.co/leverdemo-8/a7e7fd90-d227-4d97-aa49-afc847672a50/apply" },
  { name: "Ashby", url: "https://jobs.ashbyhq.com/openai/4070d52e-0263-4cd5-9107-052b4ecc1209/application" },
  { name: "SmartRecruiters", url: "https://jobs.smartrecruiters.com/Experian/744000143860629-software-engineer-i", open: "I'm interested" },
  { name: "Zoho Recruit", url: "https://coditas.zohorecruit.in/jobs/Careers/31162000034795542/Senior-Net-Developer", open: "I'm interested" },
  { name: "Workday", url: "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite" },
  { name: "LinkedIn", url: "https://www.linkedin.com/jobs/search/?keywords=software%20engineer" },
];
const output = path.resolve("test-results/compatibility");
await mkdir(output, { recursive: true });
const qaRoot = path.resolve(".test-browser-profiles/compatibility-" + Date.now());
const extension = path.join(qaRoot, "extension");
await cp(path.resolve("dist"), extension, { recursive: true });
const manifest = JSON.parse(await readFile(path.join(extension, "manifest.json"), "utf8"));
// This disposable QA copy grants access only to the listed public test hosts.
// The production dist manifest and its permissions are never changed.
manifest.host_permissions = [...new Set([...manifest.host_permissions, ...sites.map((site) => new URL(site.url).origin + "/*"), "https://careers.smartrecruiters.com/*"])];
await writeFile(path.join(extension, "manifest.json"), JSON.stringify(manifest, null, 2));
const loader = (await readdir(path.join(extension, "assets"))).find((file) => file.startsWith("content.ts-loader-") && file.endsWith(".js"));
const context = await chromium.launchPersistentContext(path.join(qaRoot, "browser"), {
  channel: "chromium",
  executablePath: process.env.APPLYEASE_CHROMIUM ?? (existsSync(".browser/chrome.exe") ? path.resolve(".browser/chrome.exe") : undefined),
  headless: true, ignoreDefaultArgs: ["--disable-extensions"], timeout: 20000,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
const results = [];
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker", { timeout: 20000 });
  for (const site of sites) {
    if (process.env.EASYAPPLY_SITE && site.name !== process.env.EASYAPPLY_SITE) continue;
    let page = await context.newPage();
    const result = { site: site.name, requestedUrl: site.url, checkedAt: new Date().toISOString(), scope: "Read-only live DOM scan; no fill or submission" };
    try {
      const response = await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 30000 });
      result.httpStatus = response?.status();
      // Wait for the public application UI to render, without requiring analytics to settle.
      await page.locator("input:visible, textarea:visible, select:visible").first().waitFor({ timeout: 10000 }).catch(() => {});
      const decline = page.getByRole("button", { name: /^Decline/ }).first();
      if (await decline.isVisible()) await decline.click();
      if (site.name === "Workday") {
        const job = page.locator('a[data-automation-id="jobTitle"]').first();
        if (await job.isVisible()) {
          await job.click();
          const apply = page.getByRole("button", { name: /^Apply$/ }).or(page.getByRole("link", { name: /^Apply$/ })).first();
          await apply.waitFor({ timeout: 10000 });
          await apply.click();
          const manual = page.getByRole("button", { name: "Apply Manually", exact: true }).or(page.getByRole("link", { name: "Apply Manually", exact: true })).first();
          if (await manual.isVisible()) await manual.click();
          await page.locator('input[type="password"]').first().waitFor({ timeout: 10000 }).catch(() => {});
        }
      }
      if (site.open) {
        const opener = page.getByRole("link", { name: site.open, exact: true }).or(page.getByRole("button", { name: site.open, exact: true })).first();
        if (await opener.isVisible()) {
          const popup = page.waitForEvent("popup", { timeout: 5000 }).catch(() => null);
          await opener.click({ timeout: 5000 });
          const opened = await popup;
          if (opened) page = opened;
          await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
          await page.locator("input:visible, textarea:visible, select:visible").first().waitFor({ timeout: 10000 }).catch(() => {});
        }
      }
      result.url = page.url();
      result.title = await page.title();
      result.visibleControls = await page.locator("input:visible, textarea:visible, select:visible").count();
      result.frames = page.frames().length - 1;
      const bodyText = await page.locator("body").innerText();
      result.accessNote = /Access is temporarily restricted/i.test(bodyText) ? "Site restricted automated access" : /No longer accepting applications/i.test(bodyText) ? "Posting closed" : await page.locator('input[type="password"]:visible').count() ? "Sign-in gate; no credentials entered" : site.name === "LinkedIn" ? "Public search only; authenticated Easy Apply not tested" : "Public page";
      result.linksToApplication = await page.locator("a").evaluateAll((links) => links.filter((a) => /apply|interested|application/i.test(a.textContent ?? "")).slice(0, 5).map((a) => ({ text: a.textContent.trim().slice(0, 80), href: a.href })));
      result.scan = await worker.evaluate(async ({ url, loader }) => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find((tab) => tab.url === url);
        if (!tab?.id) throw Error("Public test tab not found");
        await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, files: [`assets/${loader}`] });
        for (let attempt = 0; attempt < 20; attempt++) {
          try {
            const ready = await chrome.tabs.sendMessage(tab.id, { type: "ping" }, { frameId: 0 });
            if (ready?.ready) break;
          } catch { /* Wait for the extension module loader. */ }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        // These values only enter the preview and are never written into the website.
        const response = await chrome.tabs.sendMessage(tab.id, { type: "detect", values: {
          fullName: "Compatibility Test", firstName: "Compatibility", lastName: "Test",
          email: "test@example.invalid", mobile: "9999999999", city: "Test City",
          country: "India", linkedin: "https://example.invalid/profile", experience: "Test experience", totalExperience: "2",
        } }, { frameId: 0 });
        if (response?.error) throw Error(response.error);
        return { detected: response.matches.length, recognized: response.matches.filter((match) => match.field).length,
          selected: response.matches.filter((match) => match.selected).length,
          fields: response.matches.map(({ label, field, kind, selected }) => ({ label: label.slice(0, 180), field, kind, selected })) };
      }, { url: page.url(), loader });
      result.outcome = result.scan.detected ? "Scanned; manual compatibility review required" : "No eligible main-document controls";
      await page.screenshot({ path: path.join(output, site.name.toLowerCase().replace(/\W+/g, "-") + ".png") });
    } catch (error) {
      result.outcome = "Blocked or unavailable";
      result.error = String(error).slice(0, 1500);
    }
    results.push(result);
    console.log(JSON.stringify(result));
    await writeFile(path.join(output, "results.json"), JSON.stringify(results, null, 2));
    await page.close();
  }
} finally {
  await context.close();
}
