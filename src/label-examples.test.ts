import { it, expect } from "vitest";
import { groups } from "./model";
import { labelExamples } from "./label-examples";
import { matchField } from "./matching";

for (const field of Object.values(groups).flat()) {
  it(`recognizes displayed alternatives and your-prefix for ${field}`, () => {
    const examples = labelExamples(field);
    if (!examples.length) { expect(["disclosuresEnabled", "voluntaryGender"]).toContain(field); return; }
    for (const value of examples) {
      expect(matchField([value])).toBe(field);
      expect(
        matchField([/^your /i.test(value) ? value : `Your ${value}`]),
      ).toBe(field);
    }
    expect(matchField([examples.join(" / ")])).toBe(field);
  });
}
