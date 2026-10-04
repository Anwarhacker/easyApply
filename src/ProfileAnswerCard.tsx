import { useEffect, useId, useRef, useState } from "react";
import type { Profile } from "./model";

export function ProfileAnswerCard({ profile, field, title, hint, prompts, onSave, defaultOpen = false }: {
  profile?: Profile;
  field: "aboutYou" | "whyHire";
  title: string;
  hint: string;
  prompts: string[];
  onSave?: (text: string) => Promise<void> | void;
  defaultOpen?: boolean;
}) {
  const saved = profile?.values[field]?.trim() || "";
  const [open, setOpen] = useState(defaultOpen);
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  const id = useId();
  useEffect(() => { setDraft(saved); }, [saved]);
  const text = draft.trim();
  const dirty = text !== saved;
  const words = text ? text.split(/\s+/).length : 0;
  const limit = 3000;

  async function save() {
    if (lock.current || !onSave || !profile || !dirty || draft.length > limit) return;
    lock.current = true; setSaving(true); setError(""); setMessage("");
    try {
      await onSave(text);
      setMessage(text ? `${title} saved to this profile on this device.` : `${title} removed from this profile.`);
    } catch {
      setError("Could not save. Your draft is still here—please try again.");
    } finally { lock.current = false; setSaving(false); }
  }
  async function copy() {
    setError(""); setMessage("");
    try {
      await navigator.clipboard.writeText(text);
      setMessage(dirty ? "Draft copied. Save it to keep it in this profile." : "Copied to clipboard.");
    } catch { setError("Copy was blocked. Select the answer text and copy it manually."); }
  }

  return <section className={`card profile-answer-card ${field === "aboutYou" ? "about-you-section" : "why-hire-section"}`}>
    <div className="profile-answer-heading">
      <button type="button" className="profile-answer-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <span><strong>{title}</strong><span className="profile-answer-state">{dirty ? "Unsaved changes" : saved ? "Saved answer" : "Add your answer"}</span></span>
        <span aria-hidden="true" className="profile-answer-symbol">{open ? "−" : "+"}</span>
      </button>
      <button type="button" aria-label={`Copy ${title}`} disabled={!profile || !text || saving} onClick={() => void copy()}>Copy</button>
    </div>
    {open && <div id={id} className="profile-answer-body">
      {!profile ? <p className="notice">Select a saved profile to add this answer.</p> : <>
        <p className="profile-answer-context">For <strong>{profile.title}</strong> · Saved separately for each profile</p>
        <p className="profile-answer-hint">{hint}</p>
        <details className="profile-answer-tips"><summary>Writing tips</summary><ul>{prompts.map(prompt => <li key={prompt}>{prompt}</li>)}</ul></details>
        <label htmlFor={`${id}-answer`}>{title} answer</label>
        <textarea id={`${id}-answer`} rows={5} value={draft} maxLength={limit} disabled={saving} placeholder="Write in your own words using details you can support." aria-describedby={`${id}-count`} onChange={event => {setDraft(event.target.value);setMessage("");setError("");}} />
        <p id={`${id}-count`} className={`profile-answer-count${draft.length > limit ? " over-limit" : ""}`}>{words} {words === 1 ? "word" : "words"} · {draft.length.toLocaleString()} / {limit.toLocaleString()} characters</p>
        <div className="profile-answer-actions">
          <button type="button" className="primary" disabled={saving || !dirty || !onSave || draft.length > limit} onClick={() => void save()}>{saving ? "Saving…" : "Save to profile"}</button>
          <button type="button" disabled={saving || !dirty} onClick={() => {setDraft(saved);setMessage("Saved answer restored.");setError("");}}>Discard changes</button>
        </div>
        <p className="profile-answer-note">Copy uses the current text. Save updates the answer used by autofill.</p>
      </>}
    </div>}
    {message && <p className="notice profile-answer-feedback" role="status">{message}</p>}
    {error && <p className="notice error profile-answer-feedback" role="alert">{error}</p>}
  </section>;
}
