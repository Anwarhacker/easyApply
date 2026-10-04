import { describe, it, expect } from "vitest";
import { generateSection, generateCoverLetter, generateAll, buildVars } from "./cover-letter";

describe("cover-letter generator", () => {
  const mockProfileValues = {
    firstName: "Anwar",
    lastName: "Patel",
    fullName: "Anwar Patel",
    degree: "B.Tech",
    branch: "Computer Science and Engineering",
    college: "RV College of Engineering",
    graduationYear: "2024",
    cgpa: "8.5",
    skills: "React, TypeScript, Node.js, Python, TailwindCSS",
    totalExperience: "0",
    preferredRole: "Frontend Developer",
    linkedin: "https://linkedin.com/in/anwarpatel",
    github: "https://github.com/anwarpatel",
  };

  it("builds template variables from profile values and options", () => {
    const vars = buildVars(mockProfileValues, {
      company: "Google",
      role: "Software Engineer",
      tone: "professional",
    });

    expect(vars.name).toBe("Anwar");
    expect(vars.fullName).toBe("Anwar Patel");
    expect(vars.company).toBe("Google");
    expect(vars.role).toBe("Software Engineer");
    expect(vars.degree).toBe("B.Tech");
    expect(vars.college).toBe("RV College of Engineering");
    expect(vars.cgpaNote).toContain("8.5");
  });

  it("generates aboutYou section with company and role substitution", () => {
    const text = generateSection("aboutYou", mockProfileValues, {
      company: "Microsoft",
      role: "Frontend Engineer",
      tone: "professional",
      variantIndex: 0,
    });

    expect(text).toContain("Anwar");
    expect(text).toContain("Microsoft");
    expect(text).toContain("B.Tech");
    expect(text).not.toContain("{name}");
    expect(text).not.toContain("{company}");
  });

  it("generates whyHire section with skills integration", () => {
    const text = generateSection("whyHire", mockProfileValues, {
      company: "Amazon",
      role: "SDE 1",
      tone: "enthusiastic",
      variantIndex: 0,
    });

    expect(text).toContain("Amazon");
    expect(text).not.toContain("{skills}");
    expect(text.length).toBeGreaterThan(50);
  });

  it("generates whyCompany section tailored to target company", () => {
    const text = generateSection("whyCompany", mockProfileValues, {
      company: "Netflix",
      role: "UI Engineer",
      tone: "concise",
      variantIndex: 0,
    });

    expect(text).toContain("Netflix");
    expect(text).toContain("UI Engineer");
    expect(text).not.toContain("{company}");
    expect(text).not.toContain("{role}");
  });

  it("generates complete full cover letter formatted with date and signoff", () => {
    const letter = generateCoverLetter(mockProfileValues, {
      company: "Atlassian",
      role: "Fullstack Developer",
      tone: "professional",
    });

    expect(letter).toContain("Dear Hiring Manager,");
    expect(letter).toContain("Re: Application for Fullstack Developer at Atlassian");
    expect(letter).toContain("Anwar Patel");
    expect(letter).toContain("https://linkedin.com/in/anwarpatel");
  });

  it("generates all four sections in generateAll()", () => {
    const all = generateAll(mockProfileValues, {
      company: "Swiggy",
      role: "React Developer",
      tone: "professional",
    });

    expect(all.aboutYou).toBeTruthy();
    expect(all.whyHire).toBeTruthy();
    expect(all.whyCompany).toBeTruthy();
    expect(all.coverLetter).toBeTruthy();
  });
});

const target = {company: "Example", role: "Designer", tone: "professional" as const};
it("does not invent qualifications or employer facts for an empty profile", () => {
  for (const tone of ["professional", "enthusiastic", "concise"] as const) {
    for (let variantIndex = 0; variantIndex < 3; variantIndex++) {
      const letter = generateCoverLetter({}, {...target, tone, variantIndex});
      expect(letter).not.toMatch(/Engineering|Computer Science|graduate|expertise|proven|reputation|fresher|year[s]? of professional/);
      expect(letter).toContain("[Your name]");
      expect(letter).not.toContain("undefined");
    }
  }
});
it("uses supplied evidence and company interest without interpreting them as templates", () => {
  const letter = generateCoverLetter({projectContribution:"Old project"}, {...target, achievement:"Reduced load time by 20% using {cache}", companyInterest:"I want to work on your public transport app"});
  expect(letter).toContain("Reduced load time by 20% using {cache}.");
  expect(letter).toContain("I want to work on your public transport app.");
  expect(letter).not.toContain("Old project");
});
it("distinguishes numeric experience from narrative work history", () => {
  expect(buildVars({totalExperience:"1"}, target).experiencePhrase).toBe("1 year of professional experience");
  expect(buildVars({experience:"Built payment APIs"}, target).experiencePhrase).toBe("");
  expect(buildVars({}, target).experiencePhrase).toBe("");
  expect(buildVars({totalExperience:"0"}, target).experiencePhrase).toBe("an entry-level candidate");
});
it("deduplicates skills without breaking CI/CD and preserves saved evidence", () => {
  const text = generateSection("whyHire", {skills:"React, react, CI/CD", projectContribution:"Built a deployment pipeline"}, target);
  expect(text).toContain("React and CI/CD");
  expect(text).toContain("Built a deployment pipeline.");
});
it("keeps concise drafts shorter and handles wrapped variants", () => {
  const values = {firstName:"Sam", degree:"BA", branch:"Design"};
  expect(generateCoverLetter(values, {...target,tone:"concise"}).length).toBeLessThan(generateCoverLetter(values,target).length);
  expect(generateSection("aboutYou",values,{...target,variantIndex:3})).toBe(generateSection("aboutYou",values,{...target,variantIndex:0}));
});
