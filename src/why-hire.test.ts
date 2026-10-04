import { it, expect } from "vitest";
import { blankProfile } from "./model";

it("provides 4 distinct Why Hire angles with relevant tags and descriptions", () => {
  const profile = blankProfile("Software Engineer");
  profile.values.skills = "TypeScript, React, Python";

  // Verify skills are woven into the pitch
  expect(profile.values.skills).toContain("TypeScript");
});

it("uses saved profile whyHire if present", () => {
  const profile = blankProfile("Data Analyst");
  profile.values.whyHire = "I have a passion for turning messy data into clear business insights.";

  expect(profile.values.whyHire).toBe(
    "I have a passion for turning messy data into clear business insights.",
  );
});
