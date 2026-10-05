import { customFieldAnswersSchema } from "./field-memory";
import { disclosureLabels, disclosureOptions } from "./disclosures";
import { z } from "zod";
import {
  fresherGroups,
  fresherLabels,
  fresherValidation,
  fieldOptions,
} from "./fresher";
export const groups = {
  "Personal details": [
    "salutation",
    "fullName",
    "firstName",
    "lastName",
    "email",
    "mobile",
    "dob",
    "gender",
  ],
  Addresses: [
    "currentAddress",
    "permanentAddress",
    "currentLocation",
    "city",
    "state",
    "country",
    "postalCode",
  ],
  Education: ["degree", "branch", "college", "graduationYear", "cgpa"],
  "Experience & links": [
    "skills",
    "technologies",
    "experience",
    "internships",
    "portfolio",
    "github",
    "linkedin",
  ],
  "Preferences & answers": [
    "preferredRole",
    "preferredLocation",
    "expectedSalary",
    "aboutYou",
    "whyHire",
    "whyCompany",
    "availability",
  ],
  "Voluntary Disclosures": ["disclosuresEnabled", "voluntaryGender", "raceEthnicity", "veteranStatus", "disabilityStatus"],
  ...fresherGroups,
} as const;
export type Field = (typeof groups)[keyof typeof groups][number];
export const label = (s: string) =>
  disclosureLabels[s] ?? fresherLabels[s as keyof typeof fresherLabels] ??
  s
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .replace("Cgpa", "CGPA")
    .replace("Dob", "Date of birth");
const url = z
  .string()
  .refine(
    (v) => !v || /^https?:\/\/[^\s]+$/.test(v),
    "Use an http:// or https:// URL",
  );
export const profileSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().trim().min(1, "Profile name is required").max(100),
  customFieldAnswers: customFieldAnswersSchema.optional(),
  values: z
    .object(
      Object.fromEntries(
        Object.values(groups)
          .flat()
          .map((k) => [k, z.string().max(10000)]),
      ) as Record<Field, z.ZodString>,
    )
    .extend({
      ...fresherValidation,
      email: z
        .string()
        .refine((v) => !v || z.email().safeParse(v).success, "Invalid email"),
      mobile: z
        .string()
        .refine(
          (v) => !v || /^[+\d\s()-]{7,20}$/.test(v),
          "Invalid phone number",
        ),
      portfolio: url,
      github: url,
      linkedin: url,
      graduationYear: z
        .string()
        .refine((v) => !v || /^\d{4}$/.test(v), "Use a four-digit year"),
      cgpa: z
        .string()
        .refine(
          (v) => !v || (!isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 10),
          "CGPA must be 0–10",
        ),
    })
    .superRefine((values, ctx) => {
      for (const [key, options] of Object.entries({ ...fieldOptions, ...disclosureOptions, disclosuresEnabled: ["yes"] })) {
        const value = values[key as Field];
        if (value && !options.includes(value))
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "Choose one of the listed options",
          });
      }
    }),
});
export type Profile = z.infer<typeof profileSchema>;
export type Sensitive = { pan: string; aadhaar: string };
export type Application = {
  id: string;
  company: string;
  position: string;
  url: string;
  appliedDate: string;
  followUpDate?: string;
  status: string;
  resume: string;
  notes: string;
};
export const blankProfile = (title = "Frontend Developer"): Profile => ({
  id: crypto.randomUUID(),
  title,
  values: Object.fromEntries(
    Object.values(groups)
      .flat()
      .map((k) => [k, ""]),
  ) as Profile["values"],
});
export type Match = {
  reason?: string;
  blocked?: boolean;
  confidence?: number;
  evidence?: string[];
  answerId?: string;
  answerSuggestions?: { id: string; question: string; answer: string; category: string; score: number; reasons: string[] }[];
  remembered?: boolean;
  id: string;
  label: string;
  field: Field | "pan" | "aadhaar" | null;
  value: string;
  kind: string;
  sensitive: boolean;
  selected: boolean;
};
