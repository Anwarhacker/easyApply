import { test, expect, chromium } from "@playwright/test";
import path from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
test("unpacked extension saves profile, previews and fills local form without submission", async () => {
  const extension = path.resolve(process.env.EASYAPPLY_EXTENSION_PATH || "dist");
  const connected = process.env.APPLYEASE_CDP
    ? await chromium.connectOverCDP(process.env.APPLYEASE_CDP)
    : null;
  const context = connected
    ? connected.contexts()[0]
    : await chromium.launchPersistentContext(
        path.resolve(".test-browser-profiles/run-" + Date.now()),
        {
          channel: "chromium",
          executablePath:
            process.env.APPLYEASE_CHROMIUM ??
            (existsSync(".browser/chrome.exe")
              ? path.resolve(".browser/chrome.exe")
              : undefined),
          headless: true,
          ignoreDefaultArgs: ["--disable-extensions"],
          timeout: 20000,
          args: [
            `--disable-extensions-except=${extension}`,
            `--load-extension=${extension}`,
          ],
        },
      );
  try {
    context.setDefaultTimeout(15000);
    context.on("page", (page) =>
      page.on("pageerror", (error) =>
        console.error("Browser error:", error.message),
      ),
    );
    const manager = await context.newPage();
    await manager.goto("chrome://extensions");
    const card = manager
      .locator("extensions-item")
      .filter({ hasText: "easyApply" });
    await expect(card).toBeVisible();
    const id = await card.getAttribute("id");
    const settings = await context.newPage();
    await settings.goto(`chrome-extension://${id}/settings.html`);
    const tour = settings.getByRole("dialog", { name: "Welcome to easyApply" });
    await expect(tour).toBeVisible();
    await tour.getByRole("button", { name: /^Next/ }).click();
    await settings.reload();
    await expect(
      settings.getByRole("dialog", { name: "1-Click PDF Resume Parser" }),
    ).toBeVisible();
    await settings.getByRole("button", { name: /Back$/ }).click();
    await expect(
      settings.getByRole("dialog", { name: "Welcome to easyApply" }),
    ).toBeVisible();
    await settings.screenshot({ path: "test-results/welcome-tour.png" });
    for (let i = 0; i < 5; i++)
      await settings.getByRole("button", { name: /^Next/ }).click();
    await settings
      .getByRole("button", { name: /^Create my profile/ })
      .click();
    await expect(settings.getByRole("dialog")).toHaveCount(0);
    await settings.reload();
    await expect(
      settings.getByRole("button", { name: /Quick tour/ }),
    ).toBeEnabled();
    await expect(settings.getByRole("dialog")).toHaveCount(0);
    await settings
      .getByRole("button", { name: /Quick tour/ })
      .click();
    await settings
      .getByRole("button", { name: /^Skip tour/ })
      .click();
    await expect(settings.getByRole("dialog")).toHaveCount(0);
    await settings.getByRole("button", { name: "Expand all sections", exact: true }).click();
    await settings
      .getByLabel("Profile name", { exact: true })
      .fill("Frontend Developer");
    await settings.getByRole("button", { name: "Expand all sections", exact: true }).click();
    for (const [field, value] of [
      ["Full Name", "Asha Rao"],
      ["First Name", "Asha"],
      ["Last Name", "Rao"],
      ["Current Address", "12 Test Street"],
      ["Email", "asha@example.com"],
      ["Mobile", "9876543210"],
      ["City", "Pune"],
      ["Country", "India"],
      ["Gender", "Female"],
      ["Skills", "React"],
      ["Experience", "Built accessible React applications."],
      ["10th percentage", "90"],
      ["University", "Test University"],
      ["Notice period", "Immediate"],
      ["Total experience (years)", "0"],
      ["Current salary", "Not applicable"],
    ])
      await settings.getByLabel(field, { exact: true }).fill(value);
    await settings
      .getByLabel("Willing to relocate", { exact: true })
      .selectOption("Yes");
    await settings
      .getByLabel("Authorized to work in India", { exact: true })
      .selectOption("Yes");
    await settings.evaluate(() => {
      const original = chrome.storage.local.set.bind(chrome.storage.local);
      chrome.storage.local.set = async (data) => {
        await new Promise((resolve) => setTimeout(resolve, 600));
        return original(data);
      };
    });
    await settings
      .getByRole("button", { name: "Save profile", exact: true })
      .click();
    await expect(settings.getByRole("status").filter({ hasText: "Saving changes" })).toBeVisible();
    await expect(settings.getByLabel("Active profile")).toBeDisabled();
    await settings.screenshot({
      path: "test-results/settings-loading.png",
      fullPage: false,
    });
    await expect(settings.locator(".profile-saved-toast")).toContainText("Profile saved");
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:4174/test-form.html");
    // Keep the website as the active tab while inspecting the popup document.
    const popup = await context.newPage();
    await popup.setViewportSize({width:480,height:590});
    await popup.goto(`chrome-extension://${id}/index.html`);
    await page.bringToFront();
    await popup.getByRole("button", { name: "Scan application form" }).click();
    await expect(popup.getByText("Review matches")).toBeVisible();
    for (const scrollTop of [0, 450, 100000]) {
      await popup.locator("main.popup").evaluate((element, top) => { element.scrollTop = top; }, scrollTop);
      await expect.poll(() => popup.locator(".fill-cta-btn").evaluate(button => {
        const rect = button.getBoundingClientRect();
        const host = document.querySelector("main.popup")!.getBoundingClientRect();
        return rect.top >= host.top && rect.bottom <= Math.min(host.bottom, innerHeight) && button.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
      })).toBe(true);
    }
    await popup.locator("main.popup").evaluate(element => {element.scrollTop = 450;});
    await popup.screenshot({path:"test-results/sticky-fill-action.png"});
    await popup.getByRole("button", { name: /^Needs attention/ }).click();
    await expect(popup.getByRole("button", { name: /^Needs attention/ })).toHaveAttribute("aria-pressed", "true");
    await popup.getByRole("searchbox", { name: "Search detected fields" }).fill("a-field-that-does-not-exist");
    await expect(popup.getByText("No fields match this filter. Try All or clear your search.")).toBeVisible();
    await popup.getByRole("searchbox", { name: "Search detected fields" }).clear();
    const [repairPage] = await Promise.all([
      context.waitForEvent("page"),
      popup.locator(".match-repair").first().click(),
    ]);
    await repairPage.waitForURL(/settings\.html\?.*#profiles/);
    await expect(repairPage.getByLabel("Active profile")).toBeEnabled();
    await repairPage.close();
    await page.bringToFront();
    await popup.getByRole("button", { name: /^All \d/ }).click();
    await expect(page.locator("[name=fullName]")).toHaveValue("");
    await popup
      .locator(".match")
      .filter({ hasText: "Email address" })
      .getByRole("checkbox")
      .uncheck();
    await popup.getByRole("button", { name: "Fill selected fields" }).click();
    await expect(popup.getByRole("status").filter({ hasText: "Filled" })).toBeVisible();
    await expect(page.locator("[name=fullName]")).toHaveValue("Asha Rao");
    await expect(page.locator("#floating-login")).toHaveValue(
      "asha@example.com",
    );
    await expect(page.locator("#typed-login")).toHaveValue("asha@example.com");
    await expect(page.locator("#login-secret")).toHaveValue("");
    await expect(page.locator("#numeric-salary")).toHaveValue("");
    await expect(page.locator("#text-salary")).toHaveValue("Not applicable");
    await expect(page.locator("#bounded-experience")).toHaveValue("");
    await expect(page.locator("#alias-mobile")).toHaveValue("9876543210");
    await expect(page.locator("#alias-email")).toHaveValue("asha@example.com");
    await expect(page.locator("#emergency-contact")).toHaveValue("");
    await expect(
      page.locator('[name="rec-form_31840000000003149"]'),
    ).toHaveValue("Asha");
    await expect(
      page.locator('[name="rec-form_31840000000003151"]'),
    ).toHaveValue("Rao");
    await expect(page.locator('[name="rec-form_street"]')).toHaveValue(
      "12 Test Street",
    );
    await expect(page.locator('[name="rec-form_years"]')).toHaveValue("0");
    await expect(page.locator("[name=tenthPercent]")).toHaveValue("90");
    await expect(page.locator("[name=university]")).toHaveValue(
      "Test University",
    );
    await expect(page.locator("[name=noticePeriod]")).toHaveValue("Immediate");
    await expect(page.locator("[name=relocate]")).toHaveValue("Yes");
    await expect(page.locator("[name=workAuthorization]")).toHaveValue("");
    await expect(page.locator("[name=phone]")).toHaveValue("9876543210");
    await expect(page.locator("[name=email]")).toHaveValue("");
    await expect(page.locator("[name=country]")).toHaveValue("IN");
    // A personal gender value does not opt the profile into disclosures.
    await expect(page.locator("[value=Female]")).not.toBeChecked();
    await expect(page.locator("[value=Male]")).not.toBeChecked();
    await expect(page.locator("[value=React]")).toBeChecked();
    await expect(page.locator("[name=experience]")).toHaveValue(
      "Built accessible React applications.",
    );
    for (const name of ["password", "otp", "bankAccount", "pan", "aadhaar"])
      await expect(page.locator(`[name=${name}]`)).toHaveValue("");
    await expect(page.locator("[name=terms]")).not.toBeChecked();
    await expect(page.locator("[name=resume]")).toHaveCSS(
      "outline-style",
      "solid",
    );
    const counts = await page.evaluate(
      () =>
        (window as unknown as { eventCounts: Record<string, number> })
          .eventCounts,
    );
    expect(counts.submit).toBe(0);
    expect(counts.input).toBeGreaterThan(0);
    expect(counts.change).toBe(counts.input);
    expect(counts.blur).toBe(counts.input);
    await settings
      .getByRole("button", { name: "Encrypted Identity", exact: true })
      .click();
    await settings
      .getByLabel("Vault passphrase")
      .fill("local test vault phrase");
    await settings.getByLabel("PAN", { exact: true }).fill("ABCDE1234F");
    await settings.getByLabel("Aadhaar", { exact: true }).fill("123456789012");
    await settings.getByRole("button", { name: "Encrypt & save" }).click();
    await expect(settings.getByRole("status").filter({ hasText: "encrypted and locked" })).toContainText(
      "encrypted and locked",
    );
    await popup.getByText("Include encrypted identity").click();
    await popup.getByLabel("Vault passphrase").fill("local test vault phrase");
    await popup
      .getByRole("button", { name: "Unlock for this session" })
      .click();
    await expect(popup.getByRole("status").filter({ hasText: "Identity unlocked" })).toBeVisible();
    await page.bringToFront();
    await popup.getByRole("button", { name: "Scan application form" }).click();
    const pan = popup
      .locator(".match")
      .filter({ hasText: "PAN number" })
      .getByRole("checkbox");
    await expect(pan).not.toBeChecked();
    await pan.check();
    await expect(
      popup.getByRole("button", { name: "Fill selected fields" }),
    ).toBeDisabled();
    await popup
      .getByLabel(
        "I confirm filling the selected PAN/Aadhaar fields on this page.",
      )
      .check();
    await popup.getByRole("button", { name: "Fill selected fields" }).click();
    await expect(page.locator("[name=pan]")).toHaveValue("ABCDE1234F");
    await expect(page.locator("[name=aadhaar]")).toHaveValue("");
    await expect(
      popup.getByRole("heading", { name: /Review matches/ }),
    ).toHaveCount(0);
    // Existing data is protected, and edits made after preview are preserved.
    await page.bringToFront();
    await popup.getByRole("button", { name: "Scan application form" }).click();
    const phone = popup
      .locator(".match")
      .filter({ hasText: /^Contact number/ })
      .getByRole("checkbox");
    await expect(phone).not.toBeChecked();
    await expect(phone).toBeDisabled();
    await page.locator("[name=phone]").clear();
    await popup.getByRole("button", { name: "Scan application form" }).click();
    await expect(phone).toBeChecked();
    await page.locator("[name=phone]").fill("9999999999");
    await popup.getByRole("button", { name: "Fill selected fields" }).click();
    await expect(popup.getByRole("alert")).toContainText("field changed");
    await expect(page.locator("[name=phone]")).toHaveValue("9999999999");
    // A changed destination invalidates the entire preview.
    await page.bringToFront();
    await page.locator("[name=phone]").clear();
    await popup.getByRole("button", { name: "Scan application form" }).click();
    await popup
      .locator(".match")
      .filter({ hasText: /^Contact number/ })
      .getByRole("checkbox")
      .check();
    await page.goto("http://127.0.0.1:4174/test-form.html?step=2");
    await popup.getByRole("button", { name: "Fill selected fields" }).click();
    await expect(popup.getByRole("alert")).toContainText("page changed");
    await expect(page.locator("[name=phone]")).toHaveValue("");
    await popup.screenshot({ path: "test-results/popup.png", fullPage: true });
    await page.screenshot({
      path: "test-results/filled-form.png",
      fullPage: true,
    });
    await popup.bringToFront();
    await popup
      .getByRole("button", { name: "Saved info", exact: true })
      .click();
    const saved = popup.getByRole("dialog", {
      name: "Saved info",
      exact: true,
    });
    await expect(saved).toBeVisible();
    await saved
      .getByRole("button", { name: "+ Add entry", exact: true })
      .click();
    await saved
      .getByLabel("Title", { exact: true })
      .fill("Interview availability");
    await saved
      .getByLabel("Value", { exact: true })
      .fill("Weekdays after 4 PM");
    await saved
      .getByRole("button", { name: "Save entry", exact: true })
      .click();
    await expect(saved.getByRole("status")).toHaveText("Entry saved.");
    await saved.getByRole("button", { name: "Close saved info" }).click();
    await popup
      .getByRole("button", { name: "Saved info", exact: true })
      .click();
    await expect(
      saved.getByText("Weekdays after 4 PM", { exact: true }),
    ).toBeVisible();
    await saved
      .getByRole("button", { name: "Edit Interview availability", exact: true })
      .click();
    await saved
      .getByLabel("Value", { exact: true })
      .fill("Weekdays after 5 PM");
    await saved
      .getByRole("button", { name: "Save entry", exact: true })
      .click();
    await expect(saved.getByRole("status")).toHaveText("Entry saved.");
    await expect(saved.getByText("Asha Rao", { exact: true })).toBeVisible();
    await saved
      .getByRole("button", { name: "Copy Email", exact: true })
      .click();
    await expect(saved.getByRole("status")).toHaveText("Email copied.");
    const search = saved.getByRole("searchbox");
    await search.fill("");
    await search.press("Control+V");
    await expect(search).toHaveValue("asha@example.com");
    await search.fill("");
    await search.fill("interview weekdays");
    await expect(saved.getByText("Weekdays after 5 PM", {exact:true})).toBeVisible();
    await expect(saved.getByText("Asha Rao", {exact:true})).toHaveCount(0);
    await saved.getByRole("button", {name:"Copy results (1)", exact:true}).click();
    await expect(saved.getByRole("status")).toHaveText("Search results copied.");
    await saved.getByLabel("Export scope").selectOption("visible");
    const resultDownloadEvent = popup.waitForEvent("download");
    await saved.getByRole("button", {name:"Download .txt",exact:true}).click();
    const resultDownload = await resultDownloadEvent;
    await resultDownload.saveAs("test-results/saved-info-results.txt");
    const resultsText = await readFile("test-results/saved-info-results.txt", "utf8");
    expect(resultsText).toContain("Interview availability: Weekdays after 5 PM");
    expect(resultsText).not.toContain("asha@example.com");
    await saved.getByLabel("Export scope").selectOption("all");
    await search.clear();
    await saved.getByRole("button", {name:"Edit Interview availability",exact:true}).click();
    await saved.getByLabel("Value", {exact:true}).fill("Unsaved draft");
    popup.once("dialog", dialog => dialog.dismiss());
    await saved.getByRole("button", {name:"Close saved info",exact:true}).click();
    await expect(saved.getByLabel("Value", {exact:true})).toHaveValue("Unsaved draft");
    popup.once("dialog", dialog => dialog.accept());
    await saved.getByRole("button", {name:"Cancel",exact:true}).first().click();
    const downloading = popup.waitForEvent("download");
    await saved
      .getByRole("button", { name: "Download .txt", exact: true })
      .click();
    const download = await downloading;
    await download.saveAs("test-results/saved-info.txt");
    const exported = await readFile("test-results/saved-info.txt", "utf8");
    expect(exported).toContain("Full Name: Asha Rao");
    expect(exported).toContain("Email: asha@example.com");
    expect(exported).toContain("Interview availability: Weekdays after 5 PM");
    expect(exported).not.toContain("ABCDE1234F");
    expect(exported).not.toContain("123456789012");
    await saved.getByText("Asha Rao", {exact:true}).scrollIntoViewIfNeeded();
    await popup.screenshot({
      path: "test-results/saved-info.png",
      fullPage: false,
    });
    await saved.getByRole("button", { name: "Close saved info" }).click();
    await expect(saved).toHaveCount(0);
    await popup
      .getByRole("button", { name: "Saved info", exact: true })
      .click();
    popup.once("dialog", (dialog) => dialog.accept());
    await saved
      .getByRole("button", {
        name: "Delete Interview availability",
        exact: true,
      })
      .click();
    await expect(saved.getByRole("status")).toHaveText("Entry deleted.");
    await expect(
      saved.getByText("Weekdays after 5 PM", { exact: true }),
    ).toHaveCount(0);
    await saved.getByRole("button", { name: "Close saved info" }).click();
    await popup
      .getByRole("button", { name: "Smart fill", exact: true })
      .click();
    await popup
      .getByLabel("Target role", { exact: true })
      .selectOption("other");
    await expect(
      popup.getByRole("button", { name: "Copy prompt", exact: true }),
    ).toBeDisabled();
    await popup
      .getByLabel("Custom target role", { exact: true })
      .fill("UI Developer");
    await expect(
      popup.getByLabel("Prompt to copy", { exact: true }),
    ).toHaveValue(/target role: UI Developer/);
    await popup
      .getByLabel("Target role", { exact: true })
      .selectOption("Full Stack Developer");
    await expect(
      popup.getByLabel("Prompt to copy", { exact: true }),
    ).toHaveValue(/target role: Full Stack Developer/);
    await popup
      .getByLabel("Target role", { exact: true })
      .selectOption("Frontend Developer");
    await popup.getByLabel("Fields to prepare").selectOption("missing");
    await expect(popup.getByLabel("Prompt to copy", {exact:true})).not.toHaveValue(/- Email\n/);
    await popup.getByLabel("Job description (optional)").fill("Build accessible interfaces with React.");
    await expect(popup.getByLabel("Prompt to copy", {exact:true})).toHaveValue(/Build accessible interfaces with React/);
    const promptDownloadEvent = popup.waitForEvent("download");
    await popup.getByRole("button", {name:"Download prompt",exact:true}).click();
    const promptDownload = await promptDownloadEvent;
    await promptDownload.saveAs("test-results/resume-prompt.txt");
    const promptText = await readFile("test-results/resume-prompt.txt", "utf8");
    expect(promptText).toContain("Build accessible interfaces with React");
    expect(promptText).not.toContain("asha@example.com");
    await popup.getByLabel("Fields to prepare").selectOption("all");
    const expectedPrompt = await popup
      .getByLabel("Prompt to copy", { exact: true })
      .inputValue();
    expect(expectedPrompt).toContain("target role: Frontend Developer");
    expect(expectedPrompt).not.toContain("asha@example.com");
    await popup
      .getByRole("button", { name: "Copy prompt", exact: true })
      .click();
    await expect(
      popup.locator(".smart-prompt").getByRole("status"),
    ).toContainText("Prompt copied");
    await popup.evaluate(() => {
      const sink = document.createElement("textarea");
      sink.id = "clipboard-test";
      document.body.append(sink);
      sink.focus();
    });
    await popup.locator("#clipboard-test").press("Control+V");
    await expect(popup.locator("#clipboard-test")).toHaveValue(expectedPrompt);
    await popup.locator("#clipboard-test").evaluate((el) => el.remove());
    await popup.locator(".smart-prompt").scrollIntoViewIfNeeded();
    await popup.screenshot({ path: "test-results/smart-prompt.png" });
  } catch (error) {
    for (const [i, openPage] of context.pages().entries()) {
      await openPage
        .screenshot({ path: `test-results/failure-${i}.png`, timeout: 5000 })
        .catch(() => {});
    }
    throw error;
  } finally {
    await context.close();
  }
});

