import { describe, it, expect } from "vitest";
import { isNextStepLabel, countNewFields, navigationLabel } from "./step-monitor";
describe("step detection", () => {
  it("uses visible button wording before an internal value code", () => {
    const button = {tagName:"BUTTON", textContent:"Next", getAttribute:(key:string) => key === "value" ? "wizard_step_2" : null} as unknown as Element;
    expect(navigationLabel(button)).toBe("Next");
    expect(navigationLabel({...button, tagName:"INPUT", getAttribute:(key:string) => key === "value" ? "Continue" : null} as unknown as Element)).toBe("Continue");
  });
  it.each(["Next", "Next step →", "Continue", "Save & Continue", "Continue to education"])("recognizes %s", text => expect(isNextStepLabel(text)).toBe(true));
  it.each(["Submit application", "Back", "Continue with Google", "Next job", "Save", "Apply now"])("does not treat %s as a step", text => expect(isNextStepLabel(text)).toBe(false));
  it("ignores unchanged fields and counts duplicate newly visible fields correctly", () => {
    expect(countNewFields(["email", "phone"], ["email", "phone"])).toBe(0);
    expect(countNewFields(["email"], ["email", "email", "college"])).toBe(2);
    expect(countNewFields(["email", "phone"], [])).toBe(0);
  });
});
