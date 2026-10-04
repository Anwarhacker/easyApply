// Local template generation: use supplied facts, never infer credentials or company claims.
export type CoverLetterTone = "professional" | "enthusiastic" | "concise";
export type CoverLetterSection = "aboutYou" | "whyHire" | "whyCompany" | "coverLetter";
export interface GeneratorOptions {
  company: string;
  role: string;
  tone: CoverLetterTone;
  variantIndex?: number;
  /** A user-reviewed accomplishment relevant to this application. */
  achievement?: string;
  /** A user-written reason for choosing this employer. */
  companyInterest?: string;
}
const clean = (value?: string) => (value ?? "").replace(/\s+/g, " ").trim();
const sentence = (value: string) => value ? value + (/[.!?]$/.test(value) ? "" : ".") : "";
function pick(items: string[], index = 0) {
  const safe = Number.isFinite(index) ? Math.trunc(index) : 0;
  return items[((safe % items.length) + items.length) % items.length];
}
function skillPhrase(values: Record<string, string>) {
  const skills = [values.skills, values.technologies, values.programmingLanguages, values.tools]
    .filter(Boolean).join(",").split(/[,;|\n]+/).map(clean).filter(Boolean);
  const seen = new Set<string>();
  const unique = skills.filter(skill => { const key = skill.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 5);
  return unique.length > 1 ? unique.slice(0, -1).join(", ") + " and " + unique.at(-1) : unique[0] ?? "";
}
export function buildVars(values: Record<string, string>, options: GeneratorOptions): Record<string, string> {
  const fullName = clean(values.fullName) || [clean(values.firstName), clean(values.lastName)].filter(Boolean).join(" ");
  const years = clean(values.totalExperience);
  const numericYears = /^\d+(?:\.\d+)?$/.test(years) ? Number(years) : null;
  const experiencePhrase = numericYears !== null && numericYears > 0
    ? `${numericYears} year${numericYears === 1 ? "" : "s"} of professional experience`
    : numericYears === 0 || values.employmentStatus === "Fresher" ? "an entry-level candidate" : "";
  return {
    name: clean(values.firstName) || fullName.split(" ")[0] || "",
    fullName, company: clean(options.company) || "your organisation",
    role: clean(options.role) || clean(values.preferredRole) || "this position",
    skills: skillPhrase(values), degree: clean(values.degree), branch: clean(values.branch),
    college: clean(values.college), cgpaNote: clean(values.cgpa) ? ` with a CGPA of ${clean(values.cgpa)}` : "",
    experiencePhrase, github: clean(values.github), linkedin: clean(values.linkedin),
  };
}
export function generateSection(section: Exclude<CoverLetterSection, "coverLetter">, values: Record<string, string>, options: GeneratorOptions): string {
  const v = buildVars(values, options);
  const concise = options.tone === "concise";
  if (section === "aboutYou") {
    const intro = pick(options.tone === "enthusiastic" ? [
      `I am excited to apply for ${v.role} at ${v.company}.`,
      `I would love to contribute as ${v.role} at ${v.company}.`,
      `The ${v.role} opportunity at ${v.company} interests me.`,
    ] : [
      `I am applying for ${v.role} at ${v.company}.`,
      `Please consider my application for ${v.role} at ${v.company}.`,
      `I would like to join ${v.company} as ${v.role}.`,
    ], options.variantIndex);
    const education = [v.degree, v.branch].filter(Boolean).join(" in ");
    return [v.name && !concise ? `My name is ${v.name}.` : "", intro,
      education ? sentence(`My educational background is in ${education}${v.college ? ` at ${v.college}` : ""}${v.cgpaNote}`) : "",
      v.experiencePhrase ? sentence(v.experiencePhrase === "an entry-level candidate" ? "I am an entry-level candidate" : `I bring ${v.experiencePhrase}`) : "",
    ].filter(Boolean).join(" ");
  }
  if (section === "whyHire") {
    const evidence = clean(options.achievement) || clean(values.projectContribution) || clean(values.projectDescription);
    return [v.skills ? sentence(`My skills include ${v.skills}`) : "", evidence ? sentence(evidence) : "",
      pick([
        `I would welcome a discussion about how my background could support ${v.company} in the ${v.role} role.`,
        `I would appreciate the opportunity to discuss my suitability for ${v.role} at ${v.company}.`,
        `I am interested in applying my background to the ${v.role} position at ${v.company}.`,
      ], options.variantIndex),
    ].filter(Boolean).join(" ");
  }
  const interest = clean(options.companyInterest);
  return [interest ? sentence(interest) : "", pick([
    `I am interested in the ${v.role} opportunity at ${v.company} and would like to learn more about the team's priorities.`,
    `I would welcome the chance to understand how the ${v.role} position contributes to ${v.company}'s goals.`,
    `I would like to explore how I could contribute to ${v.company} as ${v.role}.`,
  ], options.variantIndex)].filter(Boolean).join(" ");
}
export function generateCoverLetter(values: Record<string, string>, options: GeneratorOptions): string {
  const v = buildVars(values, options);
  return [new Date().toLocaleDateString("en-IN", {day:"numeric", month:"long", year:"numeric"}),
    "Dear Hiring Manager,", `Re: Application for ${v.role} at ${v.company}`,
    generateSection("aboutYou", values, options), generateSection("whyHire", values, options),
    generateSection("whyCompany", values, options), "Thank you for considering my application.",
    ["Kind regards,", v.fullName || "[Your name]", [v.linkedin, v.github].filter(Boolean).join(" | ")].filter(Boolean).join("\n"),
  ].join("\n\n");
}
export function generateAll(values: Record<string, string>, options: GeneratorOptions): Record<CoverLetterSection, string> {
  return {aboutYou: generateSection("aboutYou", values, options), whyHire: generateSection("whyHire", values, options),
    whyCompany: generateSection("whyCompany", values, options), coverLetter: generateCoverLetter(values, options)};
}
