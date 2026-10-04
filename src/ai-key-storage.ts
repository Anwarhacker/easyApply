import { z } from "zod";
// Encryption is local convenience protection, not a passphrase/OS credential vault.
// A non-exportable CryptoKey stays in extension IndexedDB; only ciphertext is in storage.local.
const RECORD = "easyapply.ai.encrypted-key";
const DB = "easyapply_ai_keys";
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("keys");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(Error("Unable to open encrypted API key storage."));
  });
}
async function keyOperation(
  action: "get" | "put" | "delete",
  value?: CryptoKey,
): Promise<CryptoKey | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(
        "keys",
        action === "get" ? "readonly" : "readwrite",
      );
      const store = tx.objectStore("keys");
      const request =
        action === "get"
          ? store.get("groq")
          : action === "put"
            ? store.put(value, "groq")
            : store.delete("groq");
      tx.oncomplete = () =>
        resolve(action === "get" ? request.result : undefined);
      tx.onerror = () =>
        reject(Error("Unable to access encrypted API key storage."));
      tx.onabort = () =>
        reject(Error("Encrypted API key storage was interrupted."));
    });
  } finally {
    db.close();
  }
}
const aad = new TextEncoder().encode("easyapply:groq:key:v1");
export async function persistAPIKey(apiKey: string) {
  await chrome.storage.local.setAccessLevel({
    accessLevel: "TRUSTED_CONTEXTS",
  });
  let key = await keyOperation("get");
  if (!key) {
    key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    await keyOperation("put", key);
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad },
    key,
    new TextEncoder().encode(apiKey),
  );
  await chrome.storage.local.set({
    [RECORD]: {
      version: 1,
      iv: Array.from(iv),
      ciphertext: Array.from(new Uint8Array(ciphertext)),
      consent: true,
    },
  });
}
export async function readPersistentAPIKey(): Promise<string | null> {
  await chrome.storage.local.setAccessLevel({
    accessLevel: "TRUSTED_CONTEXTS",
  });
  const raw = (await chrome.storage.local.get(RECORD))[RECORD];
  if (!raw) return null;
  try {
    const byte = z.number().int().min(0).max(255);
    const record = z.object({ version: z.literal(1), consent: z.literal(true), iv: z.array(byte).length(12), ciphertext: z.array(byte).min(16).max(400) }).strict().parse(raw);
    const key = await keyOperation("get");
    if (!key) throw Error();
    const clear = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(record.iv), additionalData: aad },
      key,
      new Uint8Array(record.ciphertext),
    );
    return new TextDecoder().decode(clear);
  } catch {
    throw Error(
      "The saved API key could not be decrypted. Clear the saved key and enter it again.",
    );
  }
}
export async function clearPersistentAPIKey() {
  await chrome.storage.local.remove(RECORD);
  await keyOperation("delete");
}
export async function hasPersistentAPIKey() {
  return Boolean((await chrome.storage.local.get(RECORD))[RECORD]);
}
