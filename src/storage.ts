import type { Profile, Application, Sensitive } from "./model";
import { profileSchema } from "./model";
import { applicationSchema, sensitiveSchema } from "./security";
import { z } from "zod";
import { migrateProfile } from "./fresher";
import { mergeProfileEdits } from "./profile-edits";
import { mergeApplicationChanges, sameApplication } from "./application-tracker";
const profilesSchema = z.array(profileSchema).max(100).refine(profiles => new Set(profiles.map(p => p.id)).size === profiles.length, "Profile IDs must be unique");
export async function restrictStorage() {
  await chrome.storage.local.setAccessLevel({
    accessLevel: "TRUSTED_CONTEXTS",
  });
}
export async function readData(): Promise<{
  profiles: Profile[];
  applications: Application[];
  activeProfileId: string;
}> {
  const d = await chrome.storage.local.get(["profiles", "applications", "activeProfileId"]);
  const profiles = profilesSchema
    .safeParse(
      Array.isArray(d.profiles)
        ? d.profiles.map(migrateProfile)
        : (d.profiles ?? []),
    );
  const applications = z
    .array(applicationSchema)
    .max(5000)
    .safeParse(d.applications ?? []);
  if (!profiles.success || !applications.success) {
    const diagnostics = [
      !profiles.success ? `profiles (${profiles.error.issues.slice(0, 3).map(issue => issue.path.join(".") || issue.message).join(", ")})` : "",
      !applications.success ? `applications (${applications.error.issues.slice(0, 3).map(issue => issue.path.join(".") || issue.message).join(", ")})` : "",
    ].filter(Boolean).join("; ");
    throw Error(
      `Saved data could not be validated${diagnostics ? `: ${diagnostics}` : ""}. It has not been changed. Reload easyApply; if this persists, keep the stored data for recovery.`,
    );
  }
  return {
    profiles: profiles.data,
    applications: applications.data,
    // Only legacy stores without a preference default to the first profile.
    activeProfileId: d.activeProfileId === undefined
      ? (profiles.data[0]?.id ?? "")
      : (profiles.data.find((p) => p.id === d.activeProfileId)?.id ?? ""),
  };
}
export async function saveProfiles(profiles: Profile[], activeProfileId?: string) {
  if (activeProfileId && !profiles.some((p) => p.id === activeProfileId))
    throw Error("Select a saved profile.");
  await chrome.storage.local.set({
    profiles: profilesSchema.parse(profiles),
    ...(activeProfileId !== undefined ? { activeProfileId } : {}),
  });
}
export async function patchProfileValues(baseline: Profile, values: Partial<Profile["values"]>) {
  return navigator.locks.request("easyapply-field-memory", async () => {
    const data = await readData();
    const current = data.profiles.find(p => p.id === baseline.id);
    if (!current) throw Error("This profile was deleted. Create or select a saved profile.");
    const nextProfile = mergeProfileEdits(current, baseline, { ...baseline, values: { ...baseline.values, ...values } });
    const profiles = data.profiles.map(p => p.id === baseline.id ? nextProfile : p);
    await saveProfiles(profiles);
    return profiles;
  });
}
export async function saveActiveProfile(id: string) {
  const { profiles } = await readData();
  if (id && !profiles.some((p) => p.id === id))
    throw Error("This profile is no longer available. Choose a saved profile.");
  await chrome.storage.local.set({ activeProfileId: id });
}
export async function saveApplications(applications: Application[]) {
  await chrome.storage.local.set({
    applications: z.array(applicationSchema).max(5000).parse(applications),
  });
}
export async function commitApplicationChanges(baseline: Application[], desired: Application[]) {
  return navigator.locks.request("easyapply-applications", async () => {
    const { applications } = await readData();
    const merged = mergeApplicationChanges(applications, baseline, desired);
    await saveApplications(merged);
    return merged;
  });
}
export async function recordApplication(value: unknown) {
  const app = applicationSchema.parse(value);
  return navigator.locks.request("easyapply-applications", async () => {
    const { applications } = await readData();
    const duplicate = applications.some(saved => sameApplication(saved, app));
    if (!duplicate && applications.some(saved => saved.id === app.id)) throw Error("An application with this ID already exists.");
    if (!duplicate) await saveApplications([app, ...applications]);
    return { success: true, duplicate };
  });
}
const bytes = z.array(z.number().int().min(0).max(255));
const vaultSchema = z.object({
  version: z.literal(2).optional(),
  salt: bytes.length(16),
  iv: bytes.length(12),
  data: bytes.min(16).max(4096),
});
type Vault = z.infer<typeof vaultSchema>;
async function key(pass: string, salt: Uint8Array<ArrayBuffer>) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pass),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function seal(id: string, pass: string, value: Sensitive) {
  value = sensitiveSchema.parse(value);
  if (pass.length < 12)
    throw Error("Use a vault passphrase with at least 12 characters.");
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  // Keep this legacy AAD namespace stable across branding changes.
  const data = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode("ApplyEase:" + id),
    },
    await key(pass, salt),
    new TextEncoder().encode(JSON.stringify(value)),
  );
  await chrome.storage.local.set({
    ["vault:" + id]: {
      version: 2,
      salt: [...salt],
      iv: [...iv],
      data: [...new Uint8Array(data)],
    } satisfies Vault,
  });
}
export async function unlock(id: string, pass: string): Promise<Sensitive> {
  const k = "vault:" + id;
  const saved = (await chrome.storage.local.get(k))[k];
  if (!saved) throw Error("No encrypted identity saved for this profile.");
  try {
    const d = vaultSchema.parse(saved);
    const raw = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(d.iv),
        ...(d.version === 2
          ? { additionalData: new TextEncoder().encode("ApplyEase:" + id) }
          : {}),
      },
      await key(pass, new Uint8Array(d.salt)),
      new Uint8Array(d.data),
    );
    return sensitiveSchema.parse(JSON.parse(new TextDecoder().decode(raw)));
  } catch {
    throw Error("Unable to unlock identity. Check your vault passphrase.");
  }
}
