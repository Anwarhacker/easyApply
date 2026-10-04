import {test, expect, chromium} from "@playwright/test";
import path from "node:path";
import {existsSync} from "node:fs";
import {readdir} from "node:fs/promises";
import {blankProfile} from "../src/model";

test("learns new manual answers and reuses them without submitting", async () => {
  const extension = path.resolve(process.env.EASYAPPLY_EXTENSION_PATH || "dist");
  const loader = (await readdir(path.join(extension,"assets"))).find(name => name.startsWith("content.ts-loader-") && name.endsWith(".js"))!;
  const context = await chromium.launchPersistentContext(path.resolve(".test-browser-profiles/learning-" + Date.now()), {
    channel:"chromium", executablePath:process.env.APPLYEASE_CHROMIUM ?? (existsSync(".browser/chrome.exe") ? path.resolve(".browser/chrome.exe") : undefined),
    headless:true, ignoreDefaultArgs:["--disable-extensions"], viewport:{width:1100,height:900},
    args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],
  });
  try {
    const manager = await context.newPage(); await manager.goto("chrome://extensions");
    const card = manager.locator("extensions-item").filter({hasText:"easyApply"}); await expect(card).toBeVisible();
    const id = await card.getAttribute("id");
    const settings = await context.newPage(); await settings.goto(`chrome-extension://${id}/settings.html`);
    const profile = blankProfile("Learning test");
    await settings.evaluate(async profile => { await chrome.storage.local.set({profiles:[profile],activeProfileId:profile.id,"onboarding:v2":{done:true,step:0}}); await chrome.runtime.sendMessage({type:"get-profiles"}); },profile);
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const site = await context.newPage();
    const url = "http://127.0.0.1:4174/test-form.html?learning";
    const activate = async () => worker.evaluate(async ({url,loader}) => {
      const tab = (await chrome.tabs.query({})).find(t => t.url === url)!;
      await chrome.scripting.executeScript({target:{tabId:tab.id!},files:[`assets/${loader}`]});
      for (let attempt = 0; attempt < 30; attempt++) {
        try { if ((await chrome.tabs.sendMessage(tab.id!,{type:"ping"}))?.ready) break; } catch { /* module loader is asynchronous */ }
        await new Promise(resolve => setTimeout(resolve,100));
      }
      const {profiles,activeProfileId} = await chrome.storage.local.get(["profiles","activeProfileId"]);
      const profile = profiles.find((p:{id:string}) => p.id === activeProfileId);
      await chrome.tabs.sendMessage(tab.id!,{type:"detect",profileId:profile.id,values:profile.values,customFieldAnswers:profile.customFieldAnswers});
    },{url,loader});
    // Learn multiple answers as the user leaves fields, without submitting.
    await settings.reload();
    await expect(settings.getByRole("checkbox", {name:"Learn new answers automatically"})).toBeEnabled();
    await settings.getByRole("checkbox", {name:"Learn new answers automatically"}).click();
    await expect(settings.getByRole("checkbox", {name:"Learn new answers automatically"})).toBeChecked();
    await expect(settings.getByRole("checkbox", {name:"Learn new answers automatically"})).toBeEnabled();
    await expect(settings.getByRole("region", {name:"Answer learning"})).toContainText("Learning is on");
    await site.goto(url);
    await activate();
    await site.evaluate(() => {
      document.body.innerHTML = `<form onsubmit="return false">
        <label>Favorite development editor?<input id="learn-editor"></label>
        <label>Preferred collaboration tool?<select id="learn-tool"><option value="">Choose</option><option value="slack-id">Slack</option></select></label>
        <label>What is your API key?<input id="learn-secret"></label>
        <button type="button" id="leave-field">Done</button></form>`;
    });
    await site.locator("#learn-editor").fill("VS Code");
    await site.locator("#learn-tool").focus();
    await site.locator("#learn-tool").press("ArrowDown");
    await site.locator("#learn-tool").press("Tab");
    await site.locator("#learn-secret").fill("sk-private-secret");
    await site.locator("#leave-field").click();
    const learnedAnswers = () => settings.evaluate(async () => {
      const {profiles,activeProfileId} = await chrome.storage.local.get(["profiles","activeProfileId"]);
      return profiles.find((p: {id:string}) => p.id === activeProfileId).customFieldAnswers ?? {};
    });
    await expect.poll(learnedAnswers).toEqual({"Favorite development editor?":"VS Code", "Preferred collaboration tool?":"Slack"});
    await expect(settings.getByRole("region", {name:"Answer learning"})).toContainText("2 remembered answers");
    // A changed answer requires review, even in automatic learning mode.
    await site.locator("#learn-editor").fill("Vim");
    await site.locator("#leave-field").click();
    const memory = site.locator("#easyapply-memory-host");
    await expect(memory).toContainText("Vim");
    expect((await learnedAnswers())["Favorite development editor?"]).toBe("VS Code");
    await memory.getByRole("button",{name:"Dismiss",exact:true}).click();
    // Matching questions reuse saved text and visible dropdown labels on a later page.
    await site.reload();
    await activate();
    await site.evaluate(() => { document.body.innerHTML = `<label>Favorite development editor?<input id="learn-again"></label>
      <label>Preferred collaboration tool?<select id="tool-again"><option value="">Choose</option><option value="different-id">Slack</option></select></label>`; });
    const learnedFill = await worker.evaluate(async url => {
      const tab = (await chrome.tabs.query({})).find(t => t.url === url)!;
      const {profiles,activeProfileId} = await chrome.storage.local.get(["profiles","activeProfileId"]);
      const profile = profiles.find((p:{id:string}) => p.id === activeProfileId);
      const scan = await chrome.tabs.sendMessage(tab.id!, {type:"detect",profileId:profile.id,values:profile.values,customFieldAnswers:profile.customFieldAnswers});
      return chrome.tabs.sendMessage(tab.id!, {type:"fill",scanId:scan.scanId,matches:scan.matches,confirmSensitive:false});
    }, url);
    expect(learnedFill.filled).toBe(2);
    await expect(site.locator("#learn-again")).toHaveValue("VS Code");
    await expect(site.locator("#tool-again")).toHaveValue("different-id");
    await settings.getByRole("checkbox", {name:"Learn new answers automatically"}).uncheck();
    await site.evaluate(() => { document.body.innerHTML = '<label>Favorite testing technique?<input id="learn-off"></label><button id="blur-off" type="button">Done</button>'; });
    await site.locator("#learn-off").fill("Integration tests");
    await site.locator("#blur-off").click();
    await expect(memory).toContainText("Integration tests");
    expect((await learnedAnswers())["Favorite testing technique?"]).toBeUndefined();
    await memory.getByRole("button",{name:"Save",exact:true}).click();
    await expect.poll(async () => (await learnedAnswers())["Favorite testing technique?"]).toBe("Integration tests");
  } catch (error) { for (const page of context.pages()) if (page.url().includes("settings.html")) { console.error(await page.locator(".learning-settings").allTextContents()); await page.screenshot({path:"test-results/learning-failure.png"}); } throw error;
  } finally { await context.close(); }
});
