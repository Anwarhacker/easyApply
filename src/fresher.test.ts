import { describe, it, expect } from "vitest";
import { blankProfile, profileSchema } from "./model";
import { fresherGroups, migrateProfile } from "./fresher";
import { matchField } from "./matching";
describe("fresher profiles", () => {
  it("adds a separate current location to old profiles and preserves both saved values", () => {
    const old = blankProfile();
    old.values.city = "Kalaburagi";
    delete (old.values as Partial<typeof old.values>).currentLocation;
    const migrated = profileSchema.parse(migrateProfile(old));
    expect(migrated.values.city).toBe("Kalaburagi");
    expect(migrated.values.currentLocation).toBe("");
    migrated.values.currentLocation = "Bengaluru, Karnataka";
    const saved = profileSchema.parse(migrateProfile(migrated));
    expect(saved.values.city).toBe("Kalaburagi");
    expect(saved.values.currentLocation).toBe("Bengaluru, Karnataka");
  });
  it("adds the application source field to profiles saved before it existed", () => {
    const old = blankProfile();
    old.values.email = "saved@example.com";
    delete (old.values as Partial<typeof old.values>).applicationSource;
    const migrated = profileSchema.parse(migrateProfile(old));
    expect(migrated.values.email).toBe("saved@example.com");
    expect(migrated.values.applicationSource).toBe("");
  });
  it("migrates old profiles without guessing personal or legal answers", () => {
    const old = blankProfile();
    old.values.fullName = "Saved Name";
    for (const key of Object.values(fresherGroups).flat())
      delete (old.values as Partial<typeof old.values>)[key];
    const migrated = profileSchema.parse(migrateProfile(old));
    expect(migrated.values.fullName).toBe("Saved Name");
    expect(migrated.values.workAuthorization).toBe("");
    expect(migrated.values.university).toBe("");
    expect(migrated.values.totalExperience).toBe("");
  });
  it.each([
    "tenthPercentage",
    "preDegreePercentage",
    "degreePercentage",
  ] as const)("validates %s", (key) => {
    const p = blankProfile();
    p.values[key] = "101";
    expect(profileSchema.safeParse(p).success).toBe(false);
    p.values[key] = "88.5";
    expect(profileSchema.safeParse(p).success).toBe(true);
  });
  it("accepts zero experience but rejects negative counts and impossible dates", () => {
    const p = blankProfile();
    p.values.totalExperience = "0";
    expect(profileSchema.safeParse(p).success).toBe(true);
    p.values.backlogs = "-1";
    expect(profileSchema.safeParse(p).success).toBe(false);
    p.values.backlogs = "0";
    p.values.joiningDate = "2026-02-31";
    expect(profileSchema.safeParse(p).success).toBe(false);
  });
  it.each([
    ["University", "university"],
    ["College", "college"],
    ["10th percentage", "tenthPercentage"],
    ["Diploma passing year", "preDegreeYear"],
    ["Total Years Of Experience", "totalExperience"],
    ["Notice period", "noticePeriod"],
    ["Available joining date", "joiningDate"],
    ["Project GitHub URL", "projectGithub"],
    ["Authorized to work in India", "workAuthorization"],
  ])("maps %s", (text, key) => expect(matchField([text])).toBe(key));
  it("does not fill a degree CGPA into school questions or total into relevant experience", () => {
    expect(matchField(["10th CGPA"])).toBeNull();
    expect(matchField(["Relevant years of experience"])).toBeNull();
  });
});
