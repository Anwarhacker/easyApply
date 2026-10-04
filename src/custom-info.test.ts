import { it, expect, vi, afterEach } from "vitest";
import {
  customEntrySchema,
  readCustomEntries,
  changeCustomEntry,
} from "./custom-info";
import { profileText } from "./saved-info";
import { blankProfile } from "./model";
afterEach(() => vi.unstubAllGlobals());
it("preserves entries on duplicate titles or corrupt stored data", async () => {
  const store: Record<string, unknown> = { profiles: [{ id: "profile" }] };
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: store[key] }),
        set: async (data: Record<string, unknown>) => {
          Object.assign(store, data);
        },
      },
    },
  });
  vi.stubGlobal("navigator", {
    locks: {
      request: async (_name: string, action: () => Promise<unknown>) =>
        action(),
    },
  });
  await changeCustomEntry("profile", { save: entry });
  expect(await readCustomEntries("profile")).toEqual([entry]);
  await expect(
    changeCustomEntry("profile", {
      save: { ...entry, id: "22345678-1234-4234-8234-123456789012" },
    }),
  ).rejects.toThrow("already exists");
  expect(await readCustomEntries("profile")).toEqual([entry]);
  store["custom:profile"] = "corrupted";
  await expect(changeCustomEntry("profile", { save: entry })).rejects.toThrow(
    "could not be read",
  );
  expect(store["custom:profile"]).toBe("corrupted");
});
const entry = {
  id: "12345678-1234-4234-8234-123456789012",
  title: "Interview availability",
  value: "Weekdays after 4 PM",
};
it("validates and exports custom titles and values", () => {
  expect(
    customEntrySchema.parse({ ...entry, title: " Availability " }).title,
  ).toBe("Availability");
  expect(profileText(blankProfile(), [entry])).toContain(
    "Interview availability: Weekdays after 4 PM",
  );
});
it("rejects empty and oversized entries", () => {
  for (const change of [
    { title: " " },
    { value: " " },
    { title: "a".repeat(101) },
    { value: "a".repeat(10001) },
  ])
    expect(customEntrySchema.safeParse({ ...entry, ...change }).success).toBe(
      false,
    );
});
it("rejects credential titles and identity numbers", () => {
  for (const title of [
    "Password",
    "Aadhaar",
    "PAN",
    "UPI PIN",
    "Bank account",
    "OTP",
  ])
    expect(customEntrySchema.safeParse({ ...entry, title }).success).toBe(
      false,
    );
  for (const value of ["ABCDE1234F", "1234 5678 9012"])
    expect(customEntrySchema.safeParse({ ...entry, value }).success).toBe(
      false,
    );
});
