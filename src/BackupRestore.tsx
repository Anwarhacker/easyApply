import React, { useEffect, useState } from "react";
import {
  backupCategories,
  createBackup,
  importBackup,
  parseBackup,
  type Backup,
  type Category,
} from "./backup";

export function BackupRestore() {
  const [selected, setSelected] = useState<Category[]>(
    backupCategories.map((x) => x.id),
  );
  const [backup, setBackup] = useState<Backup | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [lastExport, setLastExport] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void chrome.storage.local
      .get("easyapply.backup.last-export")
      .then((row) =>
        setLastExport(
          typeof row["easyapply.backup.last-export"] === "string"
            ? row["easyapply.backup.last-export"]
            : "",
        ),
      )
      .catch(() => {});
  }, []);
  async function exportData() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await createBackup(selected);
      const blob = new Blob([JSON.stringify(result, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      if (blob.size > 20 * 1024 * 1024)
        throw Error(
          "This backup is larger than the 20 MB import limit. Export fewer categories or leave out stored resumes.",
        );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `easyApply-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      const savedAt = new Date().toISOString();
      await chrome.storage.local.set({
        "easyapply.backup.last-export": savedAt,
      });
      setLastExport(savedAt);
      setMessage("Backup downloaded successfully.");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Export failed. Check available storage and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function selectFile(file?: File) {
    setBackup(null);
    setError("");
    setMessage("");
    if (!file) return;
    setBusy(true);
    try {
      setBackup(await parseBackup(file));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not read this backup file.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function applyImport() {
    if (!backup) return;
    const scope = backup.metadata.categories
      .map((id) => backupCategories.find((item) => item.id === id)?.label ?? id)
      .join(", ");
    const warning =
      mode === "replace"
        ? `Replace the following data categories with this backup? Existing data in these categories will be replaced:\n\n${scope}\n\nEncrypted identity, saved account passwords, and AI credentials are never changed.`
        : `Merge these categories? Imported versions will update records with matching IDs, while unrelated existing records stay. For Answer Library questions that match, the imported answer wins.\n\n${scope}`;
    if (!window.confirm(warning)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const changed = await importBackup(backup, mode);
      setMessage(
        `Import complete. Updated ${changed.length} storage item${changed.length === 1 ? "" : "s"} (${scope}).`,
      );
      setBackup(null);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Import failed. Existing data was not confirmed as restored.",
      );
    } finally {
      setBusy(false);
    }
  }
  const counts = backup
    ? [
        [
          "Job profiles",
          (backup.data.profiles as unknown[] | undefined)?.length,
        ],
        [
          "Applications",
          (backup.data.applications as unknown[] | undefined)?.length,
        ],
        [
          "Answer Library entries",
          (backup.data.answerLibrary as unknown[] | undefined)?.length,
        ],
        [
          "Custom information profiles",
          Object.keys((backup.data.customEntries as object | undefined) ?? {})
            .length,
        ],
        [
          "Learning preferences",
          Object.keys(
            (backup.data.learningPreferences as object | undefined) ?? {},
          ).length,
        ],
        [
          "Stored resumes",
          Object.keys((backup.data.resumes as object | undefined) ?? {}).length,
        ],
      ].filter((x): x is [string, number] => typeof x[1] === "number")
    : [];
  return (
    <section className="card backup-restore" aria-labelledby="backup-heading">
      <h1 className="text-red-400" id="backup-heading">
        Backup &amp; Restore
      </h1>
      <p>
        Export or restore your easyApply data locally. Backups can contain
        personal application information; keep the downloaded file somewhere
        private.
      </p>
      <h2>Export data</h2>
      <fieldset disabled={busy} className="backup-categories">
        <legend>Choose categories to include</legend>
        {backupCategories.map((item) => (
          <label key={item.id}>
            <input
              type="checkbox"
              checked={selected.includes(item.id)}
              onChange={(event) =>
                setSelected((current) =>
                  event.target.checked
                    ? [...current, item.id]
                    : current.filter((id) => id !== item.id),
                )
              }
            />
            {item.label}
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        className="highlight-action"
        disabled={busy || selected.length === 0}
        onClick={() => void exportData()}
      >
        {busy ? "Working…" : "Export Selected Data"}
      </button>
      <p className="backup-muted">
        Exported resume files are embedded in the JSON. Encrypted identity
        numbers, saved account credentials, AI provider keys and session tokens
        are excluded. Re-enter these on the destination device.
      </p>
      <p>
        Last export:{" "}
        {lastExport ? new Date(lastExport).toLocaleString() : "Never"}
      </p>
      <h2>Import JSON file</h2>
      <label className="backup-file">
        Choose an easyApply backup
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={(event) => void selectFile(event.currentTarget.files?.[0])}
        />
      </label>
      {backup && (
        <div className="backup-preview" aria-live="polite">
          <h3>Import preview</h3>
          <p>Created {new Date(backup.exportedAt).toLocaleString()}</p>
          <ul>
            {counts.map(([label, count]) => (
              <li key={label}>
                {label}: {count}
              </li>
            ))}
          </ul>
          <label>
            Import mode{" "}
            <select
              value={mode}
              onChange={(event) =>
                setMode(event.target.value as "merge" | "replace")
              }
            >
              <option value="merge">Merge data</option>
              <option value="replace">Replace included categories</option>
            </select>
          </label>
          <p>
            {mode === "merge"
              ? "Matching IDs are updated from the backup; unrelated existing records are preserved. For matching Answer Library questions, the imported entry wins."
              : "Only the categories listed above are replaced. Other data, including encrypted vaults and credentials, stays untouched."}
          </p>
          <div>
            <button
              type="button"
              disabled={busy}
              onClick={() => setBackup(null)}
            >
              Cancel
            </button>{" "}
            <button
              type="button"
              className="highlight-action"
              disabled={busy}
              onClick={() => void applyImport()}
            >
              {busy ? "Importing…" : "Import Data"}
            </button>
          </div>
        </div>
      )}
      {message && (
        <p className="backup-success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="backup-error" role="alert">
          {error}
        </p>
      )}
      <p className="backup-muted">
        Backups include job profiles, tracker records, saved answers, reusable
        custom information, learning preferences, active profile selection and
        stored resume files. Extension infrastructure, temporary state and
        browser settings are excluded.
      </p>
    </section>
  );
}
