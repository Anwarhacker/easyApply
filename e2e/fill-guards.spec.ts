import { test, expect, chromium } from "@playwright/test";
import path from "node:path";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { blankProfile, type Match } from "../src/model";

test("autofill preserves radio choices, respects disabled groups and rechecks text limits", async () => {
  const extension = path.resolve(process.env.EASYAPPLY_EXTENSION_PATH || "dist");
  const loader = (await readdir(path.join(extension, "assets"))).find(name => name.startsWith("content.ts-loader-") && name.endsWith(".js"))!;
  const context = await chromium.launchPersistentContext(path.resolve(".test-browser-profiles/guards-" + Date.now()), {
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
    const url = "http://127.0.0.1:4174/test-form.html?guards";
    await site.goto(url);
    const tabId = await settings.evaluate(async ({ url, loader }) => {
      const tab = (await chrome.tabs.query({})).find(tab => tab.url === url)!;
      await chrome.scripting.executeScript({ target: { tabId: tab.id! }, files: [`assets/${loader}`] });
      return tab.id!;
    }, { url, loader });
    await expect.poll(() => settings.evaluate(async tabId => {
      try { return (await chrome.tabs.sendMessage(tabId, { type: "ping" }))?.ready; } catch { return false; }
    }, tabId)).toBe(true);
    const profile = blankProfile();
    profile.values.noticePeriod = "30 days";
    profile.values.fullName = "Alex Morgan";
    profile.values.city = "Bengaluru";
    profile.values.aboutYou = "An engineer who enjoys building useful products.";
    type Preview = { matches: Match[]; scanId: string };
    const scan = () => settings.evaluate(async ({ tabId, profile }) =>
      await chrome.tabs.sendMessage(tabId, { type: "detect", profileId: profile.id, values: profile.values }) as Preview, { tabId, profile });
    const fill = (preview: Preview) => settings.evaluate(async ({ tabId, preview }) =>
      await chrome.tabs.sendMessage(tabId, { type: "fill", ...preview, confirmSensitive: false }) as { filled: number; errors: string[] }, { tabId, preview });
    const radioForm = `<form><fieldset><legend>Notice period</legend>
      <label><input id="immediate" type="radio" name="noticePeriod" value="Immediate">Immediate</label>
      <label><input id="later" type="radio" name="noticePeriod" value="30 days">30 days</label>
      </fieldset></form>`;
    await site.evaluate(html => { document.body.innerHTML = html; }, radioForm);
    let preview = await scan();
    expect(preview.matches.some(match => match.selected && match.value)).toBe(true);
    // A manual choice after scan must survive, even though the target radio
    // itself remains unchecked and its individual snapshot hasn't changed.
    await site.locator("#immediate").check();
    let result = await fill(preview);
    expect(result.filled).toBe(0);
    expect(result.errors.join(" ")).toContain("existing answer preserved");
    await expect(site.locator("#immediate")).toBeChecked();
    preview = await scan();
    expect(preview.matches.every(match => match.blocked && !match.selected)).toBe(true);
    // Equal names in different forms are different native radio groups.
    await site.evaluate(html => { document.body.innerHTML = html + html.replaceAll('id="', 'id="second-'); }, radioForm);
    await site.locator("#immediate").check();
    preview = await scan();
    result = await fill(preview);
    expect(result.filled).toBe(1);
    await expect(site.locator("#immediate")).toBeChecked();
    await expect(site.locator("#second-later")).toBeChecked();

    await site.evaluate(() => { document.body.innerHTML = `<form>
      <fieldset disabled><legend>Unavailable</legend><label>Full name<input id="disabled-name"></label></fieldset>
      <label>Full name<input id="long-name" maxlength="5"></label>
      <label>About you<textarea id="short-bio" minlength="100"></textarea></label>
      <label>Full name<input id="valid-name" maxlength="11"></label>
      </form>`; });
    preview = await scan();
    expect(preview.matches).toHaveLength(3);
    expect(preview.matches.filter(match => match.selected)).toHaveLength(1);
    expect(preview.matches.some(match => match.reason?.includes("5-character limit"))).toBe(true);
    expect(preview.matches.some(match => match.reason?.includes("100-character minimum"))).toBe(true);
    result = await fill(preview);
    expect(result.filled).toBe(1);
    await expect(site.locator("#disabled-name")).toHaveValue("");
    await expect(site.locator("#long-name")).toHaveValue("");
    await expect(site.locator("#short-bio")).toHaveValue("");
    await expect(site.locator("#valid-name")).toHaveValue("Alex Morgan");
    await site.locator("#valid-name").clear();
    preview = await scan();
    await site.locator("#valid-name").evaluate(el => el.setAttribute("maxlength", "3"));
    result = await fill(preview);
    expect(result.filled).toBe(0);
    expect(result.errors.join(" ")).toContain("3-character limit");
    await expect(site.locator("#valid-name")).toHaveValue("");
    await site.locator("#valid-name").evaluate(el => { el.removeAttribute("maxlength"); el.outerHTML = `<fieldset id="late-disabled"><label>Full name<input id="valid-name"></label></fieldset>`; });
    preview = await scan();
    await site.locator("#late-disabled").evaluate(el => el.setAttribute("disabled", ""));
    result = await fill(preview);
    expect(result.filled).toBe(0);
    await expect(site.locator("#valid-name")).toHaveValue("");
    // An SPA can navigate without detaching the old controls. Stop instead of
    // continuing to fill the remainder of a preview for another route.
    await site.evaluate(() => {
      document.body.innerHTML = `<form><label>Full name<input id="route-name"></label><label>City<input id="route-city"></label></form>`;
      document.getElementById("route-name")!.addEventListener("input", () => history.replaceState({}, "", "?guards-next"), { once: true });
    });
    preview = await scan();
    result = await fill(preview);
    expect(result.filled).toBe(1);
    expect(result.errors.join(" ")).toContain("page changed");
    await expect(site.locator("#route-city")).toHaveValue("");
    // Visible labels and composed accessible names outrank misleading IDs.
    profile.values.currentSalary = "600000";
    profile.values.expectedSalary = "900000";
    profile.values.email = "alex@example.com";
    await site.evaluate(() => {
      document.body.innerHTML = `<form>
        <label for="expectedSalary">Current salary</label><input id="expectedSalary">
        <span id="current-label">Current</span><span id="salary-label">salary</span>
        <input id="accessible-salary" name="expectedSalary" aria-labelledby="current-label salary-label">
        <label>Email address or phone number<input id="ambiguous" name="email"></label>
        <label>Years of experience with Python<input id="technical" name="totalExperience"></label>
        <label>Company website<input id="company-site" name="portfolio"></label>
        <div><label for="known-email">Email address</label><input id="known-email"><input id="unrelated"></div>
      </form>`;
    });
    preview = await scan();
    expect(preview.matches.filter(match => match.field === "currentSalary")).toHaveLength(2);
    expect(preview.matches.filter(match => match.selected)).toHaveLength(3);
    result = await fill(preview);
    expect(result.filled).toBe(3);
    await expect(site.locator("#expectedSalary")).toHaveValue("600000");
    await expect(site.locator("#accessible-salary")).toHaveValue("600000");
    await expect(site.locator("#known-email")).toHaveValue("alex@example.com");
    for (const id of ["ambiguous", "technical", "company-site", "unrelated"])
      await expect(site.locator(`#${id}`)).toHaveValue("");
    await site.evaluate(() => { document.body.innerHTML = `<label>Skills<select multiple><option>React</option><option selected>Python</option></select></label><label>Resume<input id="resume" type="file" accept=".txt"></label>`; });
    const other = blankProfile("Different role");
    await settings.evaluate(async ({ first, other }) => {
      await chrome.storage.local.set({ profiles: [first, other], activeProfileId: first.id });
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("easyapply_vault", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("resumes", { keyPath: "id" });
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result; const tx = db.transaction("resumes", "readwrite");
          for (const [profile, name] of [[first, "first.txt"], [other, "other.txt"]] as const)
            tx.objectStore("resumes").put({ id: profile.id, name, type: "text/plain", size: 6, updatedAt: new Date().toISOString(), dataBase64: "data:text/plain;base64,cmVzdW1l" });
          tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); };
        };
      });
    }, { first: profile, other });
    preview = await scan();
    expect(preview.matches.find(m => m.kind === "select")?.blocked).toBe(true);
    await settings.evaluate(async id => chrome.storage.local.set({ activeProfileId: id }), other.id);
    result = await fill(preview);
    expect(result.filled).toBe(1);
    expect(await site.locator("#resume").evaluate(el => (el as HTMLInputElement).files?.[0]?.name)).toBe("first.txt");
    expect(await site.locator("select").evaluate(el => [...(el as HTMLSelectElement).selectedOptions].map(option => option.text))).toEqual(["Python"]);
    await site.locator("#resume").evaluate(el => { (el as HTMLInputElement).value = ""; el.setAttribute("accept", ".pdf"); });
    preview = await scan();
    result = await fill(preview);
    expect(result.filled).toBe(0);
    expect(result.errors.join(" ")).toContain("not accepted");
  } finally { await context.close(); }
});
