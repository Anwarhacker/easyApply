import { PanelCloseButton } from "./PanelCloseButton";
import { useEffect, useRef, useState, useMemo } from "react";
import type { Profile } from "./model";
import { savedSections, profileText, profileFilename, savedRowMatches, savedRowsText } from "./saved-info";
import {
  readCustomEntries,
  changeCustomEntry,
  type CustomEntry,
} from "./custom-info";

import { downloadText as downloadFile } from "./text-download";

interface SavedRow {
  group?: string;
  key: string;
  title: string;
  value: string;
  isCustom?: boolean;
}

export function SavedInfo({
  profiles,
  initialId,
  onClose,
}: {
  profiles: Profile[];
  initialId: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const mutating = useRef(false);
  const entryOriginal = useRef({ title: "", value: "" });
  const [exportScope, setExportScope] = useState<"all" | "visible">("all");
  const [loadFailed, setLoadFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [custom, setCustom] = useState<CustomEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState(false);
  const [entryId, setEntryId] = useState("");
  const [entryTitle, setEntryTitle] = useState("");
  const [entryValue, setEntryValue] = useState("");
  const [id, setId] = useState(initialId || profiles[0]?.id || "");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [copiedKey, setCopiedKey] = useState("");
  const [failed, setFailed] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "profile" | "custom">("all");

  const profile = profiles.find((p) => p.id === id);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    setCustom([]);
    setEditor(false);
    void readCustomEntries(id)
      .then((entries) => {
        if (!cancelled) setCustom(entries);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadFailed(true);
          setFailed(true);
          setStatus(
            error instanceof Error
              ? error.message
              : "Could not load saved entries.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, retry]);

  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);

  function canDiscard() {
    return !editor || (entryTitle === entryOriginal.current.title && entryValue === entryOriginal.current.value)
      || window.confirm("Discard your unsaved entry changes?");
  }
  function close() { if (!saving && canDiscard()) onClose(); }
  function startEntry(entry?: CustomEntry) {
    if (!canDiscard()) return;
    entryOriginal.current = {title: entry?.title ?? "", value: entry?.value ?? ""};
    setEntryId(entry?.id ?? "");
    setEntryTitle(entry?.title ?? "");
    setEntryValue(entry?.value ?? "");
    setEditor(true);
    setStatus("");
  }

  async function updateEntry(
    change: { save: CustomEntry } | { remove: string },
  ) {
    if (mutating.current) return;
    mutating.current = true;
    setSaving(true);
    setFailed(false);
    try {
      const updated = await changeCustomEntry(id, change);
      setCustom(updated);
      setEditor(false);
      setCopiedKey("");
      setStatus("save" in change ? "Entry saved." : "Entry deleted.");
    } catch (error) {
      setFailed(true);
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not save entry. Please check the inputs.",
      );
    } finally {
      mutating.current = false;
      setSaving(false);
    }
  }

  const allRows: SavedRow[] = useMemo(() => {
    if (!profile) return [];
    const baseSections = savedSections(profile, []);
    const baseRows: SavedRow[] = baseSections.flatMap((s) =>
      s.rows.map((r) => ({
        key: r.key,
        title: r.title,
        value: r.value,
        isCustom: false,
        group: s.title,
      }))
    );
    const customRows: SavedRow[] = custom.map((c) => ({
      key: `custom:${c.id}`,
      title: c.title,
      value: c.value,
      isCustom: true,
      group: "Custom saved info",
    }));
    return [...customRows, ...baseRows];
  }, [profile, custom]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRows.filter((r) => {
      if (filterType === "custom" && !r.isCustom) return false;
      if (filterType === "profile" && r.isCustom) return false;
      if (!q) return true;
      return savedRowMatches(r, q);
    });
  }, [allRows, query, filterType]);

  async function copy(value: string, key: string, title = key) {
    setFailed(false);
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setStatus(`${title} copied.`);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? "" : prev));
      }, 2000);
    } catch {
      setFailed(true);
      setStatus("Copy was blocked by the browser. Please select text to copy.");
    }
  }

  function downloadText() {
    if (!profile) return;
    const text = exportScope === "all" ? profileText(profile, custom) : savedRowsText(filteredRows);
    downloadFile(text, exportScope === "all" ? profileFilename(profile) : profileFilename(profile).replace(/\.txt$/, "-results.txt"));
    setFailed(false);
    setStatus(`${exportScope === "all" ? allRows.length : filteredRows.length} entries downloaded.`);
  }

  return (
    <dialog
      ref={dialog}
      className="saved-dialog"
      aria-label="Saved info"
      onCancel={(event) => {
        if (saving) event.preventDefault();
        else { event.preventDefault(); close(); }
      }}
    >
      {/* Header */}
      <div className="saved-header">
        <div>
          <div className="flex items-center gap-2">
            <h2 id="saved-title" className="text-xl font-bold text-slate-800">
              Saved Info
            </h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">
              Application details
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Find profile answers and reusable notes for your applications.
          </p>
        </div>
        <PanelCloseButton label="Close saved info" disabled={saving} onClick={close} />
      </div>

      {/* Controls Bar: Profile Selector & Actions */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
            Profile:
          </span>
          <select
            aria-label="Saved profile"
            disabled={saving}
            value={id}
            onChange={(e) => {
              if (!canDiscard()) return;
              setId(e.target.value);
              setFilterType("all");
              setFailed(false);
              setQuery("");
              setStatus("");
              setCopiedKey("");
            }}
            className="text-xs font-medium bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-teal-500"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Export scope" value={exportScope} onChange={e => setExportScope(e.target.value as "all" | "visible")}>
            <option value="all">All saved entries</option><option value="visible">Current search results</option>
          </select>
          <button
            type="button"
            disabled={!profile || loading || saving || loadFailed || (exportScope === "visible" && !filteredRows.length)}
            onClick={downloadText}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-sm transition-all"
          >
            Download .txt
          </button>

          <button
            type="button"
            aria-label="+ Add entry"
            disabled={!profile || loading || saving || loadFailed}
            onClick={() => startEntry()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Entry
          </button>
        </div>
      </div>

      {/* Add / Edit Entry Drawer / Form */}
      {editor && (
        <form
          className="mt-3 p-4 bg-teal-50/60 border border-teal-200 rounded-xl shadow-inner transition-all animate-fadeIn"
          onSubmit={(event) => {
            event.preventDefault();
            void updateEntry({
              save: {
                id: entryId || crypto.randomUUID(),
                title: entryTitle.trim(),
                value: entryValue.trim(),
              },
            });
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-teal-900">
              {entryId ? "Edit saved entry" : "New saved entry"}
            </h3>
            <button
              type="button"
              disabled={saving}
              onClick={() => { if (canDiscard()) setEditor(false); }}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Cancel
            </button>
          </div>

          <fieldset disabled={saving} className="space-y-3">
            <div>
              <label htmlFor="custom-entry-title" className="text-xs font-semibold text-slate-700 mb-1">
                Title
              </label>
              <input
                id="custom-entry-title"
                autoFocus
                required
                maxLength={100}
                placeholder="e.g. Notice Period, Portfolio Link, Availability"
                value={entryTitle}
                onChange={(e) => setEntryTitle(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label htmlFor="custom-entry-value" className="text-xs font-semibold text-slate-700 mb-1">
                Value
              </label>
              <textarea
                id="custom-entry-value"
                required
                maxLength={10000}
                rows={3}
                placeholder="Enter the corresponding value..."
                value={entryValue}
                onChange={(e) => setEntryValue(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={saving}
              onClick={() => { if (canDiscard()) setEditor(false); }}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg shadow-sm"
              >
                {saving ? "Saving…" : "Save entry"}
              </button>
            </div>
          </fieldset>
        </form>
      )}

      {/* Search & Filter Bar */}
      <div className="mt-4 space-y-2">
        <div className="relative flex items-center">
          <span className="absolute left-3 text-slate-400 pointer-events-none">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            type="search"
            aria-label="Search saved info"
            placeholder="Search titles and answers..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-xs bg-white border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 shadow-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2.5 text-slate-400 hover:text-slate-600 p-0.5"
              aria-label="Clear search"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Filter Pills & Result Counter */}
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-pressed={filterType === "all"}
              onClick={() => setFilterType("all")}
              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors ${
                filterType === "all"
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All ({allRows.length})
            </button>
            <button
              type="button"
              aria-pressed={filterType === "custom"}
              onClick={() => setFilterType("custom")}
              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors ${
                filterType === "custom"
                  ? "bg-teal-700 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Custom ({custom.length})
            </button>
            <button
              type="button"
              aria-pressed={filterType === "profile"}
              onClick={() => setFilterType("profile")}
              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors ${
                filterType === "profile"
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Standard ({allRows.length - custom.length})
            </button>
          </div>

          <span className="text-[11px] font-medium">
            {filteredRows.length} {filteredRows.length === 1 ? "entry" : "entries"}
          </span>
        </div>
      </div>

      <div className="saved-bulk-actions">
        <button type="button" disabled={loading || saving || loadFailed || !allRows.length} onClick={() => void copy(profileText(profile!, custom), "bulk-all", "All saved info")}>Copy all</button>
        <button type="button" disabled={loading || saving || loadFailed || !filteredRows.length} onClick={() => void copy(savedRowsText(filteredRows), "bulk-results", "Search results")}>Copy results ({filteredRows.length})</button>
      </div>
      <p className="footnote">Only saved values are shown. Custom entries are for manual copying. Exports are plain text; encrypted identity is excluded.</p>
      {loadFailed && <button type="button" onClick={() => { setStatus(""); setRetry(v => v + 1); }}>Retry loading entries</button>}
      {/* Status Alert */}
      {status && (
        <div
          className={`mt-3 px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between ${
            failed
              ? "bg-rose-50 text-rose-700 border border-rose-200"
              : "bg-teal-50 text-teal-800 border border-teal-200"
          }`}
        >
          <p role={failed ? "alert" : "status"}>{status}</p>
          <button
            type="button"
            onClick={() => setStatus("")}
            className="text-xs opacity-60 hover:opacity-100 ml-2"
            aria-label="Dismiss status"
          >
            ✕
          </button>
        </div>
      )}

      {/* Key-Value List */}
      <div className="saved-entry-list mt-3 space-y-2.5 pr-1">
        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">
            <div className="spinner mx-auto mb-2" />
            Loading saved entries…
          </div>
        ) : !profile ? (
          <div className="py-10 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            Select or create a profile to view saved info.
          </div>
        ) : !allRows.length ? (
          <div className="py-10 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            No saved entries yet. Click <strong>+ Add Entry</strong> above to add one.
          </div>
        ) : !filteredRows.length ? (
          <div className="py-10 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            No saved entries match &ldquo;{query}&rdquo;.
            <div className="mt-2">
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setFilterType("all");
                }}
                className="text-teal-600 underline font-medium"
              >
                Reset search
              </button>
            </div>
          </div>
        ) : (
          filteredRows.map((row) => {
            const isCopied = copiedKey === row.key;
            return (
              <div
                key={row.key}
                className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white hover:bg-slate-50/80 rounded-xl border border-slate-200 hover:border-teal-300 transition-all shadow-xs"
              >
                {/* Key - Value content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-100">
                      {row.title}
                    </span>
                    {!row.isCustom && <span className="text-[10px] text-slate-500">{row.group}</span>}
                    {row.isCustom && (
                      <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                        custom
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-800 font-normal whitespace-pre-wrap break-words select-text pl-0.5">
                    {row.value}
                  </div>
                </div>

                {!row.isCustom && <button type="button" disabled={saving} aria-label={`Edit ${row.title} in Settings`} onClick={() => {
                  if (!canDiscard()) return;
                  void chrome.tabs.create({url: chrome.runtime.getURL(`settings.html?profile=${encodeURIComponent(id)}&${row.key.startsWith("answer:") ? `question=${encodeURIComponent(row.title)}` : `field=${encodeURIComponent(row.key)}`}`)});
                }}>Edit in Settings</button>}
                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    disabled={saving}
                    aria-label={`Copy ${row.title}`}
                    onClick={() => void copy(row.value, row.key, row.title)}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                      isCopied
                        ? "bg-emerald-600 text-white font-bold"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                    }`}
                    title="Copy value"
                  >
                    {isCopied ? (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Copied
                      </>
                    ) : (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        Copy
                      </>
                    )}
                  </button>

                  {row.isCustom && (
                    <>
                      <button
                        type="button"
                        disabled={saving}
                        aria-label={`Edit ${row.title}`}
                        onClick={() =>
                          startEntry(
                            custom.find((e) => `custom:${e.id}` === row.key),
                          )
                        }
                        className="px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200/70 rounded-lg transition-colors"
                        title="Edit entry"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        aria-label={`Delete ${row.title}`}
                        onClick={() => {
                          if (window.confirm(`Delete “${row.title}”?`)) {
                            void updateEntry({ remove: row.key.slice(7) });
                          }
                        }}
                        className="px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Delete entry"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </dialog>
  );
}
