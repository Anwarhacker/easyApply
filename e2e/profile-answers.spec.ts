import { test, expect, chromium } from "@playwright/test";
import path from "node:path";
import { existsSync } from "node:fs";
import { blankProfile } from "../src/model";

test("profile answers save independently, preserve failed drafts and never reuse standalone data", async () => {
  const extension = path.resolve(process.env.EASYAPPLY_EXTENSION_PATH || "dist");
  const context = await chromium.launchPersistentContext(path.resolve(".test-browser-profiles/answers-" + Date.now()), {
    channel: "chromium", executablePath: process.env.APPLYEASE_CHROMIUM ?? (existsSync(".browser/chrome.exe") ? path.resolve(".browser/chrome.exe") : undefined),
    headless: true, ignoreDefaultArgs: ["--disable-extensions"],
    viewport: { width: 1100, height: 900 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  context.setDefaultTimeout(10000);
  try {
    const manager=await context.newPage();
    await manager.goto("chrome://extensions");
    const card=manager.locator("extensions-item").filter({hasText:"easyApply"});
    await expect(card).toBeVisible();
    const id=await card.getAttribute("id");
    const page=await context.newPage();
    await page.goto(`chrome-extension://${id}/index.html`);
    const first=blankProfile("Frontend");
    const second=blankProfile("Backend");
    await page.evaluate(async profiles => {
      await chrome.storage.local.set({profiles,activeProfileId:profiles[0].id,standaloneAboutYou:"Legacy answer from a different profile", "onboarding:v2":{done:true,step:0}});
    },[first,second]);
    await page.reload();
    const about=page.locator(".about-you-section");
    const why=page.locator(".why-hire-section");
    await about.getByRole("button",{name:/About you Add your answer/}).click();
    await expect(about.getByRole("textbox")).toHaveValue("");
    await about.getByRole("textbox").fill("I build accessible React interfaces.");
    await expect(about).toContainText("Unsaved changes");
    await about.getByRole("button",{name:"Save to profile",exact:true}).click();
    await expect(about.getByRole("status")).toContainText("saved to this profile");
    await why.getByRole("button",{name:/Why hire you Add your answer/}).click();
    await expect(why.getByRole("textbox")).toHaveValue("");
    await why.getByRole("textbox").fill("My React project demonstrates accessible form design.");
    await why.getByRole("button",{name:"Save to profile",exact:true}).click();
    await expect(why.getByRole("status")).toContainText("saved to this profile");
    await page.reload();
    await why.getByRole("button",{name:/Why hire you Saved answer/}).click();
    await expect(why.getByRole("textbox")).toHaveValue("My React project demonstrates accessible form design.");
    await why.getByRole("textbox").fill("Unsaved change");
    await why.getByRole("button",{name:"Discard changes",exact:true}).click();
    await expect(why.getByRole("textbox")).toHaveValue("My React project demonstrates accessible form design.");
    await page.getByLabel("Active profile").selectOption(second.id);
    await about.getByRole("button",{name:/About you Add your answer/}).click();
    await expect(about.getByRole("textbox")).toHaveValue("");
    await about.getByRole("textbox").fill("My new backend summary.");
    await page.evaluate(() => { chrome.storage.local.set = async () => { throw new Error("Synthetic storage failure"); }; });
    await about.getByRole("button",{name:"Save to profile",exact:true}).click();
    await expect(about.getByRole("alert")).toContainText("Could not save");
    await expect(about.getByRole("textbox")).toHaveValue("My new backend summary.");
    await expect(about).toContainText("Unsaved changes");
    await page.reload();
    await expect(page.getByLabel("Active profile")).toHaveValue(second.id);
    await about.getByRole("button",{name:/About you Add your answer/}).click();
    await expect(about.getByRole("textbox")).toHaveValue("");
  } finally { await context.close(); }
});
