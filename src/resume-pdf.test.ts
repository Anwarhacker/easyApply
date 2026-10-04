import { beforeEach, expect, it, vi } from "vitest";
const pdf = vi.hoisted(() => ({ getDocument: vi.fn(), destroy: vi.fn(), getTextContent: vi.fn() }));
vi.mock("pdfjs-dist", () => ({ getDocument: pdf.getDocument, GlobalWorkerOptions: {} }));
import { extractTextFromPdf, parseResumeFile } from "./resume-parser";

beforeEach(() => {
  vi.clearAllMocks();
  pdf.getTextContent.mockResolvedValue({ items: [
    { str: "Asha Rao", hasEOL: true },
    { str: "asha@example.com", hasEOL: true },
    { str: "Technical", hasEOL: false },
    { str: "Skills", hasEOL: true },
  ] });
  pdf.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({ getTextContent: pdf.getTextContent }) }), destroy: pdf.destroy });
});

it("preserves PDF lines so names remain separate from contact details", async () => {
  const result = await parseResumeFile(new File(["%PDF-"], "RESUME.PDF"));
  expect(result.text).toContain("Asha Rao\nasha@example.com\nTechnical Skills\n");
  expect(result.fields.firstName).toBe("Asha");
  expect(pdf.destroy).toHaveBeenCalledOnce();
});

it("releases PDF resources after an extraction failure", async () => {
  pdf.getTextContent.mockRejectedValue(new Error("Unreadable page"));
  await expect(extractTextFromPdf(new Uint8Array())).rejects.toThrow("Unreadable page");
  expect(pdf.destroy).toHaveBeenCalledOnce();
});
