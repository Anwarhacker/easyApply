import { test, expect, chromium } from "@playwright/test";
import path from "node:path";
import { existsSync } from "node:fs";
import { appendFile, cp, readdir } from "node:fs/promises";
import { blankProfile } from "../src/model";

test("fresh-page background actions and panel share the persisted profile", async () => {
  test.setTimeout(120000);
  const qaRoot = path.resolve(".test-browser-profiles/quick-fill-" + Date.now());
  const extension = path.join(qaRoot, "extension");
  await cp(path.resolve(process.env.EASYAPPLY_EXTENSION_PATH || "dist"), extension, { recursive: true });
  const moduleFile = (await readdir(path.join(extension, "assets"))).find((file) => file.startsWith("background.ts-") && file.endsWith(".js"));
  expect(moduleFile).toBeTruthy();
  // Static import is required in MV3 service workers. Expose only in this disposable
  // test copy; the production build has no test messaging or global test hook.
  await appendFile(path.join(extension, "service-worker-loader.js"),
    `\nimport { activatePage } from './assets/${moduleFile}'; globalThis.qaActivatePage = activatePage;\n`);
  const context = await chromium.launchPersistentContext(
    path.join(qaRoot, "browser"), {
      channel: "chromium",
      executablePath: process.env.APPLYEASE_CHROMIUM ?? (existsSync(".browser/chrome.exe") ? path.resolve(".browser/chrome.exe") : undefined),
      headless: true, ignoreDefaultArgs: ["--disable-extensions"], timeout: 20000,
      viewport: { width: 1280, height: 800 },
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
  try {
    const manager = await context.newPage();
    await manager.goto("chrome://extensions");
    const card = manager.locator("extensions-item").filter({ hasText: "easyApply" });
    await expect(card).toBeVisible();
    const id = await card.getAttribute("id");
    const first = blankProfile("First role");
    first.values.fullName = "First Applicant";
    const second = blankProfile("Second role");
    second.values.fullName = "Second Applicant";
    second.values.firstName = "Second";
    second.values.country = "India";
    second.values.state = "Karnataka";
    second.values.city = "Bengaluru";
    second.values.currentLocation = "Bangalore";
    second.values.preferredLocation = "Bengaluru";
    second.values.noticePeriod = "30 days";
    second.values.linkedin = "https://www.linkedin.com/in/test-applicant";
    second.customFieldAnswers = { "Do you have experience working in BFSI Domain": "No" };
    const settings = await context.newPage();
    await settings.goto(`chrome-extension://${id}/settings.html`);
    // Wake an idle MV3 worker instead of assuming it is running at browser launch.
    await settings.evaluate(() => chrome.runtime.sendMessage({ type: "get-profiles" }));
    const worker = context.serviceWorkers().find((worker) => new URL(worker.url()).host === id)
      ?? await context.waitForEvent("serviceworker", { timeout: 20000 });
    await settings.evaluate(async (profiles) => {
      await chrome.storage.local.set({ profiles, activeProfileId: profiles[0].id, "onboarding:v2": { done: true, step: 0 } });
    }, [first, second]);
    await settings.reload();
    const skip = settings.getByRole("button", { name: "Skip tour", exact: true });
    if (await skip.isVisible()) await skip.click();
    await settings.getByLabel("Active profile").selectOption(second.id);
    await expect(settings.getByLabel("Active profile")).toBeEnabled();
    await settings.reload();
    await expect(settings.getByLabel("Active profile")).toHaveValue(second.id);
    await settings.getByRole("button", {name:"Collapse all sections", exact:true}).click();
    await expect(settings.locator('[name="values.city"]')).not.toBeVisible();
    await settings.screenshot({path:"test-results/collapsed-profile-sections.png", animations:"disabled"});
    await settings.getByRole("heading", {name:"Job profile", exact:true}).click();
    await settings.getByRole("button", {name:"+ Email", exact:true}).click();
    await expect(settings.locator('[name="values.email"]')).toBeFocused();
    await expect(settings.locator('[name="values.firstName"]')).toHaveValue("Second");
    await settings.locator('[name="values.email"]').fill("invalid-email");
    await settings.getByRole("button", {name:"Collapse all sections", exact:true}).click();
    await settings.getByRole("button", {name:"Save profile", exact:true}).click();
    await expect(settings.locator('[name="values.email"]')).toBeVisible();
    await expect(settings.locator('[name="values.email"]')).toBeFocused();
    await settings.locator('[name="values.email"]').clear();
    await settings.getByRole("button", {name:"Expand all sections", exact:true}).click();
    await settings.getByLabel("Question", { exact: true }).fill("Do you have experience in building RESTful APIs and microservices architecture.");
    await settings.getByLabel("Your answer", { exact: true }).fill("Yes");
    await settings.getByRole("button", { name: "Save profile", exact: true }).click();
    await expect(settings.getByRole("alert")).toContainText("Click Add answer");
    await expect(settings.getByLabel("Your answer", {exact:true})).toHaveValue("Yes");
    await expect(settings.getByRole("button", {name:"Add answer", exact:true})).toBeFocused();
    await settings.getByRole("button", { name: "Add answer", exact: true }).click();
    await expect(settings.getByRole("button", {name:"Save profile", exact:true})).toBeFocused();
    await expect(settings.getByText("Answer added to your draft. Click Save profile to keep it on this device.", {exact:true})).toBeVisible();
    await settings.getByRole("button", { name: "Save profile", exact: true }).click();
    await expect(settings.getByText("Profile saved on this device.", { exact: true })).toBeVisible();
    await settings.getByRole("button", {name:"Cover letter", exact:true}).click();
    const letterDialog = settings.getByRole("dialog", {name:"Cover letter generator"});
    await expect(letterDialog.getByRole("tab", {name:"Full Cover Letter"})).toHaveAttribute("aria-selected", "true");
    const draft = letterDialog.getByRole("textbox", {name:"Full Cover Letter", exact:true});
    await draft.fill("My carefully edited letter");
    await letterDialog.getByLabel("Company", {exact:true}).fill("Example Company");
    await letterDialog.getByLabel("Job Title", {exact:true}).fill("Frontend Developer");
    await letterDialog.getByLabel("Relevant achievement or contribution").fill("Reduced page load time by 20%.");
    await expect(draft).toHaveValue("My carefully edited letter");
    await letterDialog.getByRole("button", {name:"Update draft", exact:true}).click();
    await expect(draft).toHaveValue("My carefully edited letter");
    await letterDialog.getByRole("button", {name:"Keep my edits"}).click();
    await letterDialog.getByRole("tab", {name:"About You", exact:true}).click();
    await letterDialog.getByRole("button", {name:"Update draft", exact:true}).click();
    await letterDialog.getByRole("tab", {name:"Full Cover Letter", exact:true}).click();
    await expect(draft).toHaveValue("My carefully edited letter");
    await letterDialog.getByRole("button", {name:"Update draft", exact:true}).click();
    await letterDialog.getByRole("button", {name:"Replace edited draft"}).click();
    await expect(draft).toHaveValue(/Example Company/);
    await expect(draft).toHaveValue(/Reduced page load time by 20%/);
    const downloadEvent = settings.waitForEvent("download");
    await letterDialog.getByRole("button", {name:"Download .txt"}).click();
    expect((await downloadEvent).suggestedFilename()).toBe("coverLetter-Example-Company.txt");
    await letterDialog.screenshot({path:"test-results/cover-letter-generator.png"});
    await draft.press("Escape");
    await expect(letterDialog).toHaveCount(0);
    const commands = await worker.evaluate(() => chrome.commands.getAll());
    expect(commands.some((command) => command.name === "quick-fill")).toBe(true);
    const site = await context.newPage();
    const url = "http://127.0.0.1:4174/test-form.html?quick-fill-regression";
    await site.goto(url);
    await site.evaluate(() => {
      const section = document.createElement("section");
      section.innerHTML = '<label>Preferred First Name<input id="preferred-name-check" name="firstName"></label><label>Country<input id="custom-country-check" role="combobox" aria-haspopup="listbox"></label><label>What is your location?<select id="option-label-check"><option value="">Select...</option><option>United States</option><option>India</option></select></label>';
      document.body.append(section);
    });
    await expect(site.locator("#easyapply-host")).toHaveCount(0);
    const activate = (action: "open" | "fill") => worker.evaluate(async ({ url, action }) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((tab) => tab.url === url);
      if (!tab) throw Error("Test tab not found");
      await (globalThis as unknown as { qaActivatePage: (action: string, tab: chrome.tabs.Tab) => Promise<void> }).qaActivatePage(action, tab);
    }, { url, action });
    // Invoke the exact shared handler used by contextMenus and commands. Unit tests
    // verify event registration; this test verifies injection and actual DOM filling.
    await activate("fill");
    await expect(site.locator("[name=fullName]")).toHaveValue("Second Applicant");
    await site.addScriptTag({ type: "module", url: "/e2e/fixtures/greenhouse.tsx" });
    await expect(site.locator("#gh-country")).toBeVisible();
    await activate("fill");
    for (const [id, answer] of [["gh-country", "India +91"], ["gh-city", "Bengaluru, Karnataka, India"], ["gh-current", "Bengaluru"], ["gh-notice", "No"], ["gh-experience", "No"], ["gh-rest", "Yes"], ["gh-preserved", "Mumbai"]]) {
      await expect(site.getByTestId(id).locator(".select__single-value")).toHaveText(answer);
    }
    for (const id of ["gh-unanswered", "gh-consent", "gh-missing", "gh-duplicate", "gh-rejected", "gh-blur-rejected"]) {
      await expect(site.getByTestId(id).locator(".select__single-value")).toHaveCount(0);
      await expect(site.locator(`#${id}`)).toHaveValue("");
    }
    await activate("open");
    await expect(site.getByRole("region", { name: "Last fill report" })).toContainText("website cleared, changed, or rejected");
    await expect(site.locator("#gh-linkedin")).toHaveValue(second.values.linkedin);
    await expect(site.locator("#easyapply-host")).toHaveCount(1);
    await expect(site.locator("[name=pan]")).toHaveValue("");
    await expect(site.locator("[name=terms]")).not.toBeChecked();
    await expect(site.locator("#preferred-name-check")).toHaveValue("");
    await expect(site.locator("#custom-country-check")).toHaveValue("");
    await expect(site.locator("#option-label-check")).toHaveValue("");
    await site.reload();
    await expect(site.locator("#easyapply-host")).toHaveCount(0);
    await activate("open");
    await expect(site.getByLabel("Quick Fill profile")).toHaveValue(second.id);
    await site.getByLabel("Quick Fill profile").selectOption(first.id);
    await expect(site.getByRole("button", { name: "Fill Application", exact: true })).toBeEnabled();
    await settings.reload();
    await settings.getByRole("button", { name: "Expand all sections", exact: true }).click();
    await expect(settings.getByLabel("Active profile")).toHaveValue(first.id);
    await settings.screenshot({ path: "test-results/store-settings.png" });
    await expect(settings.getByRole("progressbar", { name: "Profile essentials added" })).toBeVisible();
    await settings.getByRole("button", { name: "+ Email", exact: true }).click();
    await expect(settings.locator('[name="values.email"]')).toBeFocused();
    const repair = await context.newPage();
    await repair.goto(`chrome-extension://${id}/settings.html?profile=${second.id}&field=city#profiles`);
    await expect(repair.getByLabel("Active profile")).toHaveValue(second.id);
    await expect(repair.locator('[name="values.city"]')).toBeFocused();
    await expect(repair.locator('[name="values.city"]')).toHaveValue("Bengaluru");
    await repair.goto(`chrome-extension://${id}/settings.html?profile=${first.id}&question=Do%20you%20have%20REST%20API%20experience%3F#profiles`);
    await expect(repair.getByLabel("Question", { exact: true })).toHaveValue("Do you have REST API experience?");
    await repair.close();
    await site.getByRole("button", { name: "Fill Application", exact: true }).click();
    await expect(site.locator("[name=fullName]")).toHaveValue("First Applicant");
    await expect(site.locator("#easyapply-host .ea-toast")).toContainText("Filled 1 field.");
    // Reconnecting must not replace the widget or disconnect its callbacks.
    await activate("open");
    await expect(site.locator("#easyapply-host")).toHaveCount(1);
    await expect(site.getByLabel("Quick Fill profile")).toHaveValue(first.id);
    await expect(site.getByRole("region", { name: "Last fill report" })).toContainText("1 filled");
    expect(await site.evaluate(() => (window as unknown as { eventCounts: { submit: number } }).eventCounts.submit)).toBe(0);
    await site.screenshot({ path: "test-results/quick-fill-panel.png" });
    await site.evaluate(() => {
      document.body.innerHTML = `<form>
        <label>Full name<input id="rejected" name="fullName"></label>
        <label>Email<input id="invalid" type="email"></label>
        <div class="form-row"><label for="phone-check">Phone number</label><input id="phone-check" name="mobile"><span>Country code</span></div>
        <div><label for="city-check">City</label><input id="city-check"><span>Postal Code</span></div>
        <label>Date of birth<input id="readonly-date" readonly placeholder="Select date"></label>
        <label>Country<select><option value="">Choose</option><option>Canada</option></select></label>
        <label>Favorite editor<input></label>
        <label>Last name<input></label>
        <label>Current location<input id="existing-location" value="Mumbai"></label>
      </form>`;
      document.querySelector("#rejected")!.addEventListener("input", event => {
        const input = event.target as HTMLInputElement;
        setTimeout(() => { input.value = ""; }, 40);
      });
      document.querySelector("#invalid")!.addEventListener("change", event => (event.target as Element).setAttribute("aria-invalid", "true"));
    });
    const check = await worker.evaluate(async ({ url }) => {
      const tab = (await chrome.tabs.query({})).find(t => t.url === url)!;
      const detected = await chrome.tabs.sendMessage(tab.id!, { type: "detect", values: {
        fullName: "Test Applicant", email: "test@example.com", mobile: "5550101234", city: "Bengaluru",
        country: "India", dob: "2000-08-15", currentLocation: "Pune",
      } }, { frameId: 0 });
      const pending = chrome.tabs.sendMessage(tab.id!, { type: "fill", scanId: detected.scanId,
        matches: detected.matches, confirmSensitive: false }, { frameId: 0 });
      const overlapping = await chrome.tabs.sendMessage(tab.id!, { type: "detect", values: {} }, { frameId: 0 });
      const result = await pending;
      return { matches: detected.matches, result, overlapping };
    }, { url });
    expect(check.matches.find((m: { label: string }) => m.label === "Phone number").field).toBe("mobile");
    expect(check.matches.find((m: { label: string }) => m.label === "City").field).toBe("city");
    for (const reason of ["No matching dropdown option", "Already filled", "No usable saved value", "Needs your answer", "Read-only control"])
      expect(check.matches.some((m: { reason?: string; selected: boolean }) => m.reason?.includes(reason) && !m.selected)).toBe(true);
    expect(check.result, JSON.stringify(check.result)).toHaveProperty("filled", 2);
    expect(check.overlapping.error).toContain("still running");
    expect(check.result.errors).toHaveLength(2);
    expect(check.result.errors.every((error: string) => error.includes("website cleared, changed, or rejected"))).toBe(true);
    await expect(site.locator("#phone-check")).toHaveValue("5550101234");
    await expect(site.locator("#city-check")).toHaveValue("Bengaluru");
    await expect(site.locator("#existing-location")).toHaveValue("Mumbai");
    await expect(site.locator("#invalid")).toHaveAttribute("aria-invalid", "true");
    const privacy = await context.newPage();
    await site.evaluate(() => {
      document.body.innerHTML = `<form>
        <label>Notice period<select id="notice-exact"><option value="">Choose</option><option value="internal-7">1 month</option></select></label>
        <label>Notice period<select id="notice-wrong"><option value="">Choose</option><option value="30">45 days</option></select></label>
        <label>Notice period<select id="notice-changed"><option value="">Choose</option><option value="internal-8">30 days</option></select></label>
        <fieldset><legend>Notice period</legend><label><input type="radio" name="notice" id="notice-now" value="30">Immediate</label><label><input type="radio" name="notice" id="notice-month" value="code-month">1 month</label></fieldset>
      </form>`;
    });
    const noticeScan = await worker.evaluate(async ({ url }) => {
      const tab = (await chrome.tabs.query({})).find(t => t.url === url)!;
      return chrome.tabs.sendMessage(tab.id!, { type: "detect", values: { noticePeriod: "30 days" } });
    }, { url });
    await site.locator("#notice-changed option").nth(1).evaluate(el => { el.textContent = "90 days"; });
    const noticeResult = await worker.evaluate(async ({ url, scan }) => {
      const tab = (await chrome.tabs.query({})).find(t => t.url === url)!;
      return chrome.tabs.sendMessage(tab.id!, { type: "fill", scanId: scan.scanId, matches: scan.matches, confirmSensitive: false });
    }, { url, scan: noticeScan });
    expect(noticeResult.filled).toBe(2);
    expect(noticeResult.errors).toHaveLength(1);
    await expect(site.locator("#notice-exact")).toHaveValue("internal-7");
    await expect(site.locator("#notice-wrong")).toHaveValue("");
    await expect(site.locator("#notice-changed")).toHaveValue("");
    await expect(site.locator("#notice-now")).not.toBeChecked();
    await expect(site.locator("#notice-month")).toBeChecked();
    // Blur validators must run for native dates and selects, and delayed
    // rejection must not be reported as a successful fill.
    await site.evaluate(() => {
      document.body.innerHTML = `<label>Country<select id="validated-country"><option value="">Select</option><option>India</option></select></label>
        <label>Date of birth<input id="validated-date" type="date"></label>
        <label>First name<input id="retained-name"></label>`;
      for (const id of ["validated-country", "validated-date"]) {
        const control = document.getElementById(id) as HTMLInputElement;
        control.addEventListener("focusout", () => setTimeout(() => {
          control.value = "";
          control.setAttribute("aria-invalid", "true");
        }, 400));
      }
    });
    const validationResult = await worker.evaluate(async url => {
      const tab = (await chrome.tabs.query({})).find(t => t.url === url)!;
      const scan = await chrome.tabs.sendMessage(tab.id!, {type:"detect", values: {country:"India", dob:"2000-02-29", firstName:"Retained"}});
      return chrome.tabs.sendMessage(tab.id!, {type:"fill", scanId:scan.scanId, matches:scan.matches, confirmSensitive:false});
    }, url);
    expect(validationResult.filled).toBe(1);
    expect(validationResult.errors).toHaveLength(2);
    expect(validationResult.errors.every((error: string) => error.includes("rejected"))).toBe(true);
    await expect(site.locator("#validated-date")).toHaveValue("");
    await expect(site.locator("#validated-country")).toHaveValue("");
    await expect(site.locator("#retained-name")).toHaveValue("Retained");
    const frontend = blankProfile("Frontend profile");
    frontend.values.email = "step@example.com";
    frontend.values.mobile = "9876543210";
    frontend.values.skills = "React, TypeScript, CSS";
    const backend = blankProfile("Java backend profile");
    backend.values.skills = "Java, Spring, SQL";
    await settings.evaluate(async ({frontend, backend}) => {
      await chrome.storage.local.set({ profiles: [frontend, backend], activeProfileId: backend.id });
      await chrome.runtime.sendMessage({ type: "save-stored-resume", profileId: frontend.id, item: {
        name: "frontend-resume.pdf", size: 8, type: "application/pdf", dataBase64: "data:application/pdf;base64,JVBERi0xLjQ=", updatedAt: new Date().toISOString(),
      } });
    }, { frontend, backend });
    await site.reload();
    await site.evaluate(() => {
      document.querySelector("h1")!.textContent = "Frontend Engineer";
      const description = document.createElement("section");
      description.id = "job-description";
      description.textContent = "Build accessible React interfaces using TypeScript and CSS. Collaborate with designers and maintain components.";
      document.body.prepend(description);
    });
    await activate("open");
    await site.getByRole("button", { name: "Suggest profile for this job", exact: true }).click();
    const suggestions = site.getByRole("region", { name: "Job-specific profile suggestions" });
    await expect(suggestions).toContainText("frontend-resume.pdf");
    await expect(suggestions).toContainText("react, typescript, css");
    await expect(site.getByLabel("Quick Fill profile")).toHaveValue(backend.id);
    await suggestions.getByRole("button", { name: "Use Frontend profile", exact: true }).click();
    await expect(site.getByLabel("Quick Fill profile")).toHaveValue(frontend.id);
    await expect(site.locator('[name="fullName"]')).toHaveValue("");
    await expect(site.locator(".ea-resume-section")).toContainText("frontend-resume.pdf");
    await expect(suggestions).toBeVisible();
    await suggestions.screenshot({ path: "test-results/job-suggestions-verified.png", animations: "disabled" });
    await suggestions.getByLabel("Job title", { exact: true }).fill("");
    await expect(suggestions.locator(".ea-job-candidate")).toHaveCount(0);
    await suggestions.getByLabel("Job description", { exact: true }).fill("");
    await suggestions.getByRole("button", { name: "Compare saved profiles", exact: true }).click();
    await expect(suggestions).toContainText("No clear match");
    await expect(site.getByLabel("Quick Fill profile")).toHaveValue(frontend.id);
    await suggestions.getByLabel("Job title", { exact: true }).fill("Java backend engineer");
    await suggestions.getByLabel("Job description", { exact: true }).fill("Develop Java services with Spring and SQL.");
    await suggestions.getByRole("button", { name: "Compare saved profiles", exact: true }).click();
    await expect(suggestions.getByRole("button", { name: "Use Java backend profile", exact: true })).toBeEnabled();
    await expect(suggestions).toContainText("No resume attached");
    await expect(site.getByLabel("Quick Fill profile")).toHaveValue(frontend.id);
    const stepUrl = "http://127.0.0.1:4174/e2e/fixtures/multi-step.html";
    await site.goto(stepUrl);
    await worker.evaluate(async url => {
      const tab = (await chrome.tabs.query({})).find(t => t.url === url)!;
      await (globalThis as unknown as {qaActivatePage: (action:string, tab:chrome.tabs.Tab) => Promise<void>}).qaActivatePage("open", tab);
    }, stepUrl);
    await site.getByRole("button", {name:"Next", exact:true}).click();
    const offer = site.getByRole("region", {name:"New application step"});
    await expect(offer).toContainText("1 new empty field");
    await expect(site.locator('[name="email"]')).toHaveValue("");
    await offer.getByRole("button", {name:"Fill this step", exact:true}).click();
    await expect(site.locator('[name="email"]')).toHaveValue("step@example.com");
    await expect(site.locator(".ea-toast")).toContainText("Filled 1 field");
    await site.getByRole("button", {name:"Next step", exact:true}).click();
    await expect(site.locator("#error")).toContainText("Please review");
    // Wait beyond stabilization to prove validation-only updates do not prompt.
    await site.waitForTimeout(1500);
    await expect(offer).toHaveCount(0);
    await site.getByRole("button", {name:"Back", exact:true}).click();
    await expect(site.locator("#first")).toBeVisible();
    await site.waitForTimeout(1500);
    await expect(offer).toHaveCount(0);
    await site.getByRole("button", {name:"Next", exact:true}).click();
    await expect(site.locator("#second")).toBeVisible();
    await site.getByRole("button", {name:"Continue", exact:true}).click();
    await site.waitForURL(/stage=3/);
    await expect(offer).toContainText("1 new empty field");
    await expect(site.locator('[name="phone"]')).toHaveValue("");
    await offer.screenshot({path:"test-results/new-step-offer.png", animations:"disabled"});
    await offer.getByRole("button", {name:"Not now", exact:true}).click();
    await site.waitForTimeout(1500);
    await expect(offer).toHaveCount(0);
    await expect(site.locator('[name="phone"]')).toHaveValue("");
    await privacy.goto(`chrome-extension://${id}/privacy.html`);
    await expect(privacy.getByRole("heading", { name: "easyApply Privacy Policy", exact: true })).toBeVisible();
    await privacy.screenshot({ path: "test-results/privacy-policy.png", fullPage: true });
  } catch (error) {
    console.error("Quick Fill regression failed:", error);
    throw error;
  } finally {
    await context.close();
  }
});

