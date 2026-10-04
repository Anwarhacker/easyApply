import { describe, it, expect } from "vitest";
import { extractJobMetadata, isSubmitTrigger } from "./tracker-detector";

describe("Job Metadata Extractor", () => {
  it("extracts company and position from JSON-LD structured data", () => {
    const mockDoc = {
      querySelectorAll: (sel: string) => {
        if (sel.includes("json")) {
          return [
            {
              textContent: JSON.stringify({
                "@type": "JobPosting",
                title: "Staff Software Engineer",
                hiringOrganization: {
                  "@type": "Organization",
                  name: "Stripe",
                },
              }),
            },
          ];
        }
        return [];
      },
      querySelector: () => null,
      title: "",
    } as unknown as Document;

    const res = extractJobMetadata(mockDoc);
    expect(res.company).toBe("Stripe");
    expect(res.position).toBe("Staff Software Engineer");
  });

  it("extracts company and position from OpenGraph and headings", () => {
    const mockDoc = {
      querySelectorAll: () => [],
      querySelector: (sel: string) => {
        if (sel.includes("og:title")) return { getAttribute: () => "Senior Frontend Developer" };
        if (sel.includes("og:site_name")) return { getAttribute: () => "Figma" };
        return null;
      },
      title: "",
    } as unknown as Document;

    const res = extractJobMetadata(mockDoc);
    expect(res.company).toBe("Figma");
    expect(res.position).toBe("Senior Frontend Developer");
  });

  it("extracts from document title pattern '[Role] at [Company]'", () => {
    const mockDoc = {
      querySelectorAll: () => [],
      querySelector: () => null,
      title: "Full Stack Engineer at Google Careers",
    } as unknown as Document;

    const res = extractJobMetadata(mockDoc);
    expect(res.company).toBe("Google");
    expect(res.position).toBe("Full Stack Engineer");
  });

  it("extracts company from Greenhouse ATS URL", () => {
    const mockDoc = {
      querySelectorAll: () => [],
      querySelector: (sel: string) => {
        if (sel === "h1") return { textContent: "Data Platform Lead" };
        return null;
      },
      title: "Job Application",
    } as unknown as Document;

    const res = extractJobMetadata(mockDoc, "https://boards.greenhouse.io/airbnb/jobs/987654");
    expect(res.company).toBe("Airbnb");
    expect(res.position).toBe("Data Platform Lead");
  });
});

describe("isSubmitTrigger", () => {
  it("recognizes input[type=submit] and button[type=submit]", () => {
    const next = {tagName:"BUTTON", textContent:"Next", getAttribute: (attr:string) => attr === "type" ? "submit" : null} as unknown as Element;
    expect(isSubmitTrigger(next)).toBe(false);
    const input = {
      tagName: "INPUT",
      getAttribute: (attr: string) => (attr === "type" ? "submit" : null),
    } as unknown as Element;
    expect(isSubmitTrigger(input)).toBe(true);

    const btn = {
      tagName: "BUTTON",
      getAttribute: (attr: string) => (attr === "type" ? "submit" : null),
    } as unknown as Element;
    expect(isSubmitTrigger(btn)).toBe(true);
  });

  it("recognizes button with submit application text", () => {
    const btn = {
      tagName: "BUTTON",
      getAttribute: () => null,
      textContent: "Submit Application",
    } as unknown as Element;
    expect(isSubmitTrigger(btn)).toBe(true);
  });

  it("rejects non-submit buttons like search, cookie, cancel", () => {
    const searchBtn = {
      tagName: "BUTTON",
      getAttribute: () => null,
      textContent: "Search Jobs",
    } as unknown as Element;
    expect(isSubmitTrigger(searchBtn)).toBe(false);

    const cancelBtn = {
      tagName: "BUTTON",
      getAttribute: () => null,
      textContent: "Cancel",
    } as unknown as Element;
    expect(isSubmitTrigger(cancelBtn)).toBe(false);
  });
});
