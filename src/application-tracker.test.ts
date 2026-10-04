import { describe, expect, it } from "vitest";
import { applicationSchema } from "./security";
import { filterApplications, followUpDue, localDate, mergeApplicationChanges, sameApplication } from "./application-tracker";
import type { Application } from "./model";
const app = (extra: Partial<Application> = {}): Application => ({ id: "a", company: "Alpha", position: "Engineer", url: "", status: "Applied", appliedDate: "2026-09-01", resume: "frontend.pdf", notes: "", ...extra });

describe("application tracker", () => {
  it("preserves concurrent additions and independent edits without mutating snapshots", () => {
    const baseline = [app()];
    const current = [app({ status: "Interview" }), app({ id: "b" })];
    const result = mergeApplicationChanges(current, baseline, [app({ notes: "Call Friday" })]);
    expect(result).toEqual([app({ status: "Interview", notes: "Call Friday" }), app({ id: "b" })]);
    expect(current[0].notes).toBe("");
    expect(baseline[0].status).toBe("Applied");
  });
  it("rejects conflicting edits and deletion of changed records", () => {
    expect(() => mergeApplicationChanges([app({ notes: "Remote" })], [app()], [app({ notes: "Draft" })])).toThrow("notes changed");
    expect(() => mergeApplicationChanges([app({ status: "Interview" })], [app()], [])).toThrow("before deleting");
  });
  it("does not resurrect remote deletions and rejects edits to deleted records", () => {
    expect(mergeApplicationChanges([], [app()], [app()])).toEqual([]);
    expect(() => mergeApplicationChanges([], [app()], [app({ notes: "Draft" })])).toThrow("deleted in another window");
  });
  it("allows identical concurrent edits and rejects duplicate IDs", () => {
    expect(mergeApplicationChanges([app({ notes: "Same" })], [app()], [app({ notes: "Same" })])[0].notes).toBe("Same");
    expect(() => mergeApplicationChanges([], [], [app(), app()])).toThrow("IDs must be unique");
  });
  it("distinguishes job IDs and fragments while ignoring marketing parameters", () => {
    const first = app({ url: "https://jobs.example.com/apply?job=1&utm_source=email" });
    expect(sameApplication(first, app({ url: "https://jobs.example.com/apply?job=1" }))).toBe(true);
    expect(sameApplication(first, app({ url: "https://jobs.example.com/apply?job=2" }))).toBe(false);
    expect(sameApplication(app({ url: "https://jobs.example.com/#/1" }), app({ url: "https://jobs.example.com/#/2" }))).toBe(false);
    expect(sameApplication(first, app())).toBe(false);
    expect(sameApplication(first, { ...first, appliedDate: "2026-09-02" })).toBe(false);
  });
  it("keeps old application records valid and validates optional calendar dates", () => {
    expect(applicationSchema.safeParse(app()).success).toBe(true);
    expect(applicationSchema.safeParse(app({ followUpDate: "" })).success).toBe(true);
    expect(applicationSchema.safeParse(app({ followUpDate: "2026-02-30" })).success).toBe(false);
    expect(applicationSchema.parse(app({ followUpDate: "2026-09-27" })).followUpDate).toBe("2026-09-27");
  });
  it("marks today and overdue follow-ups due while excluding closed applications", () => {
    expect(followUpDue(app({ followUpDate: "2026-09-27" }), "2026-09-27")).toBe(true);
    expect(followUpDue(app({ followUpDate: "2026-09-26" }), "2026-09-27")).toBe(true);
    expect(followUpDue(app({ followUpDate: "2026-09-28" }), "2026-09-27")).toBe(false);
    for (const status of ["Rejected", "Withdrawn"]) expect(followUpDue(app({ status, followUpDate: "2026-09-20" }), "2026-09-27")).toBe(false);
    expect(followUpDue(app(), "2026-09-27")).toBe(false);
  });
  it("combines trimmed search, status and due filters", () => {
    const apps = [app({ followUpDate: "2026-09-01" }), app({ id: "b", status: "Withdrawn" })];
    expect(filterApplications(apps, " FRONTEND ", "Applied", true, "newest", "2026-09-27").map(a => a.id)).toEqual(["a"]);
    expect(filterApplications(apps, "", "Withdrawn", false, "newest").map(a => a.id)).toEqual(["b"]);
  });
  it("sorts without mutating storage order and puts undated follow-ups last", () => {
    const apps = [app(), app({ id: "b", appliedDate: "2026-09-20", followUpDate: "2026-09-30" })];
    expect(filterApplications(apps, "", "All", false, "newest")[0].id).toBe("b");
    expect(filterApplications(apps, "", "All", false, "oldest")[0].id).toBe("a");
    expect(filterApplications(apps, "", "All", false, "followUp")[0].id).toBe("b");
    expect(apps[0].id).toBe("a");
  });
  it("uses local calendar components for application dates", () => {
    expect(localDate(new Date(2026, 0, 2, 0, 1))).toBe("2026-01-02");
  });
});
