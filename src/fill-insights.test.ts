import { describe, expect, it } from "vitest";
import { blankProfile, type Match } from "./model";
import { matchStatus, missingEssentials } from "./fill-insights";

describe("fill insights", () => {
  it("does not count invalid draft details as completed essentials", () => {
    const values = blankProfile().values;
    values.email = "not-an-email"; values.mobile = "abc"; values.graduationYear = "20";
    expect(missingEssentials(values)).toEqual(expect.arrayContaining(["email", "mobile", "graduationYear"]));
    values.email = "alex@example.com"; values.mobile = "+919876543210"; values.graduationYear = "2025";
    expect(missingEssentials(values)).not.toEqual(expect.arrayContaining(["email", "mobile", "graduationYear"]));
  });
  it("accepts a split name and never requires optional identity details", () => {
    const values = blankProfile().values;
    values.firstName = "Alex";
    values.lastName = "Doe";
    expect(missingEssentials(values)).not.toContain("fullName");
    expect(missingEssentials(values)).not.toContain("dob");
    values.email = "  ";
    expect(missingEssentials(values)).toContain("email");
  });
  it("distinguishes eligible, protected, and manual fields regardless of selection", () => {
    const m: Match = { id: "1", label: "Email", field: "email", value: "a@example.com", kind: "text", selected: false, sensitive: false };
    expect(matchStatus(m)).toBe("ready");
    expect(matchStatus({ ...m, blocked: true, reason: "Already filled — existing value preserved" })).toBe("preserved");
    expect(matchStatus({ ...m, blocked: true, reason: "No matching dropdown option" })).toBe("attention");
    expect(matchStatus({ ...m, sensitive: true })).toBe("attention");
    expect(matchStatus({ ...m, kind: "file" })).toBe("attention");
  });
});
