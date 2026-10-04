import { useEffect, useRef, useState } from "react";
import { essentials, missingEssentials } from "./fill-insights";
import { followUpDue } from "./application-tracker";
import { useLocalDate } from "./use-local-date";
import { label, type Application, type Field, type Profile } from "./model";

const copyFields: Field[] = ["email", "mobile", "linkedin", "portfolio", "github", "aboutYou", "whyHire", "skills"];

export function WorkspaceDashboard({ profile, apps, compact = false, onEdit, onResume, onTracker }: {
  profile?: Profile; apps: Application[]; compact?: boolean;
  onEdit: (field?: Field) => void; onResume: () => void; onTracker: (dueOnly: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState("");
  const copyVersion = useRef(0);
  useEffect(() => {
    const timer = setTimeout(() => setFeedback(""), 4000);
    return () => clearTimeout(timer);
  }, [feedback]);
  useEffect(() => () => { copyVersion.current++; }, []);
  const missing = profile ? missingEssentials(profile.values) : essentials;
  const complete = essentials.length - missing.length;
  const today = useLocalDate();
  const due = apps.filter(app => followUpDue(app, today)).sort((a, b) => a.followUpDate!.localeCompare(b.followUpDate!));
  function formatFollowUpDate(value: string) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  const entries = profile ? [
    ...copyFields.flatMap(field => profile.values[field]?.trim() ? [{ title: label(field), value: profile.values[field] }] : []),
    ...Object.entries(profile.customFieldAnswers ?? {}).map(([title, value]) => ({ title, value })),
  ] : [];
  const filtered = entries.filter(entry => `${entry.title} ${entry.value}`.toLowerCase().includes(query.trim().toLowerCase()));
  async function copy(title: string, value: string) {
    const version = ++copyVersion.current;
    try {
      await navigator.clipboard.writeText(value);
      if (version === copyVersion.current) setFeedback(`${title} copied. Ready to paste.`);
    } catch {
      if (version === copyVersion.current) setFeedback("Clipboard unavailable. Select the answer text and copy it manually.");
    }
  }
  if (compact) return <section className="workspace-compact" aria-label="Your application workspace">
    <button type="button" onClick={() => onEdit(missing[0])}>
      <span className="workspace-dot" aria-hidden="true" />
      <span>{profile ? `${complete}/${essentials.length} essentials saved` : "Set up your first profile"}</span><span aria-hidden="true">↗</span>
    </button>
    <button type="button" onClick={() => onTracker(due.length > 0)}>{due.length ? `${due.length} follow-up${due.length === 1 ? "" : "s"} due` : "My applications"}<span aria-hidden="true">↗</span></button>
  </section>;
  return <section className="workspace-dashboard" aria-label="Your application workspace">
    <div className="workspace-topline"><span className="eyebrow">YOUR APPLICATION WORKSPACE</span><span className="workspace-local"><span aria-hidden="true">●</span> Saved on this device</span></div>
    <div className="workspace-welcome">
      <div><h2>{profile ? `Make your next move${profile.values.firstName.trim() ? `, ${profile.values.firstName.trim()}` : ""}.` : "A little setup. A lot less typing."}</h2><p>{profile ? "Your details, your answers, and your next steps. All within reach." : "Start with your resume or add your details once. Reuse them on your next application."}</p></div>
      <button type="button" className="primary" onClick={onResume}>{profile ? "Import resume details" : "Start with my resume"}<span aria-hidden="true"> ↗</span></button>
    </div>
    <div className="workspace-grid">
      <section className="workspace-readiness">
        <div className="workspace-card-heading"><h3>Build your starting point</h3><span>{complete}/{essentials.length}</span></div>
        <progress aria-label="Saved profile essentials" value={complete} max={essentials.length} />
        <p>{missing.length ? "Each detail is one less thing to type next time." : "Your essentials are ready for the next application."}</p>
        <div className="workspace-missing">{missing.slice(0, 4).map(field => <button type="button" key={field} onClick={() => onEdit(field)}>+ Add {label(field)}</button>)}</div>
        {missing.length > 4 && <button type="button" className="workspace-text-button" onClick={() => onEdit(missing[4])}>{missing.length - 4} more essentials to add →</button>}
        {!missing.length && <button type="button" className="workspace-text-button" onClick={() => onEdit("fullName")}>Review my details →</button>}
      </section>
      <section className="workspace-next">
        <div className="workspace-card-heading"><h3>Keep things moving</h3><span className={due.length ? "workspace-due-badge" : ""}>{due.length ? `${due.length} due` : "Next steps"}</span></div>
        {due.length ? <><p>Follow up on the opportunities you care about.</p><ul>{due.slice(0, 2).map(app => <li key={app.id}><div><strong>{app.company}</strong><span>{app.position}</span></div><time dateTime={app.followUpDate}>{app.followUpDate === today ? "Today" : `Overdue · ${formatFollowUpDate(app.followUpDate!)}`}</time></li>)}</ul></> : <p>{apps.length ? "No follow-ups due. Set a next step in your tracker so opportunities don’t slip away." : "Save your applications and add follow-up dates to keep your search organized."}</p>}
        <button type="button" className="workspace-text-button" onClick={() => onTracker(due.length > 0)}>{due.length ? "Review follow-ups" : "Open my tracker"} →</button>
      </section>
    </div>
    <details className="workspace-answer-kit">
      <summary><span><strong>Your copy & paste kit</strong><span>Saved answers for forms, emails, and recruiter chats</span></span><span className="workspace-answer-count">{entries.length} saved</span></summary>
      <label className="workspace-search">Find a saved answer<input type="search" placeholder="Search links, contact details, or answers…" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="workspace-copy-status" role="status" aria-live="polite">{feedback}</div>
      {!entries.length ? <p>Add contact details, links, or remembered answers to your profile to build your kit.</p> : !filtered.length ? <p>No answers match. Try another search.</p> : <div className="workspace-answer-list">{filtered.map((entry, index) => <article key={`${entry.title}-${index}`}><div><h4>{entry.title}</h4><p>{entry.value}</p></div><button type="button" aria-label={`Copy ${entry.title}`} onClick={() => void copy(entry.title, entry.value)}>Copy</button></article>)}</div>}
    </details>
  </section>;
}
