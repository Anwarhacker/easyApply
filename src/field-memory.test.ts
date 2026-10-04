import { expect, it } from "vitest";
import { questionKey, safeMemoryQuestion, rememberedAnswer, customFieldAnswersSchema, mergeRememberedAnswers } from "./field-memory";
import { blankProfile, profileSchema } from "./model";
it("normalizes typography without losing conditions or negation", () => {
  expect(questionKey(" How did you hear about us? ")).toBe("how did you hear about us");
  const saved = {"Are you willing to work hybrid in Austin, TX?":"Yes"};
  expect(rememberedAnswer("Are you willing to work hybrid in Austin, TX", saved)).toBe("Yes");
  expect(rememberedAnswer("Are you willing to work hybrid in Boston, MA?", saved)).toBe("");
  expect(rememberedAnswer("Are you not willing to work hybrid in Austin, TX?", saved)).toBe("");
});
it.each(["What is your password?", "What is your national ID?", "Do you have a disability?", "What is your race?", "Do you need visa sponsorship?", "Do you agree to the terms?", "What is your date of birth?", "What is your API key?", "What is your notice period?"])("does not learn protected or already matched question %s", question => expect(safeMemoryQuestion(question)).toBe(false));
it("accepts ordinary bespoke answers and validates profile storage", () => {
  const profile = blankProfile();
  expect(profileSchema.safeParse(profile).success).toBe(true);
  profile.customFieldAnswers = {"How did you hear about this position?":"Company website"};
  expect(profileSchema.safeParse(profile).success).toBe(true);
  expect(customFieldAnswersSchema.safeParse({"How did you hear about this position?":"ABCDE1234F"}).success).toBe(false);
  expect(customFieldAnswersSchema.safeParse({"How did you hear about this position?":""}).success).toBe(false);
});
it("does not choose between conflicting normalized keys", () => expect(rememberedAnswer("How did you hear about us?", {"How did you hear about us?":"A", "how did you hear about us":"B"})).toBe(""));

it("supports short meaningful new labels but rejects generic labels", () => {
  expect(safeMemoryQuestion("Hobbies")).toBe(true);
  expect(safeMemoryQuestion("Answer")).toBe(false);
  expect(safeMemoryQuestion("API key")).toBe(false);
});

it("retains newly learned answers while applying deliberate edits and removals", () => {
  const first = "Favorite development editor?", second = "Preferred collaboration tool?", third = "Favorite testing technique?";
  expect(mergeRememberedAnswers({[first]:"VS Code",[second]:"Slack",[third]:"Unit tests"}, {[first]:"VS Code",[second]:"Slack"}, {[first]:"Vim"})).toEqual({[first]:"Vim",[third]:"Unit tests"});
});
