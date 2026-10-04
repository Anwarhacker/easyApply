import { expect, it } from "vitest";
import { matchField } from "./matching";
import { noticeThresholdAnswer } from "./converters";
import { sameSelectAnswer } from "./react-select";
import { rememberedAnswer } from "./field-memory";

it.each([
  ["Linkedln Profile", "linkedin"], ["Location (City)", "city"],
  ["Current location", "currentLocation"], ["Preferred location", "preferredLocation"],
  ["Is your Notice Period less than 30 days", "noticePeriod"],
  ["Are you ready to relocate to Bengaluru", "relocate"],
  ["Do you have experience working in BFSI Domain", null],
  ["Do you have experience with version control tools such as Git.", null],
  ["Do you have understanding of cloud platforms (AWS, Azure, or GCP) and containerization tools like Docker.", null],
  ["Final round will be in-person face-to-face interview ,kindly confirm your availability for the same", null],
  ["Capco Job Candidate Privacy Notice Acknowledgement", null],
])("matches Greenhouse question %s", (question, field) => expect(matchField([question])).toBe(field));

it.each([
  ["Immediate", "Yes"], ["15 days", "Yes"], ["30 days", "No"], ["45", "No"],
  ["2 weeks", "Yes"], ["1 month", "No"], ["serving notice", ""], ["15-45 days", ""],
  ["Not immediate", ""], ["negotiable", ""], ["-1", ""],
])("answers strict notice threshold from %s", (value, expected) => {
  expect(noticeThresholdAnswer(value, ["Is your Notice Period less than 30 days?"])).toBe(expected);
});
it("distinguishes inclusive and exclusive notice thresholds", () => {
  expect(noticeThresholdAnswer("30 days", ["Is your notice period within 30 days?"])).toBe("Yes");
  expect(noticeThresholdAnswer("30 days", ["Is your notice period more than 30 days?"])).toBe("No");
  expect(noticeThresholdAnswer("30 days", ["Notice period"])).toBeNull();
  expect(noticeThresholdAnswer("30.5 days", ["Is your notice period within 30 days?"])).toBe("No");
  expect(noticeThresholdAnswer("15 days", ["Is your notice period not less than 30 days?"])).toBe("");
});
it("requires a complete matching option, allowing city spelling and dial suffixes", () => {
  expect(sameSelectAnswer("India +91", "India", "country")).toBe(true);
  expect(sameSelectAnswer("Bengaluru", "Bangalore", "currentLocation")).toBe(true);
  expect(sameSelectAnswer("Bengaluru, Karnataka, India", "Bengaluru", "city")).toBe(false);
  expect(sameSelectAnswer("Bengaluru, Karnataka, India", "Bengaluru", "city", { state: "Karnataka", country: "India" })).toBe(true);
  expect(sameSelectAnswer("Bengaluru, Karnataka, India", "Bengaluru", "city", { state: "Maharashtra", country: "India" })).toBe(false);
  expect(sameSelectAnswer("Not willing", "Willing", "relocate")).toBe(false);
});
it("uses only explicit answers to the same screening question", () => {
  const question = "Do you have experience working in BFSI Domain";
  expect(rememberedAnswer(question, { [question]: "No" })).toBe("No");
  expect(rememberedAnswer("Do you have experience with Git", { [question]: "No" })).toBe("");
});
