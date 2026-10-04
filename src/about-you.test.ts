import { it, expect } from "vitest";
import { blankProfile } from "./model";

it("stores and retrieves aboutYou on the profile correctly", () => {
  const profile = blankProfile("Software Engineer");
  profile.values.aboutYou = "Dedicated full-stack engineer with expertise in TypeScript and React.";

  expect(profile.values.aboutYou).toBe(
    "Dedicated full-stack engineer with expertise in TypeScript and React.",
  );
});

it("supports updating aboutYou without mutating other profile fields", () => {
  const profile = blankProfile("Engineer");
  profile.values.firstName = "Test";
  profile.values.aboutYou = "Initial intro";

  const updated = {
    ...profile,
    values: {
      ...profile.values,
      aboutYou: "Updated professional summary",
    },
  };

  expect(updated.values.firstName).toBe("Test");
  expect(updated.values.aboutYou).toBe("Updated professional summary");
});
