import { describe, expect, it } from "vitest";
import { matchField } from "./matching";
import type { Field } from "./model";

const questions: Partial<Record<Field, string[]>> = {
  currentLocation: [
    "What is your Current Location ?", "now where you are located ?", "where you located ?",
    "Where u located?", "Where are u located?",
    "Where are you currently located?", "Where are you located now?", "Where do you live?",
    "Where do you currently live?", "Where are you based?", "Where are you currently based?",
    "Please enter your present location", "Current place of residence",
  ],
  preDegreeCollege: [
    "Which High School did you go to ? (12th Grade)", "Which school did you attend for 12th grade?",
    "Where did you complete your 12th?", "Where did you study in class 12?",
    "Name of your 12th grade school", "Class 12 school", "School attended for 12th",
    "Higher secondary institution", "Higher secondary school attended", "Senior secondary school name",
    "HSC school name", "PUC institution name",
  ],
  experience: [
    "Work Experience", "Describe your work experience", "Previous work experience", "Past work experience",
    "Professional background", "Employment background", "Describe your employment history",
    "Previous employment details", "Career history", "Work background", "Work experience details",
  ],
  cgpa: [
    "GPA (e.g. 3.5/4.0 or 8.3/10.0)", "CGPA (out of 10)", "Grade point average",
    "Cumulative GPA", "Overall GPA", "College GPA", "Degree CGPA", "Graduation CGPA",
    "Undergraduate GPA", "Academic GPA", "Final CGPA", "What is your GPA?",
  ],
  availability: [
    "How quickly can you join us ?", "How quickly can you join?", "How soon can you join us?",
    "When can you join us?", "When can you join?", "When are you available to join?",
    "How soon can you start?", "How quickly can you start?", "When can you start work?",
    "When are you available to start?", "How soon are you available?", "Joining availability",
  ],
  preferredRole: [
    "Role (s) you wish to apply to", "Roles you wish to apply to", "Role you wish to apply to",
    "Which role are you applying for?", "Which position are you applying for?",
    "What role would you like to apply for?", "What position are you interested in?",
    "Roles of interest", "Position of interest", "Role of interest", "Which roles interest you?",
    "Job you are applying for",
  ],
};

describe("application question wording", () => {
  for (const [field, labels] of Object.entries(questions)) {
    it(`recognizes at least ten distinct phrasings for ${field}`, () => {
      expect(new Set(labels).size).toBeGreaterThanOrEqual(10);
      for (const label of labels) {
        expect(matchField([label]), label).toBe(field);
        expect(matchField([`${label} * Required`]), label).toBe(field);
      }
    });
  }

  it.each([
    ["Preferred work location", "preferredLocation"],
    ["City", "city"],
    ["Current city", "city"],
    ["Which city do you live in?", "city"],
    ["Which city are you based in?", "city"],
    ["Current country", "country"],
    ["Current residential address", "currentAddress"],
    ["10th school name", "tenthSchool"],
    ["12th marks percentage", "preDegreePercentage"],
    ["Total work experience in years", "totalExperience"],
    ["Earliest joining date", "joiningDate"],
    ["Notice period in days", "noticePeriod"],
    ["Current job title", null],
    ["Relevant work experience", null],
    ["Father current location", null],
    ["GPAward", null],
  ])("keeps %s separate", (label, field) => {
    expect(matchField([label])).toBe(field);
  });
});
