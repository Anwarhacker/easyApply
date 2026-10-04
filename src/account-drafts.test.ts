import { expect, it } from "vitest";
import { prepareAccounts } from "./account-drafts";

it("ignores empty cards, trims email and preserves the exact password", () => {
  const rows = [{ id: "one", email: " user@example.com ", password: "  exact password  " }, { id: "two", email: "  ", password: "" }];
  expect(prepareAccounts(rows)).toEqual([{ id: "one", email: "user@example.com", password: "  exact password  " }]);
  expect(rows[0].email).toBe(" user@example.com ");
});
it("rejects partial pairs, invalid email and duplicate IDs with actionable errors", () => {
  expect(() => prepareAccounts([{ id: "one", email: "user@example.com", password: "" }])).toThrow("both email and password");
  expect(() => prepareAccounts([{ id: "one", email: "invalid", password: "secret" }])).toThrow("check the email");
  const row = { id: "one", email: "user@example.com", password: "secret" };
  expect(() => prepareAccounts([row, row])).toThrow("unique ID");
});
