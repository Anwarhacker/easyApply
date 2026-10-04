export const declineDisclosure = "I do not wish to self-identify";
export const disclosureOptions: Record<string, string[]> = {
  voluntaryGender: [declineDisclosure, "Male", "Female", "Non-binary"],
  raceEthnicity: [declineDisclosure, "Hispanic or Latino", "White (not Hispanic or Latino)", "Black or African American (not Hispanic or Latino)", "Asian (not Hispanic or Latino)", "American Indian or Alaska Native (not Hispanic or Latino)", "Native Hawaiian or Other Pacific Islander (not Hispanic or Latino)", "Two or more races (not Hispanic or Latino)"],
  veteranStatus: [declineDisclosure, "I am a protected veteran", "I am not a protected veteran"],
  disabilityStatus: [declineDisclosure, "Yes, I have a disability, or have had one in the past", "No, I do not have a disability and have not had one in the past"],
};
export const disclosureKeys = ["disclosuresEnabled", ...Object.keys(disclosureOptions)];
export const disclosureLabels: Record<string, string> = {
  voluntaryGender: "Gender — voluntary disclosure", raceEthnicity: "Race / ethnicity", veteranStatus: "Protected veteran status", disabilityStatus: "Disability status", disclosuresEnabled: "Enable user-approved disclosure defaults",
};
export const isDisclosureField = (field: string | null | undefined) => !!field && ["gender", "raceEthnicity", "veteranStatus", "disabilityStatus"].includes(field);
const clean = (s: string) => s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
/** Deliberately no substring, yes/no, or numeric-code matching for sensitive answers. */
export function disclosureAnswerMatches(answer: string, text: string): boolean {
  const actual = clean(text);
  if (clean(answer) === actual) return true;
  if (answer === declineDisclosure) return ["prefer not to say", "prefer not to answer", "decline to answer", "decline to self identify", "i dont wish to answer", "i do not wish to answer", "i do not want to answer", "i dont wish to self identify"].includes(actual);
  return false;
}
export function approvedDisclosureValue(field: string | null, values: Record<string, string>): string {
  if (values.disclosuresEnabled !== "yes" || !field) return "";
  const key = field === "gender" ? "voluntaryGender" : field;
  return disclosureOptions[key]?.includes(values[key]) ? values[key] : "";
}
