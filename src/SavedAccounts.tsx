import { prepareAccounts } from "./account-drafts";
import { useEffect, useRef, useState } from "react";
import type { SavedAccount } from "./account-vault";
import { loadSavedAccounts, storeSavedAccounts } from "./saved-accounts-store";

export function SavedAccounts() {
  const [viewing, setViewing] = useState(false);
  const [saved, setSaved] = useState<SavedAccount[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [visible, setVisible] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const working = useRef(false);
  const dirty = useRef(false);
  const copyPending = useRef(false);
  const [copying, setCopying] = useState(false);
  const generation = useRef(0);
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    void loadSavedAccounts().then(data => {
      if (cancelled) return;
      setAccounts(data.accounts.length ? data.accounts : [{ id: crypto.randomUUID(), email: "", password: "" }]);
      setRevision(data.revision); setLoaded(true);
    }).catch(() => { if (!cancelled) setError("Could not load saved accounts. Reopen the extension to retry."); });
    const hide = () => setVisible([]);
    window.addEventListener("blur", hide);
    document.addEventListener("visibilitychange", hide);
    return () => { cancelled = true; generation.current++; window.removeEventListener("blur", hide); document.removeEventListener("visibilitychange", hide); };
  }, []);
  async function run(action: () => Promise<void>) {
    if (working.current) return;
    working.current = true; setBusy(true); setError(""); setMessage("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Could not save accounts."); }
    finally { working.current = false; setBusy(false); }
  }
  async function copy(value: string, label: string) {
    if (copyPending.current) return;
    copyPending.current = true; setCopying(true);
    setError(""); setMessage("");
    try { await navigator.clipboard.writeText(value); setMessage(`${label} copied.`); }
    catch { setError("Clipboard access failed. Use the eye button for a password, then select the field text and copy manually."); }
    finally { copyPending.current = false; setCopying(false); }
  }
  const shown = expanded ? accounts : saved;
  const edit = (id: string, key: "email" | "password", value: string) => { dirty.current = true; setMessage(""); setAccounts(rows => rows.map(account => account.id === id ? { ...account, [key]: value } : account)); };
  return <section className="saved-accounts" aria-label="Saved login accounts">
    <div className="accounts-bar">
    <button className="accounts-toggle" disabled={busy || copying} type="button" role="switch" aria-label="Show saved accounts" aria-checked={expanded} aria-expanded={expanded} aria-controls="saved-accounts-content" onClick={() => { setExpanded(value => !value); setViewing(false); setVisible([]); setMessage(""); setError(""); }}>
      <strong>Saved accounts</strong><span className="accounts-switch" aria-hidden="true"><span /></span>
    </button>
    {!expanded && <button className="accounts-view" type="button" disabled={busy || copying} aria-expanded={viewing} aria-controls="saved-accounts-content" onClick={() => {
      if (viewing) { setViewing(false); setVisible([]); setMessage(""); setError(""); return; }
      void run(async () => {
        const data = await loadSavedAccounts(); setSaved(data.accounts);
        if (!dirty.current) { setAccounts(data.accounts.length ? data.accounts : [{ id: crypto.randomUUID(), email: "", password: "" }]); setRevision(data.revision); }
        setLoaded(true); setVisible([]); setViewing(true);
      });
    }}>{viewing ? "Close" : "View"}</button>}
    </div>
    <div id="saved-accounts-content" hidden={!expanded && !viewing}>
    {!loaded ? <p role="status">Loading accounts…</p> : <form noValidate onSubmit={event => {
      event.preventDefault();
      if (!expanded) return;
      void run(async () => {
        const token = generation.current;
        const prepared = prepareAccounts(accounts);
        const next = await storeSavedAccounts(prepared, revision);
        if (generation.current !== token) return;
        dirty.current = false; setAccounts(prepared); setSaved(prepared);
        setRevision(next); setVisible([]); setMessage("Accounts saved on this device.");
      });
    }}>
      <div className="account-card-row" ref={row} tabIndex={0} role="group" aria-label="Email and password cards; scroll horizontally for more accounts">
        {shown.map((account, index) => <article className="account-card" key={account.id}>
          <div className="account-card-title"><span>Account {index + 1}</span>{expanded && <button type="button" disabled={busy} aria-label={`Remove account ${index + 1}`} onClick={() => { dirty.current = true; setAccounts(rows => rows.filter(item => item.id !== account.id)); setVisible(ids => ids.filter(id => id !== account.id)); setMessage("Account removed from draft. Save accounts to confirm."); }}>Remove</button>}</div>
          <div className="account-password account-email"><input readOnly={!expanded} type="email" aria-label={`Email for account ${index + 1}`} placeholder="Email" autoComplete="off" required maxLength={254} disabled={busy} value={account.email} onChange={event => edit(account.id, "email", event.target.value)} />
            <button type="button" disabled={busy || copying || !account.email} aria-label={`Copy email for account ${index + 1}`} onClick={() => void copy(account.email, "Email")}>Copy</button>
          </div>
          <div className="account-password"><input readOnly={!expanded} type={visible.includes(account.id) ? "text" : "password"} aria-label={`Password for account ${index + 1}`} placeholder="Password" autoComplete="new-password" required maxLength={1024} disabled={busy} value={account.password} onChange={event => edit(account.id, "password", event.target.value)} />
            <button type="button" disabled={busy || copying || !account.password} aria-label={`Copy password for account ${index + 1}`} onClick={() => void copy(account.password, "Password")}>Copy</button>
            <button type="button" disabled={busy} aria-label={`${visible.includes(account.id) ? "Hide" : "Show"} password for account ${index + 1}`} aria-pressed={visible.includes(account.id)} onClick={() => setVisible(ids => ids.includes(account.id) ? ids.filter(id => id !== account.id) : [...ids, account.id])}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{visible.includes(account.id) && <path d="m3 3 18 18"/>}</svg></button>
          </div>
        </article>)}
        {expanded && <button className="add-account-card" type="button" disabled={busy || accounts.length >= 50} onClick={() => { dirty.current = true; setAccounts(rows => [...rows, { id: crypto.randomUUID(), email: "", password: "" }]); setMessage(""); requestAnimationFrame(() => row.current?.scrollTo({ left: row.current.scrollWidth, behavior: "smooth" })); }}>+ Add account</button>}
      </div>
      {!expanded && !shown.length && <p>No saved accounts yet. Turn on the toggle to add an email and password.</p>}
      {expanded && <div className="accounts-footer"><span>Scroll sideways for more accounts · {accounts.length}/50</span><button className="primary" disabled={busy} type="submit">{busy ? "Saving..." : "Save accounts"}</button></div>}
    </form>}
    {message && <p role="status" className="notice">{message}</p>}
    </div>
    {error && <p role="alert" className="notice error">{error}</p>}
  </section>;
}
