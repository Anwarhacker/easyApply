import { isNextStepLabel, navigationLabel } from "./step-monitor";
export interface JobMetadata {
  company: string;
  position: string;
}

export function extractJobMetadata(doc?: Document, rawUrl?: string): JobMetadata {
  if (!doc) return { company: "", position: "" };
  const url = rawUrl || (typeof location !== "undefined" ? location.href : "");

  let company = "";
  let position = "";

  // 1. Check JSON-LD Structured Data
  try {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      const text = script.textContent?.trim();
      if (!text) continue;
      const data = JSON.parse(text);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (
          item["@type"] === "JobPosting" ||
          (Array.isArray(item["@type"]) && item["@type"].includes("JobPosting"))
        ) {
          if (item.title && typeof item.title === "string") {
            position = item.title.trim();
          }
          if (item.hiringOrganization) {
            const org = item.hiringOrganization;
            if (typeof org === "string") company = org.trim();
            else if (org.name && typeof org.name === "string") company = org.name.trim();
          }
        }
      }
      if (company && position) break;
    }
  } catch {
    // JSON parse error handled gracefully
  }

  // 2. OpenGraph & Meta Tags
  if (!position) {
    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content");
    if (ogTitle) position = ogTitle.trim();
  }
  if (!company) {
    const ogSite = doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content");
    if (ogSite) company = ogSite.trim();
  }

  // 3. Headings (h1)
  if (!position) {
    const h1 = doc.querySelector("h1");
    if (h1 && h1.textContent) {
      const text = h1.textContent.trim().replace(/\s+/g, " ");
      if (text.length <= 100 && !/sign in|log in|apply for|careers/i.test(text)) {
        position = text;
      }
    }
  }

  // 4. URL Heuristics (Greenhouse, Lever, Ashby, Workday)
  if (url) {
    try {
      const u = new URL(url);
      const host = u.hostname.toLowerCase();
      const pathSegments = u.pathname.split("/").filter(Boolean);

      if (host.includes("greenhouse.io") && pathSegments.length >= 1) {
        if (!company) company = formatName(pathSegments[0]);
      } else if (host.includes("lever.co") && pathSegments.length >= 1) {
        if (!company) company = formatName(pathSegments[0]);
      } else if (host.includes("ashbyhq.com") && pathSegments.length >= 1) {
        if (!company) company = formatName(pathSegments[0]);
      } else if (host.startsWith("careers.") || host.startsWith("jobs.")) {
        const parts = host.split(".");
        if (parts.length >= 3 && !company) {
          company = formatName(parts[1]);
        }
      }
    } catch {
      // Invalid URL
    }
  }

  // 5. Document Title Parsing
  if (doc.title && (!position || !company)) {
    const rawTitle = doc.title.trim();
    // Split by common delimiters: " at ", " - ", " | ", " – "
    const atMatch = rawTitle.match(/^(.+?)\s+at\s+([^-|–—]+)/i);
    if (atMatch) {
      if (!position) position = atMatch[1].trim();
      if (!company) company = atMatch[2].trim();
    } else {
      const parts = rawTitle.split(/\s*[-|–—]\s*/);
      if (parts.length >= 2) {
        if (!position) position = parts[0].trim();
        if (!company) {
          // Find part that doesn't just say "Careers" or "Jobs"
          const cleanPart = parts[1].replace(/\b(careers|jobs|job application)\b/gi, "").trim();
          if (cleanPart) company = cleanPart;
        }
      }
    }
  }

  // Final cleanup: remove trailing " - Careers", "(Careers)", etc.
  if (position) {
    position = position.replace(/\s*[-|–—]\s*(careers|jobs).*$/i, "").trim();
  }
  if (company) {
    company = company.replace(/\b(careers|jobs|job application)\b/gi, "").trim();
  }

  return {
    company: company || "Company",
    position: position || "Applicant Position",
  };
}

function formatName(raw: string): string {
  if (!raw) return "";
  const clean = decodeURIComponent(raw).replace(/[-_]+/g, " ").trim();
  return clean.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function isSubmitTrigger(el: Element | null): boolean {
  if (!el) return false;
  if (isNextStepLabel(navigationLabel(el))) return false;

  const tag = el.tagName.toLowerCase();
  const type = el.getAttribute("type")?.toLowerCase() || "";

  if (tag === "input" && type === "submit") return true;
  if (tag === "button" && type === "submit") return true;

  // If button has no type or type="button", inspect content/labels
  if (tag === "button" || tag === "a" || el.getAttribute("role") === "button") {
    const text = [
      el.textContent || "",
      el.getAttribute("aria-label") || "",
      el.getAttribute("title") || "",
      el.getAttribute("value") || "",
    ].join(" ").toLowerCase().trim();

    // Check if it clearly indicates application submission
    if (
      /\b(submit application|submit|apply now|send application|complete application)\b/i.test(text)
    ) {
      // Guard against false positives like "subscribe", "search", "consent"
      if (!/search|find|subscribe|cookie|cancel|back|skip/i.test(text)) {
        return true;
      }
    }
  }

  return false;
}
