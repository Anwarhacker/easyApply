import { it, expect } from "vitest";
import { validInputSyntax } from "./input-compatibility";
it.each([
  "number",
  "range",
  "date",
  "month",
  "week",
  "time",
  "datetime-local",
  "color",
])("rejects Not applicable for %s before assigning it", (type) =>
  expect(validInputSyntax(type, "Not applicable")).toBe(false),
);
it.each(["0", "2.5", "-1", "1e3"])("accepts numeric syntax %s", (value) =>
  expect(validInputSyntax("number", value)).toBe(true),
);
it.each(["NaN", "Infinity", "5 years", "₹50000", "1,000", "1."])(
  "rejects nonnumeric %s",
  (value) => expect(validInputSyntax("number", value)).toBe(false),
);
it("validates real dates and preserves free text", () => {
  expect(validInputSyntax("date", "2024-02-29")).toBe(true);
  expect(validInputSyntax("date", "2025-02-29")).toBe(false);
  expect(validInputSyntax("time", "25:00")).toBe(false);
  expect(validInputSyntax("text", "Not applicable")).toBe(true);
});
