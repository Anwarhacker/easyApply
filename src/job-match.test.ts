import { describe, expect, it } from "vitest";
import { compareJobResume, containsKeyword } from "./job-match";

describe("resume to job evidence", () => {
  it("recognizes aliases without confusing different languages or substrings", () => {
    const result = compareJobResume("Required skills: Java, JavaScript, C++, C#, React.js, Kubernetes.", "Built projects with JavaScript, ReactJS and K8s.");
    expect(result.keywords.filter(k => k.present).map(k => k.name).sort()).toEqual(["JavaScript", "Kubernetes", "React"]);
    expect(result.keywords.filter(k => !k.present).map(k => k.name).sort()).toEqual(["C#", "C++", "Java"]);
    expect(containsKeyword("GitHub", "Git")).toBe(false);
    expect(containsKeyword("NoSQL", "SQL")).toBe(false);
    expect(containsKeyword("C++", "C#")).toBe(false);
  });
  it("separates required, preferred and incidental mentions with source evidence", () => {
    const result = compareJobResume("Requirements\nPython and SQL\nPreferred skills\nDocker\nBenefits\nExcel training available", "I work with Python.");
    expect(result.keywords.find(k => k.name === "Python")).toMatchObject({ priority: "Required", present: true, evidence: "Python and SQL", resumeEvidence: "I work with Python." });
    expect(result.keywords.find(k => k.name === "Docker")?.priority).toBe("Preferred");
    expect(result.keywords.find(k => k.name === "Excel")?.priority).toBe("Mentioned");
  });
  it("does not treat negated resume claims as positive skill evidence", () => {
    expect(compareJobResume("Python is required", "No Python experience.").keywords[0].present).toBe(false);
    expect(compareJobResume("Docker is not required", "Docker projects").keywords[0].priority).toBe("Mentioned");
  });
  it("deduplicates repeated skills and takes the stronger requirement", () => {
    const result = compareJobResume("AWS preferred. AWS required for production support.", "Amazon Web Services", "AWS, aws");
    expect(result.keywords).toHaveLength(1);
    expect(result.keywords[0]).toMatchObject({ name: "AWS", priority: "Required", present: true });
  });
  it("compares user-supplied domain keywords only if they occur in the JD", () => {
    const result = compareJobResume("Required: SolidWorks and AutoCAD", "AutoCAD drafting", "SolidWorks, AutoCAD, Inventor");
    expect(result.keywords.map(k => [k.name, k.present])).toEqual([["AutoCAD", true], ["SolidWorks", false]]);
  });
  it("reports experience and qualifications verbatim without guessing eligibility", () => {
    const result = compareJobResume("At least 3–5 years of Python experience.\nBachelor's degree in computer science required.", "Bachelor of Commerce\n2 years of customer service.");
    expect(result.experience).toEqual(["At least 3–5 years of Python experience."]);
    expect(result.qualifications).toEqual(["Bachelor's degree in computer science required."]);
    expect(result.resumeQualifications).toEqual(["Bachelor of Commerce"]);
    expect(result.resumeExperience).toEqual(["2 years of customer service."]);
  });
  it("reports no keywords rather than inventing a match percentage", () => {
    expect(compareJobResume("A specialist role in an unusual industry.", "A relevant resume.").keywords).toEqual([]);
  });
});
