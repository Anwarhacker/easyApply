import { test, expect, chromium } from "@playwright/test";
import path from "node:path";
import { cp, readFile, writeFile, appendFile, readdir } from "node:fs/promises";
import { blankProfile } from "../src/model";
test("AI drafts, provider boundary and changed-field protection", async () => {
  const root = path.resolve(".test-browser-profiles/ai-" + Date.now());
  const extension = path.join(root, "extension");
  await cp(path.resolve(process.env.EASYAPPLY_EXTENSION_PATH || "dist"), extension, { recursive: true });
  // Permission and synthetic provider exist only in the disposable test build.
  const manifest = JSON.parse(
    await readFile(path.join(extension, "manifest.json"), "utf8"),
  );
  manifest.host_permissions.push("https://api.groq.com/*");
  await writeFile(
    path.join(extension, "manifest.json"),
    JSON.stringify(manifest),
  );
  const moduleFile = (await readdir(path.join(extension, "assets"))).find(
    (f) => f.startsWith("background.ts-") && f.endsWith(".js"),
  );
  await appendFile(
    path.join(extension, "service-worker-loader.js"),
    `\nimport { activatePage } from './assets/${moduleFile}'; globalThis.qaActivatePage = activatePage;\nglobalThis.fetch = async (_url, init) => { const body = JSON.parse(init.body); const input = JSON.parse(body.messages[1].content); return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({answers:input.questions.map(q=>({id:q.id,text:input.revision?.guidance === 'Return long test' ? 'word '.repeat(160) : input.revision ? 'My TypeScript project is relevant to this role.' : 'I bring TypeScript skills to this role.',missingFacts:[]}))})}}]}), {status:200}); };`,
  );
  const context = await chromium.launchPersistentContext(
    path.join(root, "browser"),
    {
      executablePath: path.resolve(".browser/chrome.exe"),
      channel: "chromium",
      timeout: 20000,
      headless: true,
      ignoreDefaultArgs: ["--disable-extensions"],
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
      ],
    },
  );
  try {
    context.setDefaultTimeout(10000);
    const manager = await context.newPage();
    await manager.goto("chrome://extensions");
    const card = manager
      .locator("extensions-item")
      .filter({ hasText: "easyApply" });
    await expect(card).toBeVisible();
    const id = await card.getAttribute("id");
    const ui = await context.newPage();
    await ui.goto(`chrome-extension://${id}/settings.html`);
    const profile = blankProfile("Software engineer");
    profile.values.skills = "TypeScript";
    await ui.evaluate(async (profile) => {
      await chrome.storage.local.set({
        profiles: [profile],
        activeProfileId: profile.id,
        "onboarding:v2": { done: true, step: 0 },
      });
      await chrome.runtime.sendMessage({
        type: "ai-config-save",
        key: "gsk_synthetic_key_for_tests_only",
        consent: true,
      });
    }, profile);
    const persistenceCheck = await ui.evaluate(async () => {
      const synthetic = "gsk_synthetic_key_for_tests_only";
      const enabled = await chrome.runtime.sendMessage({
        type: "ai-config-persistence",
        persistent: true,
      });
      if (enabled.error) throw Error(enabled.error);
      const stored = await chrome.storage.local.get(
        "easyapply.ai.encrypted-key",
      );
      await chrome.storage.session.clear();
      const restored = await chrome.runtime.sendMessage({
        type: "ai-config-get",
      });
      const session = await chrome.storage.session.get("easyapply.ai.session");
      await chrome.runtime.sendMessage({
        type: "ai-config-persistence",
        persistent: false,
      });
      const removed = await chrome.storage.local.get(
        "easyapply.ai.encrypted-key",
      );
      return {
        persistent: restored.persistent,
        restored: session["easyapply.ai.session"]?.key === synthetic,
        plaintext: JSON.stringify(stored).includes(synthetic),
        version: stored["easyapply.ai.encrypted-key"]?.version,
        removed: !removed["easyapply.ai.encrypted-key"],
      };
    });
    expect(persistenceCheck).toEqual({
      persistent: true,
      restored: true,
      plaintext: false,
      version: 1,
      removed: true,
    });
    await ui.reload();
    await ui.getByRole("button", { name: "Expand all sections", exact: true }).click();
    await ui.getByRole("button", { name: "AI answers", exact: true }).click();
    await ui.getByText("Enable / manage AI", { exact: true }).click();
    const rememberKey = ui.getByRole("checkbox", { name: /Keep API key across browser restarts/ });
    await expect(rememberKey).not.toBeChecked();
    // Saving this setting is asynchronous; assert after storage responds.
    await rememberKey.click();
    await expect(rememberKey).toBeChecked();
    await rememberKey.click();
    await expect(rememberKey).not.toBeChecked();
    await ui.getByText("Enable / manage AI", { exact: true }).click();
    await ui
      .getByRole("button", { name: "Generate drafts", exact: true })
      .click();
    await expect(
      ui.getByRole("status").filter({ hasText: "Drafts ready" }),
    ).toBeVisible();
    expect(
      await ui
        .locator("textarea")
        .filter({ hasText: "I bring TypeScript" })
        .count(),
    ).toBe(4);
    const hireCard = ui.getByRole("article", {
      name: "Why should we hire you?",
      exact: true,
    });
    const roleDraft = ui.getByLabel("Draft for Why this role?", {
      exact: true,
    });
    await roleDraft.fill("My manually edited role answer.");
    await hireCard
      .getByLabel("Writing preference (optional)")
      .fill("Emphasize my project");
    await hireCard
      .getByRole("button", { name: "Regenerate", exact: true })
      .click();
    await expect(
      hireCard.getByRole("textbox", {
        name: "Draft for Why should we hire you?",
      }),
    ).toHaveValue("My TypeScript project is relevant to this role.");
    await expect(roleDraft).toHaveValue("My manually edited role answer.");
    await hireCard
      .getByLabel("Writing preference (optional)")
      .fill("Return long test");
    await hireCard
      .getByRole("button", { name: "Regenerate", exact: true })
      .click();
    await expect(
      hireCard.getByRole("button", { name: "Shorten answer", exact: true }),
    ).toBeVisible();
    await expect(roleDraft).toHaveValue("My manually edited role answer.");
    await hireCard
      .getByRole("button", { name: "Shorten answer", exact: true })
      .click();
    await expect(
      hireCard.getByRole("textbox", {
        name: "Draft for Why should we hire you?",
      }),
    ).toHaveValue("My TypeScript project is relevant to this role.");
    await hireCard.scrollIntoViewIfNeeded();
    await ui.screenshot({ path: "test-results/ai-answers.png" });
    const worker = context
      .serviceWorkers()
      .find((w) => new URL(w.url()).host === id)!;
    const site = await context.newPage();
    await site.goto("http://127.0.0.1:4174/test-form.html?ai-test");
    await site.evaluate(() => {
      document.body.innerHTML =
        '<label>Why should we hire you?<textarea id="hire"></textarea></label><label>Cover letter<textarea id="cover"></textarea></label><label>Why this role? Include your salary<textarea id="protected"></textarea></label>';
    });
    const tabId = await worker.evaluate(async () => {
      const tab = (await chrome.tabs.query({})).find((t) =>
        t.url?.includes("?ai-test"),
      )!;
      await (
        globalThis as unknown as {
          qaActivatePage: (
            action: string,
            tab: chrome.tabs.Tab,
          ) => Promise<void>;
        }
      ).qaActivatePage("open", tab);
      return tab.id!;
    });
    const scan = await worker.evaluate(
      (id) => chrome.tabs.sendMessage(id, { type: "ai-scan" }),
      tabId,
    );
    expect(scan.questions).toHaveLength(2);
    await site.locator("#hire").fill("My manual answer");
    const result = await worker.evaluate(
      async ({ id, token, questions }) =>
        chrome.tabs.sendMessage(id, {
          type: "ai-fill",
          token,
          answers: questions.map((q: { id: string }) => ({
            id: q.id,
            text: "I bring TypeScript skills.",
          })),
        }),
      { id: tabId, ...scan },
    );
    expect(result.filled).toBe(1);
    expect(result.errors).toHaveLength(1);
    await expect(site.locator("#hire")).toHaveValue("My manual answer");
    await expect(site.locator("#cover")).toHaveValue(
      "I bring TypeScript skills.",
    );
    await expect(site.locator("#protected")).toHaveValue("");
    const replay = await worker.evaluate(
      ({ id, token, questions }) =>
        chrome.tabs.sendMessage(id, {
          type: "ai-fill",
          token,
          answers: [{ id: questions[0].id, text: "replay" }],
        }),
      { id: tabId, ...scan },
    );
    expect(replay.error).toContain("expired");
    // Keep the website active while exercising the popup-equivalent UI actions.
    await site.locator("#cover").fill("");
    await site.bringToFront();
    await ui.evaluate(() =>
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent === "Detect page questions")!
        .click(),
    );
    await expect(
      ui.getByRole("status").filter({ hasText: "Detected 1 empty questions" }),
    ).toBeVisible();
    await ui.evaluate(() =>
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent === "Generate & fill")!
        .click(),
    );
    await expect(site.locator("#cover")).toHaveValue(
      "I bring TypeScript skills to this role.",
    );
    await expect(site.locator("#hire")).toHaveValue("My manual answer");
    await ui.evaluate(async (profileId) => {
      await chrome.runtime.sendMessage({
        type: "save-stored-resume",
        profileId,
        item: {
          name: "saved-resume.pdf",
          type: "application/pdf",
          size: 9,
          dataBase64: "data:application/pdf;base64,JVBERi0xLjQK",
          updatedAt: new Date().toISOString(),
        },
      });
    }, profile.id);
    await site.evaluate(() => {
      const wrapper = document.createElement("div");
      wrapper.innerHTML =
        '<section><h3>Resume</h3><div><button type="button">Upload File</button><div><input style="display:none" type="file" id="sTest-uploadFile-sTest-candidateResume" accept=".docx, .rtf, .doc, .pdf"></div></div></section><label>Photo<input type="file" id="photo-auto" accept="image/*"></label>';
      document.body.append(wrapper);
    });
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/index.html`);
    await expect(
      popup.getByRole("button", { name: "Scan application form", exact: true }),
    ).toBeEnabled();
    await site.locator("#cover").fill("");
    await site.bringToFront();
    await popup.evaluate(() =>
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent?.trim() === "Scan application form")!
        .click(),
    );
    await expect(popup.getByRole("status").filter({ hasText: "AI filled" })).toContainText(
      "AI filled 1 of 1 questions",
    );
    await expect(site.locator("#hire")).toHaveValue("My manual answer");
    await expect(site.locator("#protected")).toHaveValue("");
    expect(
      await site
        .locator("#sTest-uploadFile-sTest-candidateResume")
        .evaluate((el: HTMLInputElement) => el.files?.[0]?.name),
    ).toBe("saved-resume.pdf");
    expect(
      await site
        .locator("#photo-auto")
        .evaluate((el: HTMLInputElement) => el.files?.length),
    ).toBe(0);
    const list = popup.getByRole("region", { name: "Scanned AI fields" });
    await expect(list).toBeVisible();
    await list.getByRole("button", { name: /Regenerate/ }).click();
    await expect(site.locator("#cover")).toHaveValue(
      "My TypeScript project is relevant to this role.",
    );
    await expect(site.locator("#hire")).toHaveValue("My manual answer");
    await site.locator("#cover").fill("My edited cover letter");
    await list.getByRole("button", { name: /Regenerate/ }).click();
    await expect(popup.getByRole("alert")).toContainText(
      "Your current answer was preserved",
    );
    await expect(site.locator("#cover")).toHaveValue("My edited cover letter");
    await popup.setViewportSize({ width: 480, height: 600 });
    await popup.evaluate(() => window.scrollTo(0, 0));
    await popup.evaluate(() => window.scrollTo(0, 0));
    expect(
      await popup.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await popup.screenshot({ path: "test-results/popup-layout.png" });
    await list.scrollIntoViewIfNeeded();
    await popup.screenshot({ path: "test-results/scan-ai-fields.png" });
    await popup
      .getByLabel("Generate and fill AI questions during scan")
      .uncheck();
    await site.locator("#cover").fill("");
    await site.bringToFront();
    await popup.evaluate(() =>
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent?.trim() === "Scan application form")!
        .click(),
    );
    await expect(
      popup.getByRole("button", { name: "Scan application form", exact: true }),
    ).toBeEnabled();
    await expect(site.locator("#cover")).toHaveValue("");
    await site.evaluate(() => {
      document.body.innerHTML =
        '<div class="form-row"><label>Country calling code<select id="prefix"><option value="">Choose</option><option value="124">Other (+124)</option><option value="IN">India (+91)</option><option value="US">United States (+1)</option><option value="GB">United Kingdom (+44)</option></select></label><label>Mobile number<input id="national" type="tel" maxlength="10"></label></div><div><label>Phone number<input id="whole" type="tel"></label></div>';
    });
    const phoneScan = await worker.evaluate(
      (id) =>
        chrome.tabs.sendMessage(id, {
          type: "detect",
          values: { mobile: "+12025550123" },
        }),
      tabId,
    );
    await worker.evaluate(
      ({ id, scan }) =>
        chrome.tabs.sendMessage(id, {
          type: "fill",
          scanId: scan.scanId,
          confirmSensitive: false,
          matches: scan.matches,
        }),
      { id: tabId, scan: phoneScan },
    );
    await expect(site.locator("#prefix")).toHaveValue("US");
    await expect(site.locator("#national")).toHaveValue("2025550123");
    await expect(site.locator("#whole")).toHaveValue("+12025550123");
    await site.locator("#national").fill("");
    const stalePhone = await worker.evaluate(
      (id) =>
        chrome.tabs.sendMessage(id, {
          type: "detect",
          values: { mobile: "+919876543210" },
        }),
      tabId,
    );
    await site.locator("#prefix").selectOption("GB");
    const blocked = await worker.evaluate(
      ({ id, scan }) =>
        chrome.tabs.sendMessage(id, {
          type: "fill",
          scanId: scan.scanId,
          confirmSensitive: false,
          matches: scan.matches,
        }),
      { id: tabId, scan: stalePhone },
    );
    expect(blocked.errors.join(" ")).toContain("calling-code selector changed");
    await expect(site.locator("#national")).toHaveValue("");
    await expect(site.locator("#prefix")).toHaveValue("GB");
    await site.evaluate(() => {
      document.body.innerHTML = `<fieldset><legend>Date of birth</legend>
        <label>Day<input id="dob-day" type="number"></label>
        <label>Month<select id="dob-month"><option value="" disabled selected>Choose</option>${["January","February","March","April","May","June","July","August","September","October","November","December"].map((m,i) => `<option value="${i}">${m}</option>`).join("")}</select></label>
        <label>Year<input id="dob-year" type="number"></label></fieldset>
        <label>Date of birth<input id="dob-text" placeholder="DD-Mon-YYYY" inputmode="numeric"></label>
        <label>Date of birth<input id="dob-native" type="date"></label>
        <label>Current age<input id="age" type="number"></label>
        <label>Age over 18<input id="eligibility"></label>
        <label>Date of birth<input id="locked" readonly></label>
        <label>Date of birth<input id="picker" class="flatpickr-input" readonly></label>`;
      const input = document.querySelector<HTMLInputElement>("#picker")!;
      Object.assign(input, { _flatpickr: { config: {}, selectedDates: [] as Date[], setDate(date: Date) { this.selectedDates = [date]; input.value = "15-Aug-2000"; } } });
    });
    const dobScan = await worker.evaluate(id => chrome.tabs.sendMessage(id, {type:"detect", values:{dob:"2000-08-15"}}), tabId);
    const dobFill = await worker.evaluate(({id, scan}) => chrome.tabs.sendMessage(id, {type:"fill", scanId:scan.scanId, confirmSensitive:false, matches:scan.matches}), {id:tabId, scan:dobScan});
    expect(dobFill.errors).toEqual([]);
    await expect(site.locator("#dob-day")).toHaveValue("15");
    await expect(site.locator("#dob-month")).toHaveValue("7");
    await expect(site.locator("#dob-year")).toHaveValue("2000");
    await expect(site.locator("#dob-text")).toHaveValue("15-Aug-2000");
    await expect(site.locator("#dob-native")).toHaveValue("2000-08-15");
    const today = new Date();
    const age = today.getFullYear() - 2000 - (today.getMonth() < 7 || (today.getMonth() === 7 && today.getDate() < 15) ? 1 : 0);
    await expect(site.locator("#age")).toHaveValue(String(age));
    await expect(site.locator("#locked")).toHaveValue("");
    await expect(site.locator("#eligibility")).toHaveValue("");
    await expect(site.locator("#picker")).toHaveValue("15-Aug-2000");
    // A picker-shaped input without a live library must not report a successful fill.
    await site.evaluate(() => {
      document.body.innerHTML = '<label>Date of birth<input id="unsupported-picker" class="flatpickr-input" readonly></label><label>Birth date<input id="jquery-picker" class="hasDatepicker" readonly></label>';
      let selected: Date | null = null;
      Object.assign(window, { jQuery: (input: HTMLInputElement) => ({ datepicker(command: string, date?: Date) {
        if (command === "option") return {};
        if (command === "setDate") { selected = date!; input.value = "08/15/2000"; }
        if (command === "getDate") return selected;
      } }) });
    });
    const pickerScan = await worker.evaluate(id => chrome.tabs.sendMessage(id, {type:"detect", values:{dob:"2000-08-15"}}), tabId);
    const pickerFill = await worker.evaluate(({id,scan}) => chrome.tabs.sendMessage(id,{type:"fill",scanId:scan.scanId,confirmSensitive:false,matches:scan.matches}),{id:tabId,scan:pickerScan});
    expect(pickerFill.errors.join(" ")).toContain("calendar requires manual selection");
    await expect(site.locator("#unsupported-picker")).toHaveValue("");
    await expect(site.locator("#jquery-picker")).toHaveValue("08/15/2000");
    await ui.goto(`chrome-extension://${id}/settings.html#profiles`);
    await ui.reload();
    await ui.getByRole("button", { name: "Expand all sections", exact: true }).click();
    await ui.getByRole("button", { name: "Expand all sections", exact: true }).click();
    const optIn = ui.getByRole("checkbox", {name:"Enable user-approved disclosure defaults for this profile"});
    await expect(optIn).not.toBeChecked();
    await expect(ui.locator("#profile-veteranStatus")).toBeDisabled();
    await optIn.check();
    await ui.locator("#profile-voluntaryGender").selectOption("I do not wish to self-identify");
    await ui.locator("#profile-raceEthnicity").selectOption("I do not wish to self-identify");
    await ui.locator("#profile-veteranStatus").selectOption("I am not a protected veteran");
    await ui.locator("#profile-disabilityStatus").selectOption("I do not wish to self-identify");
    await ui.getByRole("button",{name:"Save profile",exact:true}).click();
    await expect(ui.getByRole("button",{name:"Save profile",exact:true})).toBeEnabled();
    await ui.reload();
    await ui.getByRole("button", { name: "Expand all sections", exact: true }).click();
    await expect(optIn).toBeChecked();
    const disclosureValues = await ui.evaluate(async () => (await chrome.storage.local.get("profiles")).profiles[0].values);
    await site.evaluate(() => {
      document.body.innerHTML = `<label>Gender<select id="eeo-gender"><option value="">Select</option><option value="F">Female</option><option value="D">Prefer not to say</option></select></label>
      <label>Race/ethnicity<select id="eeo-race"><option value="">Select</option><option value="D">Decline to answer</option></select></label>
      <fieldset><legend>Protected veteran status</legend><label><input type="radio" name="veteran" id="v-yes" value="1">I am a protected veteran</label><label><input type="radio" name="veteran" id="v-no" value="0">I am not a protected veteran</label></fieldset>
      <label>Disability status<select id="eeo-disability"><option value="">Select</option><option value="D">I do not want to answer</option></select></label>
      <label>Disability status<select id="existing-disability"><option value="">Select</option><option value="manual" selected>My existing answer</option><option value="D">Prefer not to answer</option></select></label>`;
    });
    const eeoScan = await worker.evaluate(({id,values}) => chrome.tabs.sendMessage(id,{type:"detect",values}),{id:tabId,values:disclosureValues});
    await worker.evaluate(({id,scan}) => chrome.tabs.sendMessage(id,{type:"fill",scanId:scan.scanId,confirmSensitive:false,matches:scan.matches}),{id:tabId,scan:eeoScan});
    await expect(site.locator("#eeo-gender")).toHaveValue("D");
    await expect(site.locator("#eeo-race")).toHaveValue("D");
    await expect(site.locator("#v-no")).toBeChecked();
    await expect(site.locator("#v-yes")).not.toBeChecked();
    await expect(site.locator("#eeo-disability")).toHaveValue("D");
    await expect(site.locator("#existing-disability")).toHaveValue("manual");
    // Manual radio changes made after scanning must win.
    await site.locator("#v-no").evaluate((el: HTMLInputElement) => {el.checked = false;});
    const staleEEO = await worker.evaluate(({id,values}) => chrome.tabs.sendMessage(id,{type:"detect",values}),{id:tabId,values:disclosureValues});
    await site.locator("#v-yes").check();
    await worker.evaluate(({id,scan}) => chrome.tabs.sendMessage(id,{type:"fill",scanId:scan.scanId,confirmSensitive:false,matches:scan.matches}),{id:tabId,scan:staleEEO});
    await expect(site.locator("#v-yes")).toBeChecked();
    await optIn.uncheck();
    await ui.getByRole("button",{name:"Save profile",exact:true}).click();
    await expect(ui.getByRole("button",{name:"Save profile",exact:true})).toBeEnabled();
    await ui.reload();
    await ui.getByRole("button", { name: "Expand all sections", exact: true }).click();
    await expect(optIn).not.toBeChecked();
    await expect(ui.locator("#profile-veteranStatus")).toHaveValue("I am not a protected veteran");
    await site.locator("#eeo-gender").selectOption("");
    const offValues = await ui.evaluate(async () => (await chrome.storage.local.get("profiles")).profiles[0].values);
    const offScan = await worker.evaluate(({id,values}) => chrome.tabs.sendMessage(id,{type:"detect",values}),{id:tabId,values:offValues});
    expect(offScan.matches.filter((m: {field:string;value:string}) => ["gender","raceEthnicity","veteranStatus","disabilityStatus"].includes(m.field)).every((m: {value:string;selected:boolean}) => !m.value && !m.selected)).toBe(true);
    await site.evaluate(() => {
      document.body.innerHTML = '<form id="memory-form"><label>How did you hear about this position?<input id="referral"></label><button type="submit">Submit application</button></form>';
      document.querySelector("form")!.addEventListener("submit", e => e.preventDefault());
    });
    await site.locator("#referral").fill("Company website");
    await site.getByRole("button",{name:"Submit application",exact:true}).click();
    const memoryToast = site.locator("#easyapply-memory-host");
    await expect(memoryToast).toContainText("How did you hear about this position?");
    // Nothing is permanently saved until the user clicks Save.
    expect(await ui.evaluate(async () => (await chrome.storage.local.get("profiles")).profiles[0].customFieldAnswers)).toBeUndefined();
    await memoryToast.getByRole("button",{name:"Save",exact:true}).click();
    await expect(memoryToast).toHaveCount(0);
    const remembered = await ui.evaluate(async () => (await chrome.storage.local.get("profiles")).profiles[0]);
    expect(remembered.customFieldAnswers["How did you hear about this position?"]).toBe("Company website");
    await site.evaluate(() => {document.body.innerHTML = '<label>HOW DID YOU HEAR ABOUT THIS POSITION<input id="next-referral"></label><label>How did you hear about this other position?<input id="different-referral"></label>';});
    const memoryScan = await worker.evaluate(({id,profile}) => chrome.tabs.sendMessage(id,{type:"detect",profileId:profile.id,values:profile.values,customFieldAnswers:profile.customFieldAnswers}),{id:tabId,profile:remembered});
    expect(memoryScan.matches.some((m: {remembered:boolean;selected:boolean}) => m.remembered && m.selected)).toBe(true);
    await worker.evaluate(({id,scan}) => chrome.tabs.sendMessage(id,{type:"fill",scanId:scan.scanId,confirmSensitive:false,matches:scan.matches}),{id:tabId,scan:memoryScan});
    await expect(site.locator("#next-referral")).toHaveValue("Company website");
    await expect(site.locator("#different-referral")).toHaveValue("");
    // An existing answer remains untouched, and another profile has no memory.
    const otherMemoryScan = await worker.evaluate(({id,values}) => chrome.tabs.sendMessage(id,{type:"detect",values,customFieldAnswers:{}}),{id:tabId,values:remembered.values});
    expect(otherMemoryScan.matches.every((m: {remembered:boolean}) => !m.remembered)).toBe(true);
    await ui.reload();
    await ui.getByRole("button", { name: "Expand all sections", exact: true }).click();
    const memoryCard = ui.locator("section").filter({has:ui.getByRole("heading",{name:"Remembered field answers",exact:true})});
    await expect(memoryCard.getByRole("textbox", { name: "How did you hear about this position?", exact: true })).toHaveValue("Company website");
    await memoryCard.getByRole("button",{name:"Forget answer"}).click();
    await ui.getByRole("button",{name:"Save profile",exact:true}).click();
    await expect(ui.getByRole("button",{name:"Save profile",exact:true})).toBeEnabled();
    await ui.reload();
    await ui.getByRole("button", { name: "Expand all sections", exact: true }).click();
    await expect(memoryCard).toContainText("No remembered answers yet");
    // Pending suggestions can be dismissed without storing an answer.
    await ui.evaluate(async () => {const {profiles} = await chrome.storage.local.get("profiles"); await chrome.runtime.sendMessage({type:"memory-stage",profileId:profiles[0].id,candidate:{question:"How did you hear about this position?",answer:"Referral"}});});
    await worker.evaluate(({id,profile}) => chrome.tabs.sendMessage(id,{type:"detect",profileId:profile.id,values:profile.values}),{id:tabId,profile:remembered});
    await expect(memoryToast).toContainText("Referral");
    await memoryToast.getByRole("button",{name:"Dismiss",exact:true}).click();
    await expect(memoryToast).toHaveCount(0);
    expect(await ui.evaluate(async () => Object.keys((await chrome.storage.local.get("profiles")).profiles[0].customFieldAnswers ?? {}).length)).toBe(0);
    const corruptCheck = await ui.evaluate(async () => {
      await chrome.runtime.sendMessage({ type: "ai-config-persistence", persistent: true });
      const storage = await chrome.storage.local.get("easyapply.ai.encrypted-key");
      const record = storage["easyapply.ai.encrypted-key"] as { ciphertext: number[] };
      record.ciphertext[0] ^= 1;
      await chrome.storage.local.set({ "easyapply.ai.encrypted-key": record });
      await chrome.storage.session.clear();
      const rejected = await chrome.runtime.sendMessage({ type: "ai-config-get" });
      await chrome.runtime.sendMessage({ type: "ai-config-clear" });
      const cleared = await chrome.runtime.sendMessage({ type: "ai-config-get" });
      return { error: rejected.error, configured: cleared.configured, persistent: cleared.persistent };
    });
    expect(corruptCheck.error).toContain("could not be decrypted");
    expect(corruptCheck.configured).toBe(false);
    expect(corruptCheck.persistent).toBe(false);
  } finally {
    await context.close();
  }
});

