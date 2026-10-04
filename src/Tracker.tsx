import { useRef, useState } from "react";
import { useLocalDate } from "./use-local-date";
import type { Application } from "./model";
import { applicationSchema } from "./security";
import { applicationStatuses, filterApplications, followUpDue, localDate } from "./application-tracker";

export function Tracker({ apps, update, initialDueOnly = false }: { apps: Application[]; update: (next: Application[], baseline: Application[]) => Promise<void>; initialDueOnly?: boolean }) {
  const empty = (): Application => ({ id: crypto.randomUUID(), company: "", position: "", url: "", appliedDate: localDate(), followUpDate: "", status: "Applied", resume: "", notes: "" });
  const [draft, setDraft] = useState(empty);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const editorBaseline = useRef<Application[]>([]);
  const companyInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [dueOnly, setDueOnly] = useState(initialDueOnly);
  const [sort, setSort] = useState("newest");
  const [deleted, setDeleted] = useState<Application | null>(null);
  const editing = apps.some(app => app.id === draft.id);
  const today = useLocalDate();
  const visible = filterApplications(apps, search, status, dueOnly, sort, today);
  const dueCount = apps.filter(app => followUpDue(app, today)).length;

  async function persist(next: Application[], success: string, after?: () => void, baseline = apps) {
    if (lock.current) return;
    lock.current = true;
    setSaving(true); setError(""); setMessage("");
    try { await update(next, baseline); setMessage(success); after?.(); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to save changes on this device. Please retry."); }
    finally { lock.current = false; setSaving(false); }
  }
  function openEditor(app?: Application) {
    editorBaseline.current = apps;
    setDraft(app ? { ...app } : empty()); setEditorOpen(true); setError(""); setMessage("");
    requestAnimationFrame(() => { companyInput.current?.scrollIntoView({ block: "center", behavior: "smooth" }); companyInput.current?.focus({ preventScroll: true }); });
  }

  return <section className="card tracker">
    <div className="tracker-heading">
      <div><h2>Application Tracker</h2><p>Your applications, next steps, and follow-ups in one place.</p></div>
      <button type="button" className="primary" disabled={saving || editorOpen} onClick={() => openEditor()}>+ Add application</button>
    </div>
    <div className="tracker-overview" aria-label="Application overview">
      <div><strong>{apps.length}</strong><span>Total applications</span></div>
      <div><strong>{apps.filter(app => app.status === "Interview").length}</strong><span>Interviews</span></div>
      <div><strong>{apps.filter(app => app.status === "Offer").length}</strong><span>Offers</span></div>
      <button type="button" aria-pressed={dueOnly} disabled={saving} onClick={() => { setDueOnly(!dueOnly); setStatus("All"); setSearch(""); }}><strong>{dueCount}</strong><span>Follow-ups due</span></button>
    </div>
    <p className="footnote tracker-private">Saved on this device. Follow-up dates appear here; they do not send notifications.</p>
    {saving && <p role="status" className="loading-banner">Saving changes…</p>}
    {message && !saving && <p role="status" className="notice">{message}</p>}
    {error && <p role="alert" className="notice error">{error}</p>}
    {deleted && <div className="tracker-undo"><span>Deleted {deleted.position} at {deleted.company}.</span><button type="button" disabled={saving} onClick={() => void persist([...apps.filter(app => app.id !== deleted.id), deleted], "Application restored.", () => setDeleted(null))}>Undo delete</button></div>}
    <fieldset disabled={saving} className="app-controls">
      {editorOpen && <form className="tracker-editor" onSubmit={event => {
        event.preventDefault();
        const result = applicationSchema.safeParse(draft);
        if (!result.success) { setError("Check company, position, dates and the application URL. Use a full http or https URL."); return; }
        void persist([...editorBaseline.current.filter(app => app.id !== draft.id), result.data], editing ? "Application updated on this device." : "Application saved to this device.", () => { setDraft(empty()); setEditorOpen(false); }, editorBaseline.current);
      }}>
        <h3>{editing ? "Edit application" : "Add application"}</h3>
        <div className="grid">
          <label>Company<input ref={companyInput} required maxLength={200} value={draft.company} onChange={event => setDraft({ ...draft, company: event.target.value })} /></label>
          <label>Position<input required maxLength={200} value={draft.position} onChange={event => setDraft({ ...draft, position: event.target.value })} /></label>
          <label>Application URL<input type="url" maxLength={2048} placeholder="https://…" value={draft.url} onChange={event => setDraft({ ...draft, url: event.target.value })} /></label>
          <label>Applied Date<input required type="date" value={draft.appliedDate} onChange={event => setDraft({ ...draft, appliedDate: event.target.value })} /></label>
          <label>Status<select aria-label="Application status" value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })}>{applicationStatuses.map(value => <option key={value}>{value}</option>)}</select></label>
          <label>Follow-up date<input type="date" value={draft.followUpDate || ""} onChange={event => setDraft({ ...draft, followUpDate: event.target.value })} /></label>
          <label>Resume used<input maxLength={500} value={draft.resume} onChange={event => setDraft({ ...draft, resume: event.target.value })} /></label>
          <label>Notes / next step<textarea aria-label="Notes / next step" rows={3} maxLength={10000} placeholder="Interview details, recruiter contact, or your next step…" value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>
        </div>
        <div className="tracker-actions"><button className="primary">{saving ? "Saving…" : editing ? "Update application" : "Save application"}</button><button type="button" onClick={() => { setEditorOpen(false); setDraft(empty()); setError(""); }}>Cancel</button></div>
      </form>}
      {apps.length > 0 && <>
        <div className="tracker-filters">
          <label>Search applications<input type="search" placeholder="Company, role, resume, or notes…" value={search} onChange={event => setSearch(event.target.value)} /></label>
          <label>Sort by<select value={sort} onChange={event => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="followUp">Follow-up date</option><option value="company">Company A–Z</option></select></label>
        </div>
        <div className="tracker-status-filters" aria-label="Filter application status">
          {["All", ...applicationStatuses].map(value => <button type="button" key={value} aria-pressed={status === value} onClick={() => setStatus(value)}>{value} ({value === "All" ? apps.length : apps.filter(app => app.status === value).length})</button>)}
          <button type="button" aria-pressed={dueOnly} onClick={() => setDueOnly(!dueOnly)}>Follow-ups due ({dueCount})</button>
        </div>
        <div className="tracker-results-count"><span>{visible.length} of {apps.length} applications</span>{(search || status !== "All" || dueOnly) && <button type="button" onClick={() => { setSearch(""); setStatus("All"); setDueOnly(false); }}>Clear filters</button>}</div>
      </>}
      {!apps.length ? <div className="empty"><h3>Your next opportunity starts here</h3><p>Add an application to track its progress. Applications detected by easyApply also appear here.</p></div> : !visible.length ? <p className="empty">No applications match these filters. Clear filters to see all applications.</p> : visible.map(app => <article className="record tracker-record" key={app.id}>
        <div className="tracker-record-info">
          <h3>{app.position} · {app.company}</h3>
          <p className="footnote">Applied {app.appliedDate}{app.resume && ` · Resume: ${app.resume}`}</p>
          {app.followUpDate && <p className={`tracker-follow-up${followUpDue(app, today) ? " due" : ""}`}>{followUpDue(app, today) ? app.followUpDate === today ? "Follow up today" : "Follow-up overdue" : "Follow-up"} · {app.followUpDate}</p>}
          {app.notes && <p className="tracker-notes">{app.notes}</p>}
          {/^https?:\/\//.test(app.url) && <a href={app.url} target="_blank" rel="noreferrer">View application page ↗</a>}
        </div>
        <div className="tracker-record-actions">
          <label>Status<select aria-label={`Status for ${app.position} at ${app.company}`} value={app.status} disabled={editorOpen} onChange={event => void persist(apps.map(item => item.id === app.id ? { ...item, status: event.target.value } : item), `Status updated for ${app.company}.`)}>{applicationStatuses.map(value => <option key={value}>{value}</option>)}</select></label>
          <button type="button" disabled={editorOpen} onClick={() => openEditor(app)}>Edit</button>
          {app.followUpDate && <button type="button" disabled={editorOpen} onClick={() => void persist(apps.map(item => item.id === app.id ? { ...item, followUpDate: "" } : item), "Follow-up marked complete.")}>Complete follow-up</button>}
          <button type="button" className="danger" disabled={editorOpen} onClick={() => void persist(apps.filter(item => item.id !== app.id), "Application deleted. You can undo the last deletion while this tracker is open.", () => setDeleted(app))}>Delete</button>
        </div>
      </article>)}
    </fieldset>
  </section>;
}

