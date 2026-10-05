import { profileSchema, type Match, type Profile, type Field } from "./model";
import { legalFields } from "./fresher";

export const essentials: Field[] = ["fullName", "email", "mobile", "city", "state", "country", "postalCode", "degree", "college", "graduationYear"];
export function missingEssentials(values: Profile["values"]) {
  return essentials.filter(key => key === "fullName"
    ? !(values.fullName.trim() || (values.firstName.trim() && values.lastName.trim()))
    : !values[key].trim() || !profileSchema.shape.values.shape[key].safeParse(values[key]).success);
}
export type MatchStatus = "ready" | "attention" | "preserved";
export function matchStatus(match: Match): MatchStatus {
  if (match.blocked && match.reason?.startsWith("Already filled")) return "preserved";
  if (match.confidence !== undefined && match.confidence < 70) return "attention";
  if (legalFields.includes(match.field ?? "")) return "attention";
  if (!match.blocked && (match.field || match.remembered) && match.value && match.kind !== "file" && !match.sensitive) return "ready";
  return "attention";
}
