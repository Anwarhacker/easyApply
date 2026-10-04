import { useEffect, useState } from "react";
export function LearningSettings({profileId, count}: {profileId: string; count: number}) {
  const [enabled, setEnabled] = useState(false), [busy, setBusy] = useState(true), [error, setError] = useState("");
  const key = `easyapply.learning:${profileId}`;
  useEffect(() => {
    let cancelled = false;
    void chrome.storage.local.get(key).then(data => { if (!cancelled) setEnabled(data[key] === true); })
      .catch(() => { if (!cancelled) setError("Could not load learning preference. Reopen the extension to retry."); })
      .finally(() => { if (!cancelled) setBusy(false); });
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && changes[key]) setEnabled(changes[key].newValue === true);
    };
    chrome.storage.onChanged.addListener(changed);
    return () => { cancelled = true; chrome.storage.onChanged.removeListener(changed); };
  }, [key]);
  return <section className="learning-settings" aria-label="Answer learning">
    <label><input type="checkbox" checked={enabled} disabled={busy} onChange={async event => {
      const next = event.target.checked; const previous = enabled; setEnabled(next); setBusy(true); setError("");
      try { await chrome.storage.local.set({[key]:next}); setEnabled(next); }
      catch { setEnabled(previous); setError("Could not save learning preference. Please retry."); }
      finally { setBusy(false); }
    }} /> Learn new answers automatically</label>
    <p>{enabled ? "Learning is on for this profile." : "Learning asks before saving."} {count} remembered answers.</p>
    <p>Activate easyApply on an application page, answer a new question, then leave the field. Text, numbers and standard dropdowns are supported. Changed answers ask before replacing a saved answer. Passwords, identity, consent and sensitive questions are excluded.</p>
    {error && <p role="alert">{error}</p>}
  </section>;
}
