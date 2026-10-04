import { it, expect } from "vitest";
import { applicationSchema, secureIdentityPage, safeUrl } from "./security";
it("requires secure transport for identity on remote sites", () => {
  expect(secureIdentityPage("https://jobs.example")).toBe(true);
  expect(secureIdentityPage("http://jobs.example")).toBe(false);
  expect(secureIdentityPage("http://127.0.0.1:4174")).toBe(true);
});
it("rejects executable and credential-bearing links", () => {
  expect(safeUrl("javascript:alert(1)")).toBe(false);
  expect(safeUrl("https://name:secret@example.com")).toBe(false);
  expect(safeUrl("https://example.com/jobs")).toBe(true);
});
it("validates tracker records at the storage boundary", () => {
  expect(
    applicationSchema.safeParse({
      id: "x",
      company: "",
      position: "Developer",
      url: "",
      appliedDate: "yesterday",
      status: "random",
      resume: "",
      notes: "",
    }).success,
  ).toBe(false);
});
