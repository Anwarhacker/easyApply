import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { blankProfile } from "./model";
import { readData, saveActiveProfile, saveProfiles } from "./storage";

let store: Record<string, unknown>;
beforeEach(() => {
  store = { profiles: [blankProfile("First"), blankProfile("Second")] };
  vi.stubGlobal("chrome", { storage: { local: {
    get: async () => store,
    set: async (data: Record<string, unknown>) => { Object.assign(store, data); },
  } } });
});
afterEach(() => vi.unstubAllGlobals());
it("rejects duplicate IDs rather than letting two roles share one resume identity", async () => {
  const profile = blankProfile("First");
  await expect(saveProfiles([profile, { ...profile, title: "Second" }])).rejects.toThrow();
  store.profiles = [profile, { ...profile, title: "Second" }];
  await expect(readData()).rejects.toThrow("could not be validated");
});
it("retains the second profile selection across reads and edits", async () => {
  const { profiles } = await readData();
  await saveActiveProfile(profiles[1].id);
  expect((await readData()).activeProfileId).toBe(profiles[1].id);
  profiles[1].title = "Renamed";
  await saveProfiles(profiles);
  expect((await readData()).activeProfileId).toBe(profiles[1].id);
});
it("migrates legacy selection but never falls back after deselection or deletion", async () => {
  const { profiles, activeProfileId } = await readData();
  expect(activeProfileId).toBe(profiles[0].id);
  await saveActiveProfile("");
  expect((await readData()).activeProfileId).toBe("");
  await saveActiveProfile(profiles[1].id);
  await saveProfiles([profiles[0]]);
  expect((await readData()).activeProfileId).toBe("");
});
it("rejects a missing profile and saves a new profile with its selection together", async () => {
  await expect(saveActiveProfile("missing")).rejects.toThrow("no longer available");
  const profile = blankProfile("New");
  await saveProfiles([profile], profile.id);
  expect((await readData()).activeProfileId).toBe(profile.id);
});
