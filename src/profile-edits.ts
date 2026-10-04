import { label, profileSchema, type Field, type Profile } from "./model";

/** Merge only fields edited in this window. Reject conflicting edits to the
 * same field rather than silently overwriting another window's saved value. */
export function mergeProfileEdits(current: Profile, baseline: Profile, draft: Profile): Profile {
  if (current.id !== baseline.id || current.id !== draft.id) throw Error("The profile changed. Reload it before saving.");
  const result = { ...current, values: { ...current.values } };
  const merge = (before: string, saved: string, edited: string, name: string) => {
    if (before === edited) return saved;
    if (saved !== before && saved !== edited) throw Error(`${name} changed in another window. Your draft is still here; reload the profile and review that field before saving.`);
    return edited;
  };
  result.title = merge(baseline.title, current.title, draft.title, "Profile name");
  for (const key of Object.keys(draft.values) as Field[])
    result.values[key] = merge(baseline.values[key], current.values[key], draft.values[key], label(key));
  return profileSchema.parse(result);
}
