import { test, expect, chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";

test("custom dropdowns preserve native indices and select only owned, accepted options", async () => {
  const browser = await chromium.launch({ executablePath: process.env.APPLYEASE_CHROMIUM ?? (existsSync(".browser/chrome.exe") ? path.resolve(".browser/chrome.exe") : undefined), headless: true });
  try {
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:4174/test-form.html");
    const result = await page.evaluate(async () => {
      const moduleUrl = "/src/dropdown.ts";
      const { fillCustomDropdown } = await import(moduleUrl);
      document.body.innerHTML = `<div id="native"><select><option disabled selected value="">Select</option><optgroup disabled><option value="bad">Bengaluru</option></optgroup><option value="good">Bengaluru</option></select></div>
        <div id="unknown"><select><option value="">Select</option><option value="x">Java</option></select></div>
        <div id="custom" role="combobox" aria-controls="owned">Select</div>
        <div role="listbox"><div role="option" id="unrelated">Bengaluru</div></div>
        <div id="error">Please select a city</div>`;
      const native = document.querySelector<HTMLElement>("#native")!;
      const nativeOK = await fillCustomDropdown(native, "Bengaluru", "city");
      const selected = native.querySelector("select")!.value;
      const noMatch = await fillCustomDropdown(document.querySelector("#unknown"), "Python");
      let unrelatedClicks = 0;
      document.querySelector("#unrelated")!.addEventListener("click", () => unrelatedClicks++);
      const custom = document.querySelector<HTMLElement>("#custom")!;
      const missing = await fillCustomDropdown(custom, "Bengaluru", "city");
      custom.addEventListener("click", () => {
        setTimeout(() => {
          if (document.getElementById("owned")) return;
          const list = document.createElement("div"); list.id = "owned"; list.setAttribute("role", "listbox");
          list.innerHTML = '<div role="option" aria-disabled="true">Bengaluru</div><div role="option" data-value="BLR" id="right">Bengaluru</div>';
          document.body.append(list);
          list.querySelector("#right")!.addEventListener("click", () => { custom.setAttribute("data-value", "BLR"); custom.textContent = "Bengaluru"; list.remove(); });
        }, 80);
      });
      const accepted = await fillCustomDropdown(custom, "Bengaluru", "city");
      return { nativeOK, selected, noMatch, missing, unrelatedClicks, accepted, value: custom.getAttribute("data-value"), errorVisible: (document.querySelector("#error") as HTMLElement).style.display !== "none" };
    });
    expect(result).toEqual({ nativeOK: true, selected: "good", noMatch: false, missing: false, unrelatedClicks: 0, accepted: true, value: "BLR", errorVisible: true });
  } finally { await browser.close(); }
});
