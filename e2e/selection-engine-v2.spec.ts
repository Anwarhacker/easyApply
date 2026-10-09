import { test, expect, chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";

test("native select uses change events for controlled state and reports rejected values", async () => {
  const browser = await chromium.launch({ executablePath: process.env.APPLYEASE_CHROMIUM ?? (existsSync(".browser/chrome.exe") ? path.resolve(".browser/chrome.exe") : undefined), headless: true });
  try {
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:4174/test-form.html");
    const result = await page.evaluate(async () => {
      const { setNativeSelect } = await import("/src/selection-engine.ts");
      document.body.innerHTML = `<select id="controlled"><option value="">Choose</option><option value="eng">  Software   Engineer </option></select><select id="reject"><option value="">Choose</option><option value="eng">Software Engineer</option></select>`;
      const controlled = document.querySelector<HTMLSelectElement>("#controlled")!;
      let state = "";
      controlled.addEventListener("change", () => { state = controlled.value; controlled.value = state; });
      const accepted = await setNativeSelect(controlled, "eng", 1);
      const rejected = document.querySelector<HTMLSelectElement>("#reject")!;
      rejected.addEventListener("change", () => { rejected.selectedIndex = 0; });
      const refused = await setNativeSelect(rejected, "eng", 1);
      return { accepted, value: controlled.value, text: controlled.selectedOptions[0]?.text.trim(), state, refused, rejectedValue: rejected.value };
    });
    expect(result).toEqual({ accepted: true, value: "eng", text: "Software Engineer", state: "eng", refused: false, rejectedValue: "" });
  } finally { await browser.close(); }
});

test("searchable ARIA combobox selects delayed portal option and verifies the new value", async () => {
  const browser = await chromium.launch({ executablePath: process.env.APPLYEASE_CHROMIUM ?? (existsSync(".browser/chrome.exe") ? path.resolve(".browser/chrome.exe") : undefined), headless: true });
  try {
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:4174/test-form.html");
    const result = await page.evaluate(async () => {
      const { fillCustomDropdown } = await import("/src/dropdown.ts");
      document.body.innerHTML = `<div id="country" data-component="select"><input id="search" role="combobox" aria-autocomplete="list" aria-expanded="false"><span class="selected-value"></span></div>`;
      const root = document.querySelector<HTMLElement>("#country")!;
      const input = document.querySelector<HTMLInputElement>("#search")!;
      input.addEventListener("click", () => { input.setAttribute("aria-expanded", "true"); });
      input.addEventListener("input", () => {
        setTimeout(() => {
          if (document.querySelector("#portal-list")) return;
          const list = document.createElement("div"); list.id = "portal-list"; list.setAttribute("role", "listbox");
          list.innerHTML = `<div role="option" data-value="CA" id="canada">Canada</div>`;
          document.body.append(list);
          list.querySelector<HTMLElement>("#canada")!.addEventListener("click", () => {
            root.setAttribute("data-value", "CA");
            root.querySelector(".selected-value")!.textContent = "Canada";
            list.remove();
          });
        }, 110);
      });
      const filled = await fillCustomDropdown(root, "Canada", "country");
      return { filled, value: root.getAttribute("data-value"), display: root.querySelector(".selected-value")?.textContent, input: input.value };
    });
    expect(result).toEqual({ filled: true, value: "CA", display: "Canada", input: "Canada" });
  } finally { await browser.close(); }
});

test("custom selection rejects ambiguity and aria-selected without a changed field value", async () => {
  const browser = await chromium.launch({ executablePath: process.env.APPLYEASE_CHROMIUM ?? (existsSync(".browser/chrome.exe") ? path.resolve(".browser/chrome.exe") : undefined), headless: true });
  try {
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:4174/test-form.html");
    const result = await page.evaluate(async () => {
      const { fillCustomDropdown } = await import("/src/dropdown.ts");
      document.body.innerHTML = `<button id="ambiguous" role="combobox" aria-expanded="false">Choose</button><button id="rejected" role="combobox" aria-expanded="false">Choose</button>`;
      const ambiguous = document.querySelector<HTMLButtonElement>("#ambiguous")!;
      ambiguous.addEventListener("click", () => {
        if (document.querySelector("#ambiguous-list")) return;
        const list = document.createElement("div"); list.id = "ambiguous-list"; list.setAttribute("role", "listbox");
        list.innerHTML = `<div role="option">Software Engineer</div><div role="option">Software Tester</div>`;
        document.body.append(list);
      });
      const ambiguousResult = await fillCustomDropdown(ambiguous, "Software");
      const rejected = document.querySelector<HTMLButtonElement>("#rejected")!;
      rejected.addEventListener("click", () => {
        if (document.querySelector("#reject-list")) return;
        const list = document.createElement("div"); list.id = "reject-list"; list.setAttribute("role", "listbox");
        list.innerHTML = `<div role="option" id="reject-option">Canada</div>`;
        document.body.append(list);
        list.querySelector("#reject-option")!.addEventListener("click", event => (event.currentTarget as HTMLElement).setAttribute("aria-selected", "true"));
      });
      const rejectedResult = await fillCustomDropdown(rejected, "Canada", "country");
      return { ambiguousResult, rejectedResult, rejectedText: rejected.textContent };
    });
    expect(result).toEqual({ ambiguousResult: false, rejectedResult: false, rejectedText: "Choose" });
  } finally { await browser.close(); }
});

test("radio groups resolve associated labels and verify the checked option", async () => {
  const browser = await chromium.launch({ executablePath: process.env.APPLYEASE_CHROMIUM ?? (existsSync(".browser/chrome.exe") ? path.resolve(".browser/chrome.exe") : undefined), headless: true });
  try {
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:4174/test-form.html");
    const result = await page.evaluate(async () => {
      const { radioGroupChoices, matchRadioChoice, selectRadioChoice } = await import("/src/selection-engine.ts");
      document.body.innerHTML = `<fieldset><legend>Authorized to work?</legend><label><input type="radio" name="auth" value="Y"> YES </label><label><input type="radio" name="auth" value="N"> No </label></fieldset>`;
      const radios = [...document.querySelectorAll<HTMLInputElement>('input[name="auth"]')];
      const choices = radioGroupChoices(radios[0]);
      const match = matchRadioChoice("  no ", choices);
      const selected = !!match?.element && selectRadioChoice(match.element);
      return { selected, value: match?.value, checked: radios.map(radio => radio.checked) };
    });
    expect(result).toEqual({ selected: true, value: "N", checked: [false, true] });
  } finally { await browser.close(); }
});

test("ARIA radio selection is scoped to its radiogroup", async () => {
  const browser = await chromium.launch({ executablePath: process.env.APPLYEASE_CHROMIUM ?? (existsSync(".browser/chrome.exe") ? path.resolve(".browser/chrome.exe") : undefined), headless: true });
  try {
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:4174/test-form.html");
    const result = await page.evaluate(async () => {
      const { radioGroupChoices, matchRadioChoice, selectRadioChoice } = await import("/src/selection-engine.ts");
      document.body.innerHTML = `<div role="radiogroup" aria-label="Currently employed?"><div id="yes" role="radio" aria-checked="false">Yes</div><div id="no" role="radio" aria-checked="false">No</div></div>
        <div role="radiogroup" aria-label="Willing to relocate?"><div id="other-no" role="radio" aria-checked="false">No</div></div>`;
      const group = document.querySelector<HTMLElement>("#yes")!;
      const no = document.querySelector<HTMLElement>("#no")!;
      const otherNo = document.querySelector<HTMLElement>("#other-no")!;
      const peers = radioGroupChoices(group);
      const selected = matchRadioChoice("No", peers);
      no.addEventListener("click", () => no.setAttribute("aria-checked", "true"));
      const accepted = !!selected?.element && selectRadioChoice(selected.element);
      return { count: peers.length, selectedIsLocal: selected?.element === no, accepted, ownChecked: no.getAttribute("aria-checked"), otherChecked: otherNo.getAttribute("aria-checked") };
    });
    expect(result).toEqual({ count: 2, selectedIsLocal: true, accepted: true, ownChecked: "true", otherChecked: "false" });
  } finally { await browser.close(); }
});
