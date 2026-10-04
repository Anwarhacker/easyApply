import { aliases } from "./matching";
import { alternateLabels } from "./alternate-labels";
import type { Field } from "./model";

export function labelExamples(field: Field): string[] {
  if (field === "mobile")
    return [
      "Phone number",
      "Mobile number",
      "Contact number",
      "Telephone",
      "Cell phone",
    ];
  if (field === "email") return ["Email", "Email address", "Email ID"];
  if (field === "currentSalary")
    return ["Current salary", "Your current salary", "Current CTC"];
  const candidates = [...aliases[field], ...(alternateLabels[field] ?? [])];
  if (!candidates.length) return [];
  const unique = [...new Set(candidates)].slice(0, 3);
  if (unique.length < 3) unique.push(`your ${unique[0]}`);
  return unique.map((value) => value.charAt(0).toUpperCase() + value.slice(1));
}
