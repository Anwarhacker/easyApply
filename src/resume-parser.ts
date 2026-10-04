import * as pdfjsLib from "pdfjs-dist";
import { CITY_MAP, COUNTRY_MAP, STATE_MAP } from "./dropdown";

// Configure pdfjs worker for browser/extension environments
if (typeof window !== "undefined" && typeof document !== "undefined") {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.mjs",
      import.meta.url,
    ).toString();
  } catch {
    // Falls back to pdfjs built-in fake worker
  }
}

export async function extractTextFromPdf(
  data: ArrayBuffer | Uint8Array,
): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
  });

  try {
  const pdf = await loadingTask.promise;
  const pagesText: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageStrings = content.items
      .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""));
    pagesText.push(pageStrings.join(""));
  }

  return pagesText.join("\n");
  } finally {
    await loadingTask.destroy();
  }
}

export function extractContactInfo(text: string): {
  email?: string;
  mobile?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  codingProfile?: string;
} {
  const result: ReturnType<typeof extractContactInfo> = {};

  // Email
  const emailMatch = text.match(
    /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/,
  );
  if (emailMatch) {
    result.email = emailMatch[0];
  }

  // Mobile / Phone (allow grouped digits such as 98765 43210)
  const phoneMatch =
    text.match(/(?:\+91[\s-]?)?[6789]\d(?:[\s-]?\d){8}\b/) ||
    text.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/);
  if (phoneMatch) {
    const clean = phoneMatch[0].replace(/[^\d+]/g, "");
    result.mobile = clean.startsWith("+")
      ? clean
      : clean.length === 10
        ? `+91${clean}`
        : clean;
  }

  // LinkedIn
  const liMatch = text.match(
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9_-]+)/i,
  );
  if (liMatch) {
    result.linkedin = `https://www.linkedin.com/in/${liMatch[1]}`;
  }

  // GitHub
  const ghMatch = text.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)/i,
  );
  if (ghMatch) {
    result.github = `https://github.com/${ghMatch[1]}`;
  }

  // Coding Profile (LeetCode, HackerRank, CodeChef, Codeforces)
  const codeMatch = text.match(
    /(?:https?:\/\/)?(?:www\.)?(leetcode\.com\/[a-zA-Z0-9_-]+|hackerrank\.com\/[a-zA-Z0-9_-]+|codechef\.com\/users\/[a-zA-Z0-9_-]+|codeforces\.com\/profile\/[a-zA-Z0-9_-]+)/i,
  );
  if (codeMatch) {
    result.codingProfile = codeMatch[0].startsWith("http")
      ? codeMatch[0]
      : `https://${codeMatch[0]}`;
  }

  // Portfolio
  const portMatch = text.match(
    /https?:\/\/(?:www\.)?[a-zA-Z0-9-]+\.(?:dev|io|me|app|tech|in|vercel\.app|netlify\.app)(?:\/[^\s]*)?/i,
  );
  if (
    portMatch &&
    !portMatch[0].includes("linkedin") &&
    !portMatch[0].includes("github")
  ) {
    result.portfolio = portMatch[0];
  }

  return result;
}

function formatPlaceName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  return trimmed
    .split(/\s+/)
    .map((word) =>
      word.length <= 3 && !/^(st|ft)$/i.test(word)
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ")
    .replace(/\bAnd\b/g, "and");
}

export function extractLocation(text: string): {
  city?: string;
  state?: string;
  country?: string;
} {
  const lines = text.split(/\r?\n/).slice(0, 15);

  for (const rawLine of lines) {
    for (const chunk of rawLine.split(/[|•]/)) {
      const piece = chunk
        .replace(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi, "")
        .replace(/(?:https?:\/\/\S+|www\.\S+)/gi, "")
        .replace(/(?:\+?\d[\d\s().-]{8,}\d)/g, "")
        .trim();
      if (!piece || piece.length < 4) continue;

      const commaParts = piece
        .split(/,\s*/)
        .map((p) => p.trim())
        .filter((p) => p.length >= 2 && /^[A-Za-z][A-Za-z\s.'-]+$/.test(p));
      if (commaParts.length < 2) continue;

      const result: ReturnType<typeof extractLocation> = {};
      for (const part of commaParts) {
        const norm = part.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

        if (COUNTRY_MAP[norm] || ["india", "usa", "united states", "uk"].includes(norm)) {
          result.country = formatPlaceName(part);
          continue;
        }

        let matchedState = false;
        for (const key of Object.keys(STATE_MAP)) {
          if (norm === key || (key.length > 3 && norm.includes(key))) {
            result.state = formatPlaceName(part);
            matchedState = true;
            break;
          }
        }
        if (matchedState) continue;

        let matchedCity = false;
        for (const [canonical, variants] of Object.entries(CITY_MAP)) {
          const names = [canonical, ...variants].map((v) => v.toLowerCase());
          if (names.includes(norm)) {
            result.city = formatPlaceName(variants[0] ?? part);
            matchedCity = true;
            break;
          }
        }
        if (!matchedCity && !result.city) {
          result.city = formatPlaceName(part);
        }
      }

      if (result.city || result.state || result.country) {
        return result;
      }
    }
  }

  return {};
}

export function extractName(text: string): {
  fullName?: string;
  firstName?: string;
  lastName?: string;
} {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const excludeWords = [
    "resume",
    "curriculum",
    "vitae",
    "cv",
    "profile",
    "summary",
    "contact",
    "education",
    "experience",
    "skills",
    "projects",
  ];

  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const line = lines[i];
    // Skip lines with emails or urls
    if (/@|http|www|\.com|\.in|\.org|\d{5,}/i.test(line)) continue;
    // Check if line looks like a person's name (2 to 4 words, alphabetic)
    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 4) {
      const isCleanName = words.every(
        (w) =>
          /^[A-Za-z.'-]+$/.test(w) &&
          !excludeWords.includes(w.toLowerCase()),
      );
      if (isCleanName) {
        const firstName = words[0];
        const lastName = words.slice(1).join(" ");
        return {
          fullName: `${firstName} ${lastName}`,
          firstName,
          lastName,
        };
      }
    }
  }

  return {};
}

export function extractEducation(text: string): {
  degree?: string;
  branch?: string;
  college?: string;
  graduationYear?: string;
  cgpa?: string;
  degreePercentage?: string;
} {
  const result: ReturnType<typeof extractEducation> = {};

  // Degree
  if (/\b(?:B\.?Tech|Bachelor of Technology)\b/i.test(text)) {
    result.degree = "B.Tech";
  } else if (/\b(?:B\.?E\.?|Bachelor of Engineering)\b/i.test(text)) {
    result.degree = "B.E.";
  } else if (/\b(?:M\.?Tech|Master of Technology)\b/i.test(text)) {
    result.degree = "M.Tech";
  } else if (/\b(?:M\.?E\.?|Master of Engineering)\b/i.test(text)) {
    result.degree = "M.E.";
  } else if (/\b(?:BCA|Bachelor of Computer Applications)\b/i.test(text)) {
    result.degree = "BCA";
  } else if (/\b(?:MCA|Master of Computer Applications)\b/i.test(text)) {
    result.degree = "MCA";
  } else if (/\b(?:B\.?Sc|Bachelor of Science)\b/i.test(text)) {
    result.degree = "B.Sc";
  } else if (/\b(?:M\.?Sc|Master of Science)\b/i.test(text)) {
    result.degree = "M.Sc";
  } else if (/\b(?:Diploma)\b/i.test(text)) {
    result.degree = "Diploma";
  }

  // Branch
  if (/\b(?:Computer Science|CSE|CS)\b/i.test(text)) {
    result.branch = "Computer Science and Engineering";
  } else if (/\b(?:Information Technology|IT)\b/i.test(text)) {
    result.branch = "Information Technology";
  } else if (/\b(?:Electronics (?:and|&) Communication|ECE)\b/i.test(text)) {
    result.branch = "Electronics and Communication Engineering";
  } else if (/\b(?:Mechanical Engineering|ME)\b/i.test(text)) {
    result.branch = "Mechanical Engineering";
  } else if (/\b(?:Electrical Engineering|EE|EEE)\b/i.test(text)) {
    result.branch = "Electrical and Electronics Engineering";
  } else if (/\b(?:Civil Engineering|CE)\b/i.test(text)) {
    result.branch = "Civil Engineering";
  } else if (/\b(?:Data Science|AI & DS|Artificial Intelligence)\b/i.test(text)) {
    result.branch = "Artificial Intelligence and Data Science";
  }

  // College / University
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (
      /\b(?:Institute|College|University|Academy|Polytechnic)\b/i.test(line) &&
      !/(?:Experience|Skills|Frameworks|Languages|Libraries)/i.test(line)
    ) {
      const clean = line
        .replace(/^(?:College|University|Institute|School)[\s:]+/i, "")
        .split(/[,|]/)[0]
        .trim();
      if (clean.length >= 5 && clean.length <= 80) {
        result.college = clean;
        break;
      }
    }
  }

  // Graduation Year (e.g. 2020 - 2024 or Graduated: 2023)
  const yearMatches = text.match(/\b(20[123]\d)\b/g);
  if (yearMatches && yearMatches.length > 0) {
    const numericYears = yearMatches
      .map(Number)
      .filter((y) => y >= 2015 && y <= 2030);
    if (numericYears.length > 0) {
      result.graduationYear = String(Math.max(...numericYears));
    }
  }

  // CGPA / Percentage
  const cgpaMatch = text.match(/\b(?:CGPA|GPA)[:\s]*([0-9](?:\.[0-9]{1,2})?)\b/i);
  if (cgpaMatch) {
    result.cgpa = cgpaMatch[1];
  }

  const percentMatch = text.match(
    /\b(?:Percentage|Score|Aggregate)[:\s]*([0-9]{2}(?:\.[0-9]{1,2})?)\s*%/i,
  );
  if (percentMatch) {
    result.degreePercentage = percentMatch[1];
  }

  return result;
}

const KNOWN_LANGUAGES = [
  "JavaScript",
  "TypeScript",
  "Python",
  "Java",
  "C++",
  "C#",
  "C",
  "Golang",
  "Go",
  "Rust",
  "PHP",
  "Ruby",
  "Kotlin",
  "Swift",
  "Dart",
  "SQL",
  "HTML",
  "CSS",
];

const KNOWN_TOOLS_AND_TECH = [
  "React",
  "React Native",
  "Next.js",
  "Vue",
  "Angular",
  "Node.js",
  "Express",
  "NestJS",
  "Spring Boot",
  "Django",
  "Flask",
  "FastAPI",
  "Tailwind CSS",
  "Bootstrap",
  "PostgreSQL",
  "MySQL",
  "MongoDB",
  "Redis",
  "Docker",
  "Kubernetes",
  "AWS",
  "Azure",
  "GCP",
  "Git",
  "GitHub",
  "CI/CD",
  "Linux",
  "Playwright",
  "Vitest",
  "Jest",
  "GraphQL",
  "REST API",
  "Microservices",
  "Postman",
  "Figma",
];

export function extractSkills(text: string): {
  programmingLanguages?: string;
  tools?: string;
  skills?: string;
  technologies?: string;
} {
  const foundLanguages: string[] = [];
  const foundTools: string[] = [];

  for (const lang of KNOWN_LANGUAGES) {
    const regex = new RegExp(`\\b${lang.replace(/\+/g, "\\+")}\\b`, "i");
    if (regex.test(text)) {
      foundLanguages.push(lang);
    }
  }

  for (const tool of KNOWN_TOOLS_AND_TECH) {
    const escaped = tool.replace(/\./g, "\\.").replace(/\+/g, "\\+");
    const regex = new RegExp(`\\b${escaped}\\b`, "i");
    if (regex.test(text)) {
      foundTools.push(tool);
    }
  }

  const allCombined = [...foundLanguages, ...foundTools];

  return {
    programmingLanguages: foundLanguages.join(", "),
    tools: foundTools.join(", "),
    skills: allCombined.slice(0, 15).join(", "),
    technologies: foundTools.join(", "),
  };
}

export function extractExperience(text: string): {
  employmentStatus?: string;
  totalExperience?: string;
  experience?: string;
} {
  const result: ReturnType<typeof extractExperience> = {};

  const expMatch = text.match(
    /\b(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)(?:\s*of)?\s*(?:(?:total|overall|professional|relevant|industry)\s+)*experience\b/i,
  );
  if (expMatch) {
    const years = parseFloat(expMatch[1]);
    result.totalExperience = String(Math.floor(years));
    result.employmentStatus = years >= 1 ? "Experienced" : "Fresher";
  } else if (/\bfresher\b/i.test(text) || /\bentry[- ]level\b/i.test(text)) {
    result.employmentStatus = "Fresher";
    result.totalExperience = "0";
  }

  return result;
}

export function extractAboutYou(text: string): { aboutYou?: string } {
  const summaryMatch = text.match(
    /(?:Professional Summary|Summary|About Me|Career Objective|Objective)[\s:]*\r?\n([^\n]+(?:\r?\n[^\n]+){0,3})/i,
  );
  if (summaryMatch) {
    const clean = summaryMatch[1].replace(/\s+/g, " ").trim();
    if (clean.length > 20 && clean.length < 500) {
      return { aboutYou: clean };
    }
  }
  return {};
}

export function parseResumeText(text: string): Record<string, string> {
  const contact = extractContactInfo(text);
  const location = extractLocation(text);
  const name = extractName(text);
  const education = extractEducation(text);
  const skills = extractSkills(text);
  const experience = extractExperience(text);
  const summary = extractAboutYou(text);

  const merged: Record<string, string> = {};

  const addIfVal = (k: string, v?: string) => {
    if (v && v.trim()) merged[k] = v.trim();
  };

  addIfVal("fullName", name.fullName);
  addIfVal("firstName", name.firstName);
  addIfVal("lastName", name.lastName);
  addIfVal("email", contact.email);
  addIfVal("mobile", contact.mobile);
  addIfVal("linkedin", contact.linkedin);
  addIfVal("github", contact.github);
  addIfVal("portfolio", contact.portfolio);
  addIfVal("codingProfile", contact.codingProfile);
  addIfVal("city", location.city);
  addIfVal("state", location.state);
  addIfVal("country", location.country);

  addIfVal("degree", education.degree);
  addIfVal("branch", education.branch);
  addIfVal("college", education.college);
  addIfVal("graduationYear", education.graduationYear);
  addIfVal("cgpa", education.cgpa);
  addIfVal("degreePercentage", education.degreePercentage);

  addIfVal("programmingLanguages", skills.programmingLanguages);
  addIfVal("tools", skills.tools);
  addIfVal("skills", skills.skills);
  addIfVal("technologies", skills.technologies);

  addIfVal("employmentStatus", experience.employmentStatus);
  addIfVal("totalExperience", experience.totalExperience);

  addIfVal("aboutYou", summary.aboutYou);

  return merged;
}

export async function parseResumeFile(
  file: File,
): Promise<{ text: string; fields: Record<string, string> }> {
  if (!/\.(pdf|txt)$/i.test(file.name)) {
    throw new Error("Choose a PDF or TXT resume. Export Word documents as PDF first.");
  }
  if (!file.size) throw new Error("This file is empty. Choose a resume containing text.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Choose a resume smaller than 10 MB.");
  let rawText: string;

  if (/\.pdf$/i.test(file.name)) {
    const buffer = await file.arrayBuffer();
    rawText = await extractTextFromPdf(buffer);
  } else {
    // Fallback for plain text resumes
    rawText = await file.text();
  }

  const fields = parseResumeText(rawText);
  return { text: rawText, fields };
}
