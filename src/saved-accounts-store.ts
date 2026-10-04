import { accountsSchema, type SavedAccount } from "./account-vault";
import { z } from "zod";
import { prepareAccounts } from "./account-drafts";

const STORE = "saved-accounts:v2";
const bytes = z.array(z.number().int().min(0).max(255));
const recordSchema = z.object({ revision: z.string().min(1), iv: bytes.length(12), data: bytes.min(16).max(300000) });
async function deviceKey(create = false): Promise<CryptoKey> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("easyapply-account-key", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("keys");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => {
      const request = db.transaction("keys").objectStore("keys").get("device");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (existing) return existing;
    if (!create) throw Error("The device encryption key is missing. Saved accounts have not been changed.");
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("keys", "readwrite");
      tx.objectStore("keys").put(key, "device");
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
    return key;
  } finally { db.close(); }
}
export async function loadSavedAccounts(): Promise<{ accounts: SavedAccount[]; revision: string | null }> {
  return navigator.locks.request(STORE, async () => {
    const stored = (await chrome.storage.local.get(STORE))[STORE];
    const saved = stored === undefined ? undefined : recordSchema.parse(stored);
    if (!saved) return { accounts: [], revision: null };
    const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(saved.iv) }, await deviceKey(), new Uint8Array(saved.data));
    return { accounts: accountsSchema.parse(JSON.parse(new TextDecoder().decode(raw))), revision: saved.revision };
  });
}
export async function storeSavedAccounts(accounts: SavedAccount[], baseline: string | null): Promise<string> {
  const valid = prepareAccounts(accounts);
  return navigator.locks.request(STORE, async () => {
    const stored = (await chrome.storage.local.get(STORE))[STORE];
    const saved = stored === undefined ? undefined : recordSchema.parse(stored);
    if ((saved?.revision ?? null) !== baseline) throw Error("Accounts changed in another window. Reopen this window before editing again.");
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await deviceKey(!saved), new TextEncoder().encode(JSON.stringify(valid)));
    const revision = crypto.randomUUID();
    await chrome.storage.local.set({ [STORE]: { revision, iv: [...iv], data: [...new Uint8Array(data)] } });
    return revision;
  });
}
