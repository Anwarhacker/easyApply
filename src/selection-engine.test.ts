import { describe, expect, it } from "vitest";
import { matchRadioChoice, optionMatchesAnswer } from "./selection-engine";
import { verifyDropdownSelection } from "./dropdown-state";

describe("selection engine option resolution", () => {
  it("matches radio values and normalized labels", () => {
    const choices = [
      { value: "Y", text: "YES", element: "yes" },
      { value: "N", text: "No", element: "no" },
    ];
    expect(matchRadioChoice("Yes", choices)?.element).toBe("yes");
    expect(matchRadioChoice("  nO  ", choices)?.element).toBe("no");
  });

  it("rejects ambiguous radio labels and never uses disabled choices", () => {
    expect(matchRadioChoice("Other", [
      { value: "x", text: "Other", element: 1 },
      { value: "y", text: "Other", element: 2 },
    ])).toBeNull();
    expect(matchRadioChoice("Yes", [
      { value: "Y", text: "Yes", element: 1, disabled: true },
    ])).toBeNull();
  });

  it("checks a selected option against the requested answer", () => {
    expect(optionMatchesAnswer("Bachelor of Technology", { value: "ug", text: "Bachelor of Technology" }, "degree")).toBe(true);
    expect(optionMatchesAnswer("Male", { value: "F", text: "Female" }, "gender")).toBe(false);
  });
});

describe("dropdown state verification", () => {
  it("accepts a changed form-facing value and ignores active or selected-option hints by themselves", () => {
    const before = { value: "", text: "Choose", selected: "", activeOption: "" };
    expect(verifyDropdownSelection(before, { value: "IN", text: "India", selected: "", activeOption: "" }, ["India", "IN"])).toBe(true);
    expect(verifyDropdownSelection(before, { ...before, activeOption: "india-option" }, "India")).toBe(false);
    expect(verifyDropdownSelection(before, { ...before, selected: "india-option" }, "India")).toBe(false);
  });

});
