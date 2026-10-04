import { useEffect, useState, useRef } from "react";
import { label as formatLabel } from "./model";
import { saveStoredResume } from "./resume-vault";
import { PanelCloseButton } from "./PanelCloseButton";

interface ExtractedFieldRow {
  key: string;
  label: string;
  value: string;
  current: string;
  selected: boolean;
}

export function ResumeParserModal({ profileId, currentValues = {}, onClose, onApply }: {
  profileId?: string;
  currentValues?: Record<string, string | undefined>;
  onClose: () => void;
  onApply: (fields: Record<string, string>) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const modal = useRef<HTMLDivElement>(null);
  const working = useRef(false);
  const mounted = useRef(true);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<ExtractedFieldRow[]>([]);
  const [storeFile, setStoreFile] = useState(true);
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const busy = parsing || saving;

  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement as HTMLElement | null;
    modal.current?.focus();
    return () => { mounted.current = false; previous?.focus(); };
  }, []);

  async function handleFile(next: File) {
    if (working.current) return;
    working.current = true;
    setError("");
    setRows([]);
    setQuery("");
    setFile(next);
    setParsing(true);
    try {
      const { parseResumeFile } = await import("./resume-parser");
      const { text, fields } = await parseResumeFile(next);
      if (!mounted.current) return;
      const entries = Object.entries(fields).map(([key, value]) => ({
        key, label: formatLabel(key), value,
        current: currentValues[key]?.trim() || "",
        selected: !currentValues[key]?.trim(),
      }));
      if (!entries.length) {
        setError(text.trim()
          ? "No profile details recognized. Try a resume with clear contact, education and skills sections, or enter your details manually."
          : "No readable text found. This may be a scanned PDF. Export a text-based PDF or use a TXT file.");
      } else setRows(entries);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "Could not read this resume. Try another PDF or TXT file.");
    } finally {
      working.current = false;
      if (mounted.current) setParsing(false);
    }
  }

  const selected = rows.filter(row => row.selected && row.value.trim());
  const replacements = selected.filter(row => row.current && row.current !== row.value.trim()).length;
  const visibleRows = rows.filter(row => `${row.label} ${row.value}`.toLowerCase().includes(query.toLowerCase()));
  const missing = ["firstName", "email", "mobile", "city", "degree", "college", "graduationYear"]
    .filter(key => !currentValues[key]?.trim() && !rows.some(row => row.key === key));

  async function handleApply() {
    if (working.current || !selected.length || !file) return;
    working.current = true;
    setSaving(true);
    setError("");
    try {
      if (storeFile) await saveStoredResume(profileId || "default", file);
      onApply(Object.fromEntries(selected.map(row => [row.key, row.value.trim()])));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply the resume. Please try again.");
    } finally {
      working.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return <div className="cl-overlay" role="dialog" aria-modal="true" aria-labelledby="resume-autofill-title"
    onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}
    onKeyDown={event => {
      if (event.key === "Escape" && !busy) { event.stopPropagation(); onClose(); }
      if (event.key === "Tab") {
        const controls = Array.from(modal.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type="file"])') || []);
        const first = controls[0]; const last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === modal.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === modal.current)) { event.preventDefault(); first?.focus(); }
      }
    }}>
    <div className="cl-modal resume-modal-card" ref={modal} tabIndex={-1} aria-busy={busy}>
      <div className="cl-header">
        <div>
          <div className="cl-title" id="resume-autofill-title">Resume Autofill <span className="badge">On this device</span></div>
          <p className="footnote resume-help">Import your resume, review the details, then apply your choices.</p>
        </div>
        <PanelCloseButton label="Close Resume Autofill" disabled={busy} onClick={onClose} />
      </div>
      <div className="resume-modal-body">
        <div className="resume-steps" aria-label="Import progress">
          <span className={!rows.length ? "active" : ""}>1. Choose resume</span>
          <span className={rows.length ? "active" : ""}>2. Review details</span>
          <span>3. Apply to profile</span>
        </div>
        <input ref={fileInput} type="file" accept=".pdf,.txt" hidden disabled={busy} onChange={event => {
          const next = event.target.files?.[0];
          event.target.value = "";
          if (next) void handleFile(next);
        }} />
        {error && <p role="alert" className="notice error">{error}</p>}
        {!rows.length ? <div className={`resume-dropzone${dragging ? " dragging" : ""}`}
          onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={event => { event.preventDefault(); setDragging(false); const next = event.dataTransfer.files[0]; if (next && !busy) void handleFile(next); }}>
          <div className="dropzone-inner">
            <span className="dropzone-icon" aria-hidden="true">📄</span>
            <h3>{parsing ? "Reading your resume…" : "Start with your resume"}</h3>
            <p className="footnote">Drop a PDF or TXT file here. Maximum 10 MB.</p>
            <button type="button" className="cl-btn cl-btn-primary" disabled={busy} onClick={() => fileInput.current?.click()}>Choose resume</button>
            <p className="footnote" role="status">{parsing ? file?.name : "Processed locally. No upload to an AI service."}</p>
            {parsing && <div className="spinner" />}
          </div>
        </div> : <div className="resume-results">
          <div className="resume-results-header">
            <strong className="resume-file-name">{file?.name}</strong>
            <button type="button" className="cl-btn cl-btn-secondary" disabled={busy} onClick={() => fileInput.current?.click()}>Change file</button>
          </div>
          <p className="resume-review-note">{rows.length} details found. Empty profile fields are selected by default. Review extracted values before applying; select an existing field only if you want to replace it.</p>
          <div className="resume-results-actions">
            <button type="button" disabled={busy} onClick={() => setRows(previous => previous.map(row => ({ ...row, selected: !row.current })))}>Only empty fields</button>
            <button type="button" disabled={busy} onClick={() => setRows(previous => previous.map(row => ({ ...row, selected: true })))}>Select all</button>
            <button type="button" disabled={busy} onClick={() => setRows(previous => previous.map(row => ({ ...row, selected: false })))}>Clear selection</button>
          </div>
          <input type="search" aria-label="Search extracted details" placeholder="Search extracted details…" value={query} onChange={event => setQuery(event.target.value)} />
          <div className="resume-fields-list">
            {visibleRows.map(row => <div key={row.key} className={`resume-field-row ${row.selected ? "selected" : ""}`}>
              <label className="resume-field-check"><input type="checkbox" checked={row.selected} disabled={busy} onChange={() => setRows(previous => previous.map(item => item.key === row.key ? { ...item, selected: !item.selected } : item))} /><span className="resume-field-title">{row.label}</span></label>
              <div className="resume-field-value">
                <input type="text" className="resume-field-input" aria-label={`Extracted ${row.label}`} value={row.value} disabled={busy || !row.selected} onChange={event => setRows(previous => previous.map(item => item.key === row.key ? { ...item, value: event.target.value } : item))} />
                <small>{row.current ? (row.current === row.value.trim() ? "Already in your profile" : `Current: ${row.current}`) : "New detail"}</small>
                {row.selected && !row.value.trim() && <small className="resume-empty-value">Enter a value or uncheck this field.</small>}
              </div>
            </div>)}
            {!visibleRows.length && <p className="footnote">No details match your search.</p>}
          </div>
          {missing.length > 0 && <p className="footnote resume-help">Still to add manually: {missing.map(formatLabel).join(", ")}.</p>}
          <label className="resume-vault-choice"><input type="checkbox" checked={storeFile} disabled={busy} onChange={event => setStoreFile(event.target.checked)} />Save this file to Resume Vault when I apply (replaces the attached resume).</label>
        </div>}
      </div>
      {rows.length > 0 && <div className="resume-apply-footer">
        <p role="status">{selected.length} selected{replacements > 0 ? ` · ${replacements} existing values will be replaced` : " · Existing details preserved"}</p>
        <div className="cl-actions">
          <button type="button" className="cl-btn cl-btn-secondary" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="button" className="cl-btn cl-btn-primary" disabled={busy || !selected.length} onClick={() => void handleApply()}>{saving ? "Applying…" : `Apply ${selected.length} details`}</button>
        </div>
      </div>}
    </div>
  </div>;
}
