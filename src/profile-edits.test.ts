import { describe, expect, it } from "vitest";
import { blankProfile } from "./model";
import { mergeProfileEdits } from "./profile-edits";
import { acceptsResumeFile } from "./resume-vault";

describe("profile edits across windows", () => {
  it("merges independent edits while preserving newly learned answers", () => {
    const baseline = blankProfile();
    const saved = structuredClone(baseline);
    saved.values.city = "Pune";
    saved.customFieldAnswers = { "Which editor do you use?": "VS Code" };
    const draft = structuredClone(baseline);
    draft.values.email = "alex@example.com";
    const merged = mergeProfileEdits(saved, baseline, draft);
    expect(merged.values.city).toBe("Pune");
    expect(merged.values.email).toBe("alex@example.com");
    expect(merged.customFieldAnswers).toEqual(saved.customFieldAnswers);
    expect(baseline.values.email).toBe("");
  });
  it("rejects conflicting changes and does not mutate either version", () => {
    const baseline = blankProfile();
    const saved = structuredClone(baseline); saved.values.city = "Pune";
    const draft = structuredClone(baseline); draft.values.city = "Mumbai";
    expect(() => mergeProfileEdits(saved, baseline, draft)).toThrow("City changed in another window");
    expect(saved.values.city).toBe("Pune"); expect(draft.values.city).toBe("Mumbai");
  });
  it("accepts identical concurrent edits and deliberately cleared values", () => {
    const baseline = blankProfile(); baseline.values.city = "Pune";
    const draft = structuredClone(baseline); draft.values.city = "";
    expect(mergeProfileEdits(draft, baseline, draft).values.city).toBe("");
  });
  it("preserves a remotely renamed title unless the local user edits it", () => {
    const baseline = blankProfile();
    const saved = { ...baseline, title: "Backend" };
    expect(mergeProfileEdits(saved, baseline, baseline).title).toBe("Backend");
    expect(() => mergeProfileEdits(saved, baseline, { ...baseline, title: "Frontend" })).toThrow("Profile name changed");
  });
  it("never merges details belonging to different roles", () => {
    expect(() => mergeProfileEdits(blankProfile(), blankProfile(), blankProfile())).toThrow("profile changed");
  });
});

it("checks a resume's accepted file types consistently", () => {
  const file = { name: "Resume.PDF", type: "application/pdf" };
  expect(acceptsResumeFile(file, ".docx, .PDF")).toBe(true);
  expect(acceptsResumeFile(file, "application/*")).toBe(true);
  expect(acceptsResumeFile(file, "")).toBe(true);
  expect(acceptsResumeFile(file, ".docx")).toBe(false);
  expect(acceptsResumeFile(file, "text/plain")).toBe(false);
});
