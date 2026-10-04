import { disclosureKeys } from "./disclosures";
import { z } from "zod";
export const fresherGroups = {
  "School education": [
    "tenthSchool",
    "tenthBoard",
    "tenthYear",
    "tenthPercentage",
    "preDegreeType",
    "preDegreeCollege",
    "preDegreeBoard",
    "preDegreeYear",
    "preDegreePercentage",
  ],
  "Additional degree details": [
    "university",
    "educationStartYear",
    "degreePercentage",
    "studyType",
    "backlogs",
    "educationGap",
  ],
  "Joining preferences": [
    "nationality",
    "employmentStatus",
    "totalExperience",
    "noticePeriod",
    "joiningDate",
    "relocate",
    "workShifts",
    "workMode",
    "currentSalary",
  ],
  "Projects & certifications": [
    "programmingLanguages",
    "tools",
    "projectTitle",
    "projectDescription",
    "projectContribution",
    "projectTechnologies",
    "projectGithub",
    "projectDemo",
    "certifications",
    "codingProfile",
  ],
  "Application eligibility": [
    "workAuthorization",
    "visaSponsorship",
    "previouslyApplied",
  ],
} as const;
export type FresherField =
  (typeof fresherGroups)[keyof typeof fresherGroups][number];
export const fresherLabels: Record<FresherField, string> = {
  tenthSchool: "10th school",
  tenthBoard: "10th board",
  tenthYear: "10th passing year",
  tenthPercentage: "10th percentage",
  preDegreeType: "12th / Diploma qualification",
  preDegreeCollege: "12th / Diploma institution",
  preDegreeBoard: "12th / Diploma board or university",
  preDegreeYear: "12th / Diploma passing year",
  preDegreePercentage: "12th / Diploma percentage",
  university: "University",
  educationStartYear: "Degree start year",
  degreePercentage: "Degree percentage",
  studyType: "Study type",
  backlogs: "Active backlogs",
  educationGap: "Education gap (months)",
  nationality: "Nationality",
  employmentStatus: "Fresher / Experienced",
  totalExperience: "Total experience (years)",
  noticePeriod: "Notice period",
  joiningDate: "Available joining date",
  relocate: "Willing to relocate",
  workShifts: "Willing to work shifts",
  workMode: "Work mode preference",
  currentSalary: "Current salary",
  programmingLanguages: "Programming languages",
  tools: "Tools",
  projectTitle: "Project title",
  projectDescription: "Project description",
  projectContribution: "Your project contribution",
  projectTechnologies: "Project technologies",
  projectGithub: "Project GitHub URL",
  projectDemo: "Project demo URL",
  certifications: "Certifications",
  codingProfile: "Coding profile URL",
  workAuthorization: "Authorized to work in India",
  visaSponsorship: "Requires visa sponsorship",
  previouslyApplied: "Previously applied to this company",
};
export const fieldOptions: Partial<Record<FresherField, string[]>> = {
  preDegreeType: ["12th", "Diploma"],
  studyType: ["Full-time", "Part-time"],
  employmentStatus: ["Fresher", "Experienced"],
  relocate: ["Yes", "No"],
  workShifts: ["Yes", "No"],
  workMode: ["On-site", "Hybrid", "Remote"],
  workAuthorization: ["Yes", "No"],
  visaSponsorship: ["Yes", "No"],
  previouslyApplied: ["Yes", "No"],
};
export const legalFields: readonly string[] = [
  "workAuthorization",
  "visaSponsorship",
  "previouslyApplied",
];
const year = z
  .string()
  .refine((v) => !v || /^(19|20)\d{2}$/.test(v), "Enter a four-digit year");
const percent = z
  .string()
  .refine(
    (v) => !v || (/^\d+(\.\d+)?$/.test(v) && Number(v) <= 100),
    "Enter a percentage from 0 to 100",
  );
const count = z
  .string()
  .refine(
    (v) => !v || /^\d{1,3}$/.test(v),
    "Enter a non-negative whole number",
  );
const link = z
  .string()
  .max(2048)
  .refine((v) => {
    if (!v) return true;
    try {
      const u = new URL(v);
      return (
        ["https:", "http:"].includes(u.protocol) && !u.username && !u.password
      );
    } catch {
      return false;
    }
  }, "Enter an http:// or https:// URL");
export const fresherValidation = {
  tenthYear: year,
  preDegreeYear: year,
  educationStartYear: year,
  tenthPercentage: percent,
  preDegreePercentage: percent,
  degreePercentage: percent,
  backlogs: count,
  educationGap: count,
  totalExperience: z
    .string()
    .refine(
      (v) => !v || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) <= 80),
      "Enter years from 0 to 80",
    ),
  joiningDate: z
    .string()
    .refine(
      (v) =>
        !v ||
        (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
          !isNaN(Date.parse(v)) &&
          new Date(v).toISOString().slice(0, 10) === v),
      "Enter a valid joining date",
    ),
  projectGithub: link,
  projectDemo: link,
  codingProfile: link,
};
export const fresherAliases: Record<FresherField, string[]> = {
  tenthSchool: ["10th school", "class 10 school", "ssc school", "sslc school"],
  tenthBoard: ["10th board", "class 10 board", "ssc board", "sslc board"],
  tenthYear: [
    "10th passing year",
    "class 10 passing year",
    "sslc passing year",
  ],
  tenthPercentage: [
    "10th percentage",
    "class 10 percentage",
    "ssc percentage",
    "sslc percentage",
  ],
  preDegreeType: ["12th diploma qualification"],
  preDegreeCollege: [
    "12th institution",
    "12th college",
    "diploma institution",
    "diploma college",
    "hsc college",
    "puc college",
  ],
  preDegreeBoard: [
    "12th board",
    "diploma university",
    "hsc board",
    "puc board",
  ],
  preDegreeYear: [
    "12th passing year",
    "diploma passing year",
    "hsc passing year",
    "puc passing year",
  ],
  preDegreePercentage: [
    "12th percentage",
    "diploma percentage",
    "hsc percentage",
    "puc percentage",
  ],
  university: ["university", "university name"],
  educationStartYear: [
    "degree start year",
    "graduation start year",
    "be start year",
  ],
  degreePercentage: [
    "degree percentage",
    "graduation percentage",
    "be percentage",
    "btech percentage",
  ],
  studyType: ["study type", "mode of study", "education type"],
  backlogs: [
    "active backlogs",
    "backlogs",
    "arrears",
    "number of active backlogs",
  ],
  educationGap: ["education gap months", "education gap in months"],
  nationality: ["nationality", "citizenship"],
  employmentStatus: [
    "fresher experienced",
    "fresher or experienced",
    "employment type fresher",
    "employment status",
    "are you a fresher",
    "candidate type",
    "fresher",
  ],
  totalExperience: [
    "total experience",
    "total years of experience",
    "total experience years",
    "years of experience",
    "experience in years",
    "overall experience",
    "experience range",
  ],
  noticePeriod: ["notice period", "notice period in days", "notice", "select notice period"],
  joiningDate: [
    "available joining date",
    "joining date",
    "available start date",
    "start date",
  ],
  relocate: [
    "willing to relocate",
    "willingness to relocate",
    "open to relocation",
    "relocation",
    "are you willing to relocate",
    "relocate",
  ],
  workShifts: [
    "willing to work shifts",
    "willingness to work shifts",
    "work shifts",
    "rotational shifts",
    "night shifts",
    "shift preference",
    "comfortable with shifts",
  ],
  workMode: [
    "work mode",
    "work mode preference",
    "preferred work mode",
    "work arrangement",
    "preferred work arrangement",
    "work model",
  ],
  currentSalary: ["current salary", "current ctc"],
  programmingLanguages: ["programming languages"],
  tools: ["tools", "development tools"],
  projectTitle: ["project title", "project name"],
  projectDescription: ["project description", "project summary"],
  projectContribution: [
    "project contribution",
    "your contribution",
    "project role",
  ],
  projectTechnologies: ["project technologies", "project tech stack"],
  projectGithub: ["project github", "project github url", "project repository"],
  projectDemo: ["project demo url", "project live url", "live demo url"],
  certifications: ["certifications", "certificates earned"],
  codingProfile: [
    "coding profile",
    "coding profile url",
    "leetcode url",
    "hackerrank url",
  ],
  workAuthorization: [
    "authorized to work in india",
    "legally authorized to work in india",
    "work authorization",
    "authorized to work",
    "legally authorized to work",
    "work permit",
    "eligible to work",
  ],
  visaSponsorship: [
    "require visa sponsorship",
    "requires visa sponsorship",
    "visa sponsorship required",
    "will you require visa sponsorship",
    "visa sponsorship",
    "need visa sponsorship",
  ],
  previouslyApplied: [
    "previously applied to this company",
    "have you applied to this company before",
    "previously applied",
    "applied before",
    "have you applied before",
  ],
};
// Only add new keys when reading old profiles; never replace existing data.
export function migrateProfile(value: unknown): unknown {
  if (
    !value ||
    typeof value !== "object" ||
    !("values" in value) ||
    !value.values ||
    typeof value.values !== "object" ||
    Array.isArray(value.values)
  )
    return value;
  const defaults = Object.fromEntries(
    [
      ...Object.values(fresherGroups).flat(),
      "salutation",
      "currentLocation",
      ...disclosureKeys,
    ].map((k) => [k, ""]),
  );
  return { ...value, values: { ...defaults, ...value.values } };
}
