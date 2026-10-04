import { it, expect } from "vitest";
import { blankProfile } from "./model";
import { profileText, savedSections, profileFilename, savedRowMatches, savedRowsText } from "./saved-info";
it("exports titled values and excludes empty or unexpected sensitive keys", () => {
  const p = blankProfile("Developer");
  p.values.firstName = "Asha";
  Object.assign(p.values, {
    pan: "ABCDE1234F",
    aadhaar: "123456789012",
    passphrase: "secret",
  });
  const text = profileText(p);
  expect(text).toContain("First Name: Asha");
  expect(text).not.toContain("ABCDE1234F");
  expect(text).not.toContain("123456789012");
  expect(text).not.toContain("secret");
  expect(savedSections(p).flatMap((s) => s.rows)).toHaveLength(1);
});
it("preserves multiline values and zero years", () => {
  const p = blankProfile();
  p.values.experience = "Line one\nLine two";
  p.values.totalExperience = "0";
  expect(profileText(p)).toContain("Line one\nLine two");
  expect(profileText(p)).toContain("Total experience (years): 0");
});
it("creates a safe filename", () => {
  expect(profileFilename(blankProfile("../Front/End:*"))).toBe(
    "easyApply--Front-End-.txt",
  );
});

it("searches multiple terms across titles and values regardless of case", () => {
  const row = {title:"Interview availability", value:"Weekdays after 5 PM"};
  expect(savedRowMatches(row," INTERVIEW 5 ")).toBe(true);
  expect(savedRowMatches(row,"interview weekends")).toBe(false);
  expect(savedRowMatches({title:"Email",value:"ＡＳＨＡ"},"asha")).toBe(true);
});
it("exports only the supplied result rows and preserves multiline answers", () => {
  expect(savedRowsText([{title:"Availability",value:"Monday\nTuesday"}])).toBe("Availability: Monday\nTuesday");
  expect(savedRowsText([])).toBe("");
});

it("includes learned question-answer pairs in profile exports", () => {
  const profile = blankProfile();
  profile.customFieldAnswers = {"Favorite development editor?":"VS Code"};
  expect(profileText(profile)).toContain("Learned answers\nFavorite development editor?: VS Code");
});
