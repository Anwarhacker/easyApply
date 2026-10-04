import { it, expect, vi } from "vitest";
import { seal, unlock, readData, restrictStorage } from "./storage";
it("encrypts identity separately and rejects the wrong passphrase", async () => {
  const store: Record<string, unknown> = {};
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        set: async (v: Record<string, unknown>) => Object.assign(store, v),
        get: async (k: string) => ({ [k]: store[k] }),
      },
    },
  });
  const identity = { pan: "ABCDE1234F", aadhaar: "123456789012" };
  await seal("profile", "a separate vault phrase", identity);
  expect(JSON.stringify(store)).not.toContain(identity.pan);
  expect(JSON.stringify(store)).not.toContain(identity.aadhaar);
  expect(await unlock("profile", "a separate vault phrase")).toEqual(identity);
  store["vault:other"] = store["vault:profile"];
  await expect(unlock("other", "a separate vault phrase")).rejects.toThrow(
    "Unable to unlock",
  );
  const record = store["vault:profile"] as { data: number[] };
  record.data[0] ^= 1;
  await expect(unlock("profile", "a separate vault phrase")).rejects.toThrow(
    "Unable to unlock",
  );
  await expect(unlock("profile", "wrong phrase")).rejects.toThrow(
    "Unable to unlock",
  );
  await expect(seal("profile", "short", identity)).rejects.toThrow(
    "12 characters",
  );
  vi.unstubAllGlobals();
});
it("rejects corrupted saved data without overwriting it", async () => {
  const set = vi.fn();
  vi.stubGlobal("chrome", {
    storage: {
      local: { get: async () => ({ profiles: [{ id: "broken" }] }), set },
    },
  });
  await expect(readData()).rejects.toThrow("not been changed");
  expect(set).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
it("restricts storage access to extension contexts", async () => {
  const setAccessLevel = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("chrome", { storage: { local: { setAccessLevel } } });
  await restrictStorage();
  expect(setAccessLevel).toHaveBeenCalledWith({
    accessLevel: "TRUSTED_CONTEXTS",
  });
  vi.unstubAllGlobals();
});
it("keeps previously saved legacy vaults readable", async () => {
  const pass = "legacy vault test phrase",
    salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pass),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const identity = { pan: "ABCDE1234F", aadhaar: "" };
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(identity)),
  );
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async () => ({
          "vault:legacy": {
            salt: [...salt],
            iv: [...iv],
            data: [...new Uint8Array(encrypted)],
          },
        }),
      },
    },
  });
  expect(await unlock("legacy", pass)).toEqual(identity);
  vi.unstubAllGlobals();
});
