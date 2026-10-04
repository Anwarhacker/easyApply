import { useRef, useState } from "react";
import { saveStoredResume, deleteStoredResume, base64ToFile, formatFileSize, type StoredResume } from "./resume-vault";

export function ResumeVaultCard({profileId, profileName, savedResume, loading = false, loadError = "", onRetry, onSave, onDelete, onToast, onAttach}: {
  profileId?: string; profileName?: string; savedResume: StoredResume | null; loading?: boolean; loadError?: string;
  onRetry?: () => void; onSave: (stored: StoredResume) => void; onDelete: () => void; onToast?: (message: string) => void;
  onAttach?: () => Promise<string>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const working = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const disabled = busy || loading || !!loadError || !profileId;
  const savedDate = savedResume ? new Date(savedResume.updatedAt) : null;
  const dateLabel = savedDate && !Number.isNaN(savedDate.getTime()) ? savedDate.toLocaleString() : "Date unavailable";
  async function run(action: () => Promise<void>) {
    if (disabled || working.current) return;
    working.current = true; setBusy(true); setFailed(false); setMessage("");
    try { await action(); } catch (error) {
      setFailed(true); setMessage(error instanceof Error ? error.message : "The resume could not be updated. Please retry.");
    } finally { working.current = false; setBusy(false); }
  }
  async function upload(file: File) {
    await run(async () => {
      const stored = await saveStoredResume(profileId!, file);
      onSave(stored); setConfirmRemove(false);
      setMessage(`Saved ${stored.name} for this profile.`);
      onToast?.(`Resume saved: ${stored.name}`);
    });
  }
  return <section className="vault-resume-container resume-document" aria-label="Resume document" aria-busy={busy || loading}>
    <div className="vault-resume-header"><strong>Resume document</strong><span className="badge">{loading ? "Loading…" : loadError ? "Unavailable" : savedResume ? "Saved locally" : "No document"}</span></div>
    <p className="resume-document-note">{profileName ? `For ${profileName}` : "Save a profile to attach a resume."}</p>
    <input ref={input} type="file" aria-label={savedResume ? "Replace resume document" : "Upload resume document"} accept=".pdf,.docx,.txt" hidden disabled={disabled}
      onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
    {loadError ? <div role="alert"><p>{loadError}</p><button type="button" onClick={onRetry}>Retry loading resume</button></div>
      : loading ? <p role="status">Loading the resume for this profile…</p>
      : savedResume ? <>
        <div className="vault-resume-info"><span className="vault-icon" aria-hidden="true">📄</span><div className="vault-details">
          <span className="vault-filename" title={savedResume.name}>{savedResume.name}</span>
          <span className="vault-size">{savedResume.name.split(".").at(-1)?.toUpperCase()} · {formatFileSize(savedResume.size)}</span>
          <span className="vault-size">Saved {dateLabel}</span>
        </div></div>
        <div className="resume-document-actions">
          <a href={savedResume.dataBase64} download={savedResume.name}>Download</a>
          {onAttach && <button type="button" disabled={disabled} onClick={() => void run(async () => setMessage(await onAttach()))}>Attach to job page</button>}
          <button type="button" disabled={disabled} onClick={() => input.current?.click()}>Replace</button>
          <button type="button" disabled={disabled} onClick={() => setConfirmRemove(true)}>Remove</button>
          <span className="vault-drag-chip" draggable={!disabled} title="Drag the file to a supported upload area; use Download if drag is unsupported."
            onDragStart={event => {
              if (disabled) { event.preventDefault(); return; }
              try {
                event.dataTransfer.items.add(base64ToFile(savedResume.dataBase64, savedResume.name, savedResume.type));
                event.dataTransfer.setData("DownloadURL", `${savedResume.type}:${savedResume.name}:${savedResume.dataBase64}`);
                event.dataTransfer.effectAllowed = "copy";
              } catch { event.preventDefault(); setFailed(true); setMessage("Drag is unavailable. Download the resume and attach it manually."); }
            }}>Try dragging file</span>
        </div>
        <p className="resume-document-note">Dragging from this window may not transfer a file to a website or another app. Use Attach to job page from the popup, drag from the floating widget on the job page, or Download and use the website's Choose file button.</p>
        {confirmRemove && <div className="resume-remove-confirm" role="group" aria-label="Confirm resume removal">
          <p>Remove {savedResume.name} from this profile? Your original file and profile answers are kept.</p>
          <button type="button" disabled={disabled} onClick={() => void run(async () => {
            await deleteStoredResume(profileId!); onDelete(); setConfirmRemove(false); setMessage("Resume removed from this profile.");
          })}>Remove saved resume</button>
          <button type="button" disabled={busy} onClick={() => setConfirmRemove(false)}>Keep resume</button>
        </div>}
      </> : <><p>No resume saved for this profile.</p><button type="button" disabled={disabled} onClick={() => input.current?.click()}>Upload resume</button></>}
    {busy && <p role="status">Updating resume…</p>}
    {message && <p role={failed ? "alert" : "status"} className={failed ? "notice error" : "notice"}>{message}</p>}
    <p className="resume-document-note">PDF, DOCX or TXT · Up to 10 MB. Replacing the document does not change profile answers. Stored on this device without vault encryption. Check the website's upload status after attaching.</p>
  </section>;
}
