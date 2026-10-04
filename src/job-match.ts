export interface JobPage {
  title: string; url: string; description: string; location: string; salary: string; source: string;
}
const skillGroups = [
  "JavaScript|javascript|ecmascript", "TypeScript|typescript", "React|react|react.js|reactjs", "Angular|angular|angularjs", "Vue|vue|vue.js|vuejs", "Next.js|next.js|nextjs", "Node.js|node.js|nodejs", "Express|express.js|expressjs", "HTML|html|html5", "CSS|css|css3", "Tailwind CSS|tailwind|tailwindcss", "Sass|sass|scss",
  "Python|python", "Java|java", "C++|c++", "C#|c#|c sharp", ".NET|.net|dotnet", "Go|golang|go language", "Rust|rust", "PHP|php", "Ruby|ruby", "Swift|swift", "Kotlin|kotlin", "Django|django", "Flask|flask", "FastAPI|fastapi", "Spring Boot|spring boot", "Ruby on Rails|ruby on rails|rails", "Laravel|laravel",
  "SQL|sql", "PostgreSQL|postgresql|postgres", "MySQL|mysql", "MongoDB|mongodb|mongo db", "Redis|redis", "Elasticsearch|elasticsearch", "GraphQL|graphql", "REST APIs|rest api|rest apis|restful api|restful apis",
  "AWS|aws|amazon web services", "Azure|azure", "Google Cloud|gcp|google cloud", "Docker|docker", "Kubernetes|kubernetes|k8s", "Terraform|terraform", "Linux|linux", "Git|git", "GitHub Actions|github actions", "Jenkins|jenkins", "CI/CD|ci/cd|ci cd|continuous integration|continuous delivery", "Microservices|microservices|micro services",
  "Jest|jest", "Playwright|playwright", "Cypress|cypress", "Selenium|selenium", "Unit testing|unit testing|unit tests", "Agile|agile", "Scrum|scrum", "Jira|jira", "Figma|figma", "Accessibility|accessibility|wcag",
  "Machine learning|machine learning", "Deep learning|deep learning", "TensorFlow|tensorflow", "PyTorch|pytorch", "Pandas|pandas", "NumPy|numpy", "Scikit-learn|scikit-learn|sklearn", "Data analysis|data analysis|data analytics", "Power BI|power bi|powerbi", "Tableau|tableau", "Excel|excel", "Statistics|statistics", "Spark|apache spark|pyspark", "Kafka|kafka", "ETL|etl",
  "Salesforce|salesforce", "SAP|sap", "Accounting|accounting", "Financial modeling|financial modeling|financial modelling", "SEO|seo|search engine optimization", "Google Analytics|google analytics", "Content marketing|content marketing", "Project management|project management", "Product management|product management", "Customer service|customer service", "Communication|communication", "Leadership|leadership", "Problem solving|problem solving|problem-solving", "Collaboration|collaboration", "Stakeholder management|stakeholder management",
];
export type JobKeyword = { name: string; priority: "Required" | "Preferred" | "Mentioned"; evidence: string; present: boolean; resumeEvidence: string };
const normalize = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[‐‑–—]/g, "-").replace(/\s+/g, " ").trim();
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function containsKeyword(text: string, keyword: string): boolean {
  return new RegExp(`(?:^|[^a-z0-9+#])${escape(normalize(keyword))}(?=$|[^a-z0-9+#])`, "i").test(normalize(text));
}
function lines(text: string): string[] {
  return text.slice(0, 100000).split(/\n+|(?<=[.!?;])\s+(?=[A-Z])/).map(line => line.trim()).filter(Boolean);
}
function evidenceLines(text: string) {
  let section: JobKeyword["priority"] = "Mentioned";
  return lines(text).map(line => {
    const notRequired = /\b(?:not required|no .{0,40} required|not necessary)\b/i.test(line);
    const preferred = /\b(preferred|nice.to.have|desirable|bonus|a plus|optional)\b/i.test(line);
    const required = /\b(required|requirements|must.have|must|essential|minimum qualifications|basic qualifications)\b/i.test(line);
    if (line.length < 100 && /^(?:[•*#-]\s*)?(?:required skills|requirements|minimum qualifications|basic qualifications|essential skills|preferred qualifications|preferred skills|nice.to.have|responsibilities|benefits|about us)\s*:?$/i.test(line))
      section = preferred ? "Preferred" : required ? "Required" : "Mentioned";
    return { line, priority: notRequired ? "Mentioned" as const : preferred ? "Preferred" as const : required ? "Required" as const : section };
  });
}
export function compareJobResume(description: string, resume: string, extraKeywords = "") {
  const jobLines = evidenceLines(description);
  const resumeLines = lines(resume);
  const dictionary = skillGroups.map(group => { const [name, ...aliases] = group.split("|"); return { name, aliases }; });
  for (const term of extraKeywords.split(/[,\n]/).map(s => s.trim()).filter(s => s.length >= 2 && s.length <= 60).slice(0, 40)) {
    if (!dictionary.some(entry => [entry.name, ...entry.aliases].some(alias => normalize(alias) === normalize(term)))) dictionary.push({ name: term, aliases: [term] });
  }
  const priorityRank = { Required: 0, Preferred: 1, Mentioned: 2 };
  const keywords: JobKeyword[] = dictionary.flatMap(({ name, aliases }) => {
    const mentions = jobLines.filter(({ line }) => aliases.some(alias => containsKeyword(line, alias)));
    if (!mentions.length) return [];
    mentions.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
    // Negated claims are not positive evidence of a skill. Ambiguous wording
    // remains absent instead of manufacturing proficiency from keyword presence.
    const evidence = resumeLines.find(line => aliases.some(alias => containsKeyword(line, alias)) && !/\b(no|not|without|lack|lacking|never)\b/i.test(line));
    return [{ name, priority: mentions[0].priority, evidence: mentions[0].line, present: !!evidence, resumeEvidence: evidence ?? "" }];
  }).sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || a.name.localeCompare(b.name));
  return {
    keywords,
    experience: jobLines.filter(({ line }) => /\b\d+(?:\s*[-–]\s*\d+)?\+?\s*(?:years?|yrs?)\b|\b(?:entry.level|fresher|no experience)\b/i.test(line)).map(item => item.line).slice(0, 8),
    qualifications: jobLines.filter(({ line }) => /\b(?:degree|bachelor|master|doctorate|phd|diploma|certification|certified|licen[cs]e)\b/i.test(line)).map(item => item.line).slice(0, 10),
    resumeQualifications: resumeLines.filter(line => /\b(?:degree|bachelor|master|doctorate|phd|diploma|certification|certified|b\.?tech|m\.?tech|b\.?sc|m\.?sc)\b/i.test(line)).slice(0, 8),
    resumeExperience: resumeLines.filter(line => /\b\d+(?:\.\d+)?\+?\s*(?:years?|yrs?)\b/i.test(line)).slice(0, 8),
  };
}

// This self-contained function executes in the active tab via executeScript.
// It only reads page content; it does not activate autofill or send data away.
export function extractCurrentJob(): JobPage {
  const cleanHtml = (html: string) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script,style,noscript").forEach(node => node.remove());
    doc.querySelectorAll("p,div,li,br,h1,h2,h3,h4").forEach(node => node.append("\n"));
    return doc.body.textContent?.replace(/[ \t]+/g, " ").replace(/\n\s*\n/g, "\n").trim() ?? "";
  };
  type RecordValue = Record<string, unknown>;
  const objects: RecordValue[] = [];
  const walk = (value: unknown, depth = 0) => {
    if (depth > 8 || objects.length >= 30) return;
    if (Array.isArray(value)) { value.slice(0, 100).forEach(item => walk(item, depth + 1)); return; }
    if (!value || typeof value !== "object") return;
    const obj = value as RecordValue;
    if (obj["@type"] === "JobPosting" || (Array.isArray(obj["@type"]) && obj["@type"].includes("JobPosting"))) objects.push(obj);
    if (obj["@graph"]) walk(obj["@graph"], depth + 1);
  };
  for (const node of [...document.querySelectorAll('script[type="application/ld+json"]')].slice(0, 30)) {
    if ((node.textContent?.length ?? 0) > 300000) continue;
    try { walk(JSON.parse(node.textContent || "")); } catch { /* Other structured-data blocks can still be valid. */ }
  }
  const job = objects.length === 1 ? objects[0] : undefined;
  const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
  let description = job ? cleanHtml(text(job.description)) : "";
  let source = description ? "Structured job posting" : "Visible page text — review the extracted description";
  if (!description) {
    const root = document.querySelector<HTMLElement>('[itemprop="description"],#job-description,.job-description,[data-testid="job-description"],.job__description') || document.querySelector<HTMLElement>('main,[role="main"],article') || document.body;
    description = root.innerText?.trim() || "";
    if (objects.length > 1) source = "Multiple job postings detected — keep only the intended job description below";
  }
  if (job) {
    for (const [key, heading] of [["skills", "Skills"], ["experienceRequirements", "Experience requirements"], ["educationRequirements", "Education requirements"], ["qualifications", "Qualifications"]]) {
      const value = job[key];
      const detail = Array.isArray(value) ? value.filter(item => typeof item === "string").join("\n") : text(value);
      if (detail) description += `\n${heading}:\n${cleanHtml(detail)}`;
    }
  }
  const locations = job?.jobLocation ? (Array.isArray(job.jobLocation) ? job.jobLocation : [job.jobLocation]) : [];
  let locationText = locations.map(item => {
    if (!item || typeof item !== "object") return "";
    const address = (item as RecordValue).address;
    if (typeof address === "string") return address;
    if (!address || typeof address !== "object") return "";
    const a = address as RecordValue;
    const country = typeof a.addressCountry === "object" && a.addressCountry ? text((a.addressCountry as RecordValue).name) : text(a.addressCountry);
    return [text(a.addressLocality), text(a.addressRegion), country].filter(Boolean).join(", ");
  }).filter(Boolean).join(" / ");
  if (job?.jobLocationType === "TELECOMMUTE") locationText = ["Remote", locationText].filter(Boolean).join(" · ");
  let salary = "";
  const base = job?.baseSalary;
  if (base && typeof base === "object") {
    const b = base as RecordValue;
    const v = b.value && typeof b.value === "object" ? b.value as RecordValue : { value: b.value };
    const scalar = (value: unknown) => typeof value === "number" || typeof value === "string" ? String(value) : "";
    const amount = scalar(v.value) || [scalar(v.minValue), scalar(v.maxValue)].filter(Boolean).join("–");
    if (amount) salary = [text(b.currency), amount, text(v.unitText)].filter(Boolean).join(" ");
  }
  const pageLines = (document.querySelector<HTMLElement>('main,[role="main"]') || document.body).innerText?.split("\n").map(line => line.trim()).filter(Boolean) ?? [];
  if (!locationText) locationText = pageLines.find(line => /^(?:job )?location\s*[:-]/i.test(line) && line.length < 250) ?? "";
  if (!salary) salary = pageLines.find(line => /\b(salary|compensation|pay range|ctc)\b/i.test(line) && /[$€£₹]|\b(?:USD|INR|EUR|GBP|LPA)\b/i.test(line) && line.length < 300) ?? "";
  return { title: (text(job?.title) || document.querySelector("h1")?.textContent || document.title).trim().slice(0, 300), url: location.href, description: description.slice(0, 60000), location: locationText.slice(0, 500), salary: salary.slice(0, 500), source };
}
