import type { Field } from "./model";
import { fresherAliases } from "./fresher";
import { alternateLabels } from "./alternate-labels";
export const aliases: Record<Field | "pan" | "aadhaar", string[]> = {
  ...fresherAliases,
  disclosuresEnabled: [],
  voluntaryGender: [],
  raceEthnicity: ["race", "ethnicity", "race ethnicity", "race ethnic background"],
  veteranStatus: ["veteran status", "protected veteran status", "are you a protected veteran"],
  disabilityStatus: ["disability status", "disability", "self identification of disability"],
  salutation: ["salutation", "title", "prefix", "honorific", "select salutation"],
  fullName: ["full name", "your name", "applicant name", "name"],
  firstName: ["first name", "given name"],
  lastName: ["last name", "surname", "family name"],
  email: [
    "email",
    "email address",
    "email id",
    "e mail",
    "e mail id",
    "e mail address",
    "emailid",
  ],
  mobile: [
    "phone",
    "mobile",
    "contact number",
    "mobile number",
    "phone number",
    "tel",
  ],
  dob: ["date of birth", "birth date", "birthday", "dob", "bday"],
  gender: ["gender", "sex", "gender identity", "select gender", "choose gender", "applicant gender"],
  currentAddress: [
    "current address",
    "street address",
    "street",
    "address",
    "address line 1",
  ],
  permanentAddress: ["permanent address"],
  currentLocation: ["current location", "present location", "where are you located"],
  city: ["city", "town", "address level2", "select city"],
  state: ["state", "province", "address level1", "select state", "state province", "region"],
  country: ["country", "country name", "select country", "current country", "country of residence", "residing country"],
  postalCode: ["postal code", "zip", "zip code", "pincode", "pin code"],
  degree: ["degree", "qualification", "highest qualification", "highest degree", "education level", "educational qualification", "highest education", "select degree", "select qualification"],
  branch: ["branch", "major", "specialization", "select branch"],
  college: ["college", "institution", "college name"],
  graduationYear: ["graduation year", "year of graduation", "passing year", "select year"],
  cgpa: ["cgpa", "gpa"],
  skills: ["skills", "skill set"],
  technologies: ["technologies", "tech stack"],
  experience: ["work experience", "experience", "experience level", "experience range", "overall experience", "select experience"],
  internships: ["internships", "internship"],
  portfolio: ["portfolio", "website", "personal website"],
  github: ["github", "github url"],
  linkedin: ["linkedin", "linkedin url"],
  preferredRole: ["preferred role", "desired position", "job role"],
  preferredLocation: ["preferred location", "desired location", "job location"],
  expectedSalary: ["expected salary", "salary expectation", "expected ctc", "ctc expectation", "salary range", "expected ctc range", "select salary"],
  aboutYou: ["about you", "tell us about yourself"],
  whyHire: ["why should we hire you", "why hire you"],
  whyCompany: ["why this company", "why do you want to work here"],
  availability: ["availability", "how soon can you join", "joining time", "availability to join", "select availability"],
  pan: ["pan", "pan number", "pan card"],
  aadhaar: ["aadhaar", "aadhaar number", "aadhar", "aadhar number"],
};
export const normalize = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/e[\s-]+mail/gi, "email")
    .replace(/git\s*hub/gi, "github")
    .replace(/linked\s*in/gi, "linkedin")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(
      /^(?:(?:please )?(?:enter|provide|select|choose|type)(?: your)?|your)\s+/,
      "",
    )
    .replace(/\s+(?:required|mandatory|optional)$/, "")
    .trim();
export const forbidden = (s: string) =>
  /password|passcode|otp|one time|upi|bank|account number|credit card|debit card|cvv|ifsc|routing|social security|ssn|passport|consent|agree|terms|privacy|subscribe/i.test(
    normalize(s),
  );
type MatchedField = Field | "pan" | "aadhaar";
// Normalize the dictionary once, rather than for every alias on every control.
const matchingAliases = Object.entries(aliases).flatMap(([key, words]) =>
  [...new Set([...words, ...(alternateLabels[key as Field] ?? [])].map(normalize))]
    .filter(Boolean).map(word => ({ key: key as MatchedField, word })),
);

function matchSignal(signal: string): { key: MatchedField | null; recognized: boolean } {
  const exact = matchingAliases.filter(alias => alias.word === signal);
  const candidates = exact.length ? exact : matchingAliases.filter(({ word }) =>
    (word.length >= 5 || word === "gpa" || word === "cgpa") &&
    (` ${signal} `).includes(` ${word} `));
  // A specific phrase explains its generic subphrase (permanent address vs
  // address). Two independent concepts, however, must not win by string length.
  const specific = candidates.filter(candidate => !candidates.some(other =>
    other.word.length > candidate.word.length && (` ${other.word} `).includes(` ${candidate.word} `)));
  const keys = new Set(specific.map(candidate => candidate.key));
  return { key: keys.size === 1 ? [...keys][0] : null, recognized: candidates.length > 0 };
}
export function matchField(
  signals: string[],
): Field | "pan" | "aadhaar" | null {
  if (signals.some(forbidden)) return null;
  const normalized = signals.map(normalize);
  // Technical experience is not interchangeable with total career experience.
  if (normalized.some(s => /\bexperience\s+(?:in|with|using|working (?:on|with|in))\s+(?!years?\b)/.test(s))) return null;
  // Employer/recruiter details are not the applicant's identity or contact info.
  if (normalized.some(s => /\b(?:company|employer|organization|organisation|supervisor|manager|recruiter)\s+(?:name|email|phone|mobile|address|website)\b|\b(?:name|email|phone|mobile|address|website)\s+of\s+(?:(?:your|the|current|previous)\s+)*(?:company|employer|organization|organisation|supervisor|manager|recruiter)\b/.test(s))) return null;
  // Specific screening answers cannot be inferred from generic experience,
  // technologies, tools, or joining availability. Exact saved answers may apply.
  if (normalized.some(s => /\b(?:do|have) you (?:have )?(?:experience|understanding)\b|\b(?:in person|face to face)\b.*\binterview\b/.test(s))) return null;
  // A preferred name can differ from the applicant's stored first/legal name.
  if (normalized.some((s) => /\bpreferred\b.*\bname\b|\bnickname\b/.test(s)))
    return null;
  // These are independent values, not a title, full name, or full street address.
  // Nearby labels and generic input names must not override their meaning.
  if (normalized.some((s) => /\bsuffix\b|\bmiddle (?:name|initials?)\b|\b(?:apt|apartment|flat)\b/.test(s)))
    return null;
  // Never reuse the applicant's contact details for another person's fields.
  if (
    normalized.some((s) =>
      /\b(emergency|guardian|father|mother|parent|reference|referee|spouse|alternate)\b|\bsecondary\b.*\b(email|phone|mobile|contact|address)\b/.test(
        s,
      ),
    )
  )
    return null;
  // Separate address lines and location subdivisions need their own values.
  if (
    normalized.some((s) =>
      /\b(address|street)\b.*\b(line )?[23]\b|\b(country|dial|isd) code\b|\bcountry\b.*\bregion\b.*\bcode\b|\b(phone|mobile|tel)\b.*\bcode\b/.test(
        s,
      ),
    )
  )
    return null;
  // A narrative work-history answer cannot safely populate a years count.
  if (
    normalized.some((s) => /relevant.*experience|experience.*relevant|(?:team lead(?:ing)?|leadership|managerial).*experience|experience.*(?:team lead(?:ing)?|leadership|managerial)/.test(s))
  )
    return null;
  // Salutation aliases include "title", but job/designation titles are different fields.
  if (
    normalized.some((s) => {
      if (/\b(?:desired|preferred)\s+(?:job\s+)?title\b/.test(s)) return false;
      if (/\bposition applied for\b/.test(s)) return false;
      return (
        /\b(?:job|professional|current|present|previous|reporting)\s+title\b|\b(?:current|present|previous)\s+(?:designation|role)\b|\bdesignation\b|\brole\s+title\b/.test(
          s,
        )
      );
    })
  )
    return null;
  if (normalized.some(s => /^(?:current age|age(?: in years| years)?)$/.test(s)) && !normalized.some(s => /\b(minimum|maximum|over|under|eligible|eligibility|confirm)\b/.test(s))) return "dob";
  if (normalized.some(s => /^bday (day|month|year)$/.test(s))) return "dob";
  // Signals arrive in authority order: visible/accessibility labels first,
  // implementation names and IDs later. A generic ID must not override a label.
  let key: MatchedField | null = null;
  for (const signal of normalized) {
    const result = matchSignal(signal);
    if (!result.recognized) continue;
    key = result.key;
    break; // Ambiguous labels stay unmatched, even when the ID looks familiar.
  }
  // Do not confuse school qualifications with degree-level education.
  const text = normalized.join(" ");
  if (/\b(10th|class 10|ssc|sslc)\b/.test(text) && !key?.startsWith("tenth"))
    return null;
  if (
    /\b(12th|class 12|hsc|puc|diploma)\b/.test(text) &&
    !key?.startsWith("preDegree")
  )
    return null;
  return key;
}
