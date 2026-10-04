import { describe, it, expect } from "vitest";
import {
  extractContactInfo,
  extractLocation,
  extractName,
  extractEducation,
  extractSkills,
  extractExperience,
  extractAboutYou,
  parseResumeText,
  parseResumeFile,
} from "./resume-parser";

const sampleResumeText = `
Anwar Patel
anwarpatel@example.com | +91 9876543210 | Bengaluru, Karnataka
https://www.linkedin.com/in/anwar-patel | https://github.com/anwarpatel | https://leetcode.com/anwarpatel

Professional Summary
Passionate Full Stack Developer with 2 years of experience building modern web applications using React, Node.js, and TypeScript.

Education
Bachelor of Technology in Computer Science and Engineering
R.V. Institute of Technology, Bengaluru
2020 - 2024
CGPA: 8.75 | Aggregate: 85%

Technical Skills
Languages: JavaScript, TypeScript, Python, Java, SQL, HTML, CSS
Frameworks & Libraries: React, Node.js, Express, Next.js, Tailwind CSS
Tools & Cloud: Git, GitHub, Docker, Kubernetes, AWS, PostgreSQL, MongoDB, Vitest
`;

describe("resume-parser", () => {
  it("rejects unsupported, empty and oversized files before reading them", async () => {
    await expect(parseResumeFile(new File(["resume"], "resume.docx"))).rejects.toThrow("PDF or TXT");
    await expect(parseResumeFile(new File([], "resume.txt"))).rejects.toThrow("empty");
    const oversized = new File(["resume"], "resume.txt");
    Object.defineProperty(oversized, "size", { value: 10 * 1024 * 1024 + 1 });
    await expect(parseResumeFile(oversized)).rejects.toThrow("10 MB");
  });

  it("accepts uppercase text file extensions", async () => {
    const result = await parseResumeFile(new File(["Asha Rao\nasha@example.com"], "RESUME.TXT"));
    expect(result.fields.email).toBe("asha@example.com");
    expect(result.fields.firstName).toBe("Asha");
  });
  it("extracts contact information properly", () => {
    const contact = extractContactInfo(sampleResumeText);
    expect(contact.email).toBe("anwarpatel@example.com");
    expect(contact.mobile).toBe("+919876543210");
    const spacedPhone = extractContactInfo("Reach me at 98765 43210 for interviews.");
    expect(spacedPhone.mobile).toBe("+919876543210");
    expect(contact.linkedin).toBe("https://www.linkedin.com/in/anwar-patel");
    expect(contact.github).toBe("https://github.com/anwarpatel");
    expect(contact.codingProfile).toBe("https://leetcode.com/anwarpatel");
  });

  it("extracts city and state from the contact header", () => {
    const location = extractLocation(sampleResumeText);
    expect(location.city).toBe("Bengaluru");
    expect(location.state).toBe("Karnataka");
  });

  it("extracts candidate name accurately", () => {
    const name = extractName(sampleResumeText);
    expect(name.fullName).toBe("Anwar Patel");
    expect(name.firstName).toBe("Anwar");
    expect(name.lastName).toBe("Patel");
  });

  it("extracts education details correctly", () => {
    const edu = extractEducation(sampleResumeText);
    expect(edu.degree).toBe("B.Tech");
    expect(edu.branch).toBe("Computer Science and Engineering");
    expect(edu.college).toContain("Institute of Technology");
    expect(edu.graduationYear).toBe("2024");
    expect(edu.cgpa).toBe("8.75");
    expect(edu.degreePercentage).toBe("85");
  });

  it("extracts skills and programming languages", () => {
    const skills = extractSkills(sampleResumeText);
    expect(skills.programmingLanguages).toContain("JavaScript");
    expect(skills.programmingLanguages).toContain("TypeScript");
    expect(skills.programmingLanguages).toContain("Python");
    expect(skills.tools).toContain("React");
    expect(skills.tools).toContain("Node.js");
    expect(skills.tools).toContain("Docker");
  });

  it("extracts experience details", () => {
    const exp = extractExperience(sampleResumeText);
    expect(exp.employmentStatus).toBe("Experienced");
    expect(exp.totalExperience).toBe("2");
  });

  it("extracts summary / about you", () => {
    const summary = extractAboutYou(sampleResumeText);
    expect(summary.aboutYou).toContain("Passionate Full Stack Developer");
  });

  it("parses the complete resume text into mapped profile fields", () => {
    const fields = parseResumeText(sampleResumeText);
    expect(fields.fullName).toBe("Anwar Patel");
    expect(fields.email).toBe("anwarpatel@example.com");
    expect(fields.degree).toBe("B.Tech");
    expect(fields.graduationYear).toBe("2024");
    expect(fields.totalExperience).toBe("2");
    expect(fields.skills).toContain("JavaScript");
    expect(fields.city).toBe("Bengaluru");
    expect(fields.state).toBe("Karnataka");
  });

  it("handles fresher profile detection", () => {
    const fresherText = `
Priya Sharma
priya@gmail.com | 9123456780
Fresher seeking software developer opportunities.
Bachelor of Engineering in Information Technology
2024
`;
    const exp = extractExperience(fresherText);
    expect(exp.employmentStatus).toBe("Fresher");
    expect(exp.totalExperience).toBe("0");

    const edu = extractEducation(fresherText);
    expect(edu.degree).toBe("B.E.");
    expect(edu.branch).toBe("Information Technology");
  });
});
