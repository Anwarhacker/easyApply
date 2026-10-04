import { z } from "zod";

export const ACCOUNT_VAULT = "account-credentials:v1";
export const accountsSchema = z.array(z.object({ id: z.string().min(1), email: z.email().max(254), password: z.string().min(1).max(1024) })).max(50).refine(rows => new Set(rows.map(row => row.id)).size === rows.length, "Duplicate account IDs");
export type SavedAccount = z.infer<typeof accountsSchema>[number];
const bytes = z.array(z.number().int().min(0).max(255));
const envelopeSchema = z.object({ version: z.literal(1), salt: bytes.length(16), iv: bytes.length(12), data: bytes.min(16).max(300000), revision: z.string() });
type Envelope = z.infer<typeof envelopeSchema>;
export type AccountSession = { key: CryptoKey; salt: number[]; revision: string | null };
const aad = new TextEncoder().encode(ACCOUNT_VAULT);
async function derive(passphrase: string, salt: number[]) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: new Uint8Array(salt), iterations: 310000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export async function openAccounts(passphrase: string): Promise<{ session: AccountSession; accounts: SavedAccount[] }> {
  const saved = (await chrome.storage.local.get(ACCOUNT_VAULT))[ACCOUNT_VAULT];
  if (!saved) {
    if (passphrase.length < 12) throw Error("Use a vault passphrase with at least 12 characters.");
    const salt = [...crypto.getRandomValues(new Uint8Array(16))];
    return { session: { key: await derive(passphrase, salt), salt, revision: null }, accounts: [] };
  }
  try {
    const record = envelopeSchema.parse(saved);
    const key = await derive(passphrase, record.salt);
    const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(record.iv), additionalData: aad }, key, new Uint8Array(record.data));
    return { session: { key, salt: record.salt, revision: record.revision }, accounts: accountsSchema.parse(JSON.parse(new TextDecoder().decode(raw))) };
  } catch { throw Error("Unable to unlock saved accounts. Check your vault passphrase."); }
}
export async function saveAccounts(session: AccountSession, accounts: SavedAccount[]): Promise<AccountSession> {
  const valid = accountsSchema.parse(accounts);
  return navigator.locks.request(ACCOUNT_VAULT, async () => {
    const saved = (await chrome.storage.local.get(ACCOUNT_VAULT))[ACCOUNT_VAULT];
    if ((saved ? envelopeSchema.parse(saved).revision : null) !== session.revision) throw Error("Accounts changed in another window. Copy any unsaved edits, then lock and unlock to load the latest version.");
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, session.key, new TextEncoder().encode(JSON.stringify(valid)));
    const revision = crypto.randomUUID();
    await chrome.storage.local.set({ [ACCOUNT_VAULT]: { version: 1, salt: session.salt, iv: [...iv], data: [...new Uint8Array(data)], revision } satisfies Envelope });
    return { ...session, revision };
  });
}
