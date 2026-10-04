import { z } from "zod";

export const customEntrySchema = z.object({
  id: z.uuid(),
  title: z
    .string()
    .trim()
    .min(1, "Enter a title.")
    .max(100)
    .refine(
      (value) =>
        !/password|passphrase|\botp\b|\bupi\b|\bpin\b|\bcvv\b|\bpan\b|aadhaar|aadhar|bank|credit card|debit card/i.test(
          value,
        ),
      "Use ordinary application information only. Identity numbers belong in the encrypted vault; credentials must never be saved.",
    ),
  value: z
    .string()
    .trim()
    .min(1, "Enter a value.")
    .max(10000)
    .refine(
      (value) =>
        !/\b[A-Z]{5}\d{4}[A-Z]\b/i.test(value) &&
        !/\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/.test(value),
      "Store PAN and Aadhaar only in the encrypted vault.",
    ),
});
export type CustomEntry = z.infer<typeof customEntrySchema>;
const entriesSchema = z.array(customEntrySchema).max(100);
export async function readCustomEntries(
  profileId: string,
): Promise<CustomEntry[]> {
  if (!profileId) return [];
  const key = `custom:${profileId}`;
  const data = await chrome.storage.local.get(key);
  const result = entriesSchema.safeParse(data[key] ?? []);
  if (!result.success)
    throw new Error(
      "Saved entries could not be read. Existing data has not been changed.",
    );
  return result.data;
}
export async function changeCustomEntry(
  profileId: string,
  change: { save: CustomEntry } | { remove: string },
) {
  return navigator.locks.request(`easyApply-custom:${profileId}`, async () => {
    const data = await chrome.storage.local.get("profiles");
    if (
      !Array.isArray(data.profiles) ||
      !data.profiles.some((p) => p.id === profileId)
    )
      throw new Error("This profile no longer exists. Reopen Saved info.");
    const entries = await readCustomEntries(profileId);
    let next: CustomEntry[];
    if ("save" in change) {
      const result = customEntrySchema.safeParse(change.save);
      if (!result.success) throw new Error(result.error.issues[0].message);
      const entry = result.data;
      if (
        entries.some(
          (e) =>
            e.id !== entry.id &&
            e.title.toLowerCase() === entry.title.toLowerCase(),
        )
      )
        throw new Error(
          "An entry with this title already exists. Edit it or use another title.",
        );
      next = entries.some((e) => e.id === entry.id)
        ? entries.map((e) => (e.id === entry.id ? entry : e))
        : [...entries, entry];
    } else next = entries.filter((e) => e.id !== change.remove);
    if (next.length > 100)
      throw new Error("You can save up to 100 custom entries per profile.");
    await chrome.storage.local.set({ [`custom:${profileId}`]: next });
    return next;
  });
}
