import { useEffect, useRef, useState } from "react";
import type { Profile } from "./model";
import { base64ToFile, getStoredResume } from "./resume-vault";
import { compareJobResume, extractCurrentJob, type JobPage } from "./job-match";
import { PanelCloseButton } from "./PanelCloseButton";

export function JobMatchPanel({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const resumePicker = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const reading = useRef(false);
  const analyzing = useRef(false);
  const [job, setJob] = useState<JobPage | null>(null);
  const [description, setDescription] = useState("");
  const [extra, setExtra] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeName, setResumeName] = useState("");
  const [readingPage, setReadingPage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pageError, setPageError] = useState("");
  const [result, setResult] = useState<ReturnType<typeof compareJobResume> | null>(null);
  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    void readPage();
    return () => { mounted.current = false; previous?.focus(); };
  }, []);
  function invalidate() { setResult(null); setError(""); }
  async function readPage() {
    if (reading.current) return;
    reading.current = true;
    setReadingPage(true); setPageError("");
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !/^https?:/.test(tab.url ?? "")) throw Error("Open this tool from the extension popup on a job page, or paste a job description below.");
      const results = await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, func: extractCurrentJob });
      const value = results[0]?.result;
      const current = await chrome.tabs.get(tab.id);
      if (!value || current.url !== value.url) throw Error("The job page changed. Read the current page again.");
      if (!value.description.trim()) throw Error("No readable job description found. Paste the description below.");
      if (!mounted.current) return;
      setJob(value); setDescription(value.description); invalidate();
    } catch (e) { if (mounted.current) setPageError(e instanceof Error ? e.message : "Could not read this page. Paste the job description below."); }
    finally { reading.current = false; if (mounted.current) setReadingPage(false); }
  }
  async function compare() {
    if (analyzing.current) return;
    analyzing.current = true;
    setBusy(true); setError(""); setResult(null);
    try {
      if (description.trim().length < 40) throw Error("Add a job description with at least 40 characters.");
      let file = resumeFile;
      if (!file) {
        const stored = await getStoredResume(profile.id);
        if (!stored) throw Error("This profile has no saved resume. Choose a PDF or TXT resume below.");
        file = base64ToFile(stored.dataBase64, stored.name, stored.type);
      }
      const { parseResumeFile } = await import("./resume-parser");
      const { text } = await parseResumeFile(file);
      if (text.trim().length < 40) throw Error("Not enough readable resume text. For scanned PDFs or DOCX files, choose a text-based PDF or TXT export.");
      const comparison = compareJobResume(description, text, extra);
      if (!mounted.current) return;
      setResumeName(file.name); setResult(comparison);
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "Could not compare this resume. Try another file."); }
    finally { analyzing.current = false; if (mounted.current) setBusy(false); }
  }
  const present = result?.keywords.filter(item => item.present) ?? [];
  const missing = result?.keywords.filter(item => !item.present) ?? [];
  return <dialog ref={dialog} className="job-match-dialog" aria-labelledby="job-match-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="job-match-heading"><div><p className="eyebrow">PREPARE YOUR NEXT APPLICATION</p><h2 id="job-match-title">Resume ↔ Job Match</h2></div><PanelCloseButton label="Close job match" onClick={onClose} /></div>
    <p>Compare the actual resume with the job description. Analysis stays on this device and does not fill or submit the page.</p>
    <fieldset disabled={busy || readingPage} className="app-controls">
      <div className="job-match-source"><span>Selected profile: <strong>{profile.title}</strong></span><button type="button" onClick={() => void readPage()}>{readingPage ? "Reading page…" : "Read current job page"}</button></div>
      {pageError && <p role="status" className="notice">{pageError}</p>}
      {job && <div className="job-match-context"><h3>{job.title}</h3><p>{job.source}</p><a href={job.url} target="_blank" rel="noreferrer">Source job page ↗</a><dl><div><dt>Location</dt><dd>{job.location || "Not found on page"}</dd></div><div><dt>Salary</dt><dd>{job.salary || "Not found on page"}</dd></div></dl></div>}
      <label>Job description<textarea aria-label="Job description" rows={7} maxLength={60000} value={description} placeholder="Read the current job page or paste the full job description here…" onChange={event => { setDescription(event.target.value); setJob(null); invalidate(); }} /></label>
      <label>Resume to compare<select aria-label="Resume to compare" value={resumeFile ? "file" : "saved"} onChange={() => { setResumeFile(null); if (resumePicker.current) resumePicker.current.value = ""; invalidate(); }}><option value="saved">Saved resume for {profile.title}</option>{resumeFile && <option value="file">{resumeFile.name}</option>}</select></label>
      <label>Or choose a PDF or TXT resume<input ref={resumePicker} type="file" accept=".pdf,.txt" onChange={event => { setResumeFile(event.target.files?.[0] ?? null); invalidate(); }} /></label>
      <p className="hint">Choosing a file here does not replace your saved resume. DOCX resumes must be exported as PDF or TXT for text analysis.</p>
      <label>Additional skills or keywords (optional)<input maxLength={2400} placeholder="Comma-separated terms specific to this role" value={extra} onChange={event => { setExtra(event.target.value); invalidate(); }} /></label>
      <button type="button" className="primary wide" onClick={() => void compare()} disabled={description.trim().length < 40}>{busy ? "Comparing resume…" : "Compare resume with job"}</button>
    </fieldset>
    {(busy || readingPage) && <p role="status">{busy ? "Reading resume and comparing job keywords…" : "Reading the active job page…"}</p>}
    {error && <p role="alert" className="notice error">{error}</p>}
    {result && <section className="job-match-result" aria-label="Resume comparison results">
      <h3>{present.length} of {result.keywords.length} detected keywords found</h3><p>Compared with <strong>{resumeName}</strong>. This is text evidence, not a hiring score or proof of proficiency. “Not found” means the resume does not explicitly mention the detected term.</p>
      <div className="job-match-columns">{[{ title: "Present in resume", items: present }, { title: "Not found in resume", items: missing }].map(group => <section key={group.title}><h3>{group.title} ({group.items.length})</h3>{!group.items.length && <p>{result.keywords.length ? "None in this category." : "No supported keywords detected. Add role-specific terms above and compare again."}</p>}{group.items.map(item => <details key={item.name}><summary>{item.name}<span className={`job-priority priority-${item.priority.toLowerCase()}`}>{item.priority}</span></summary><p><strong>Job evidence:</strong> {item.evidence}</p>{item.present && <p><strong>Resume evidence:</strong> {item.resumeEvidence}</p>}</details>)}</section>)}</div>
      <section className="job-match-review"><h3>Experience requirements</h3>{result.experience.length ? <ul>{result.experience.map((line, i) => <li key={i}>{line}</li>)}</ul> : <p>No explicit experience requirement detected.</p>}<h4>Resume experience evidence</h4>{result.resumeExperience.length ? <ul>{result.resumeExperience.map((line, i) => <li key={i}>{line}</li>)}</ul> : <p>No explicit years-of-experience statement found. Review your work history against the job requirements.</p>}<p className="hint">Years are not inferred from overlapping jobs or dates. Check technology-specific experience and seniority manually.</p></section>
      <section className="job-match-review"><h3>Qualifications to verify</h3>{result.qualifications.length ? <ul>{result.qualifications.map((line, i) => <li key={i}>{line}</li>)}</ul> : <p>No explicit education or certification requirement detected.</p>}<h4>Resume education / certification evidence</h4>{result.resumeQualifications.length ? <ul>{result.resumeQualifications.map((line, i) => <li key={i}>{line}</li>)}</ul> : <p>No education or certification evidence detected in the resume text.</p>}<p className="hint">Review degree level, subject, certifications, location and work eligibility yourself. Keyword presence alone does not establish these qualifications.</p></section>
    </section>}
  </dialog>;
}

