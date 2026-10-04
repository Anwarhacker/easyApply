import { accountsSchema, type SavedAccount } from "./account-vault";

export function prepareAccounts(rows: SavedAccount[]): SavedAccount[] {
  const accounts = rows.map(row => ({ ...row, email: row.email.trim() }));
  for (const [index, account] of accounts.entries()) {
    if (account.email === "" && account.password === "") continue;
    if (!account.email || !account.password) throw Error(`Account ${index + 1}: enter both email and password, or remove the card.`);
    if (!accountsSchema.element.safeParse(account).success) throw Error(`Account ${index + 1}: check the email address and field lengths.`);
  }
  const completed = accounts.filter(row => row.email !== "" || row.password !== "");
  if (!accountsSchema.safeParse(completed).success) throw Error("Keep up to 50 accounts, each with a unique ID.");
  return completed;
}
