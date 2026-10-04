import { describe, expect, it } from "vitest";
import { approvedDisclosureValue, declineDisclosure, disclosureAnswerMatches, disclosureKeys } from "./disclosures";
import { blankProfile, profileSchema } from "./model";
import { migrateProfile } from "./fresher";
import { careerFacts, classifyQuestion } from "./ai";

describe("voluntary disclosures", () => {
  it("migrates existing profiles without granting consent or copying gender", () => {
    const old = blankProfile(); old.values.gender = "Female";
    const values = old.values as Record<string, string>;
    disclosureKeys.forEach(key => delete values[key]);
    const migrated = profileSchema.parse(migrateProfile(old));
    expect(migrated.values.disclosuresEnabled).toBe("");
    expect(migrated.values.voluntaryGender).toBe("");
    expect(approvedDisclosureValue("gender", migrated.values)).toBe("");
  });
  it("requires opt-in and an explicitly allowed answer", () => {
    const values = {disclosuresEnabled:"", veteranStatus:declineDisclosure};
    expect(approvedDisclosureValue("veteranStatus", values)).toBe("");
    values.disclosuresEnabled = "yes";
    expect(approvedDisclosureValue("veteranStatus", values)).toBe(declineDisclosure);
    values.veteranStatus = "Yes";
    expect(approvedDisclosureValue("veteranStatus", values)).toBe("");
  });
  it("recognizes decline wording without fuzzy status matches", () => {
    expect(disclosureAnswerMatches(declineDisclosure, "Prefer not to answer")).toBe(true);
    expect(disclosureAnswerMatches(declineDisclosure, "I do not want to answer")).toBe(true);
    expect(disclosureAnswerMatches("I am a protected veteran", "I am not a protected veteran")).toBe(false);
    expect(disclosureAnswerMatches("I am a protected veteran", "Yes")).toBe(false);
    expect(disclosureAnswerMatches("Male", "Female")).toBe(false);
  });
  it("validates options and keeps answers out of AI career facts", () => {
    const profile = blankProfile(); profile.values.disclosuresEnabled = "yes";
    profile.values.disabilityStatus = declineDisclosure;
    expect(profileSchema.safeParse(profile).success).toBe(true);
    expect(careerFacts(profile.values)).not.toHaveProperty("disabilityStatus");
    profile.values.disabilityStatus = "made up";
    expect(profileSchema.safeParse(profile).success).toBe(false);
  });
  it("does not ask AI to answer diversity questions", () => {
    for (const question of ["Describe your race", "Tell us about your disability", "What is your veteran status?"]) expect(classifyQuestion(question)).toBeNull();
  });
});
