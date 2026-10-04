import { PanelCloseButton } from "./PanelCloseButton";
import React, { useState, useEffect, useRef } from "react";
import type { Profile } from "./model";
import type { Application } from "./model";
import {
  generateAll,
  type CoverLetterTone,
  type CoverLetterSection,
} from "./cover-letter";

interface Props {
  profile: Profile;
  applications: Application[];
  onApply: (field: string, value: string) => void;
  onClose: () => void;
}

const TONES: { id: CoverLetterTone; label: string; emoji: string }[] = [
  { id: "professional", label: "Professional", emoji: "🎯" },
  { id: "enthusiastic", label: "Enthusiastic", emoji: "🔥" },
  { id: "concise",      label: "Concise",      emoji: "⚡" },
];

const TABS: { id: CoverLetterSection; label: string; field: string | null }[] = [
  { id: "aboutYou",    label: "About You",        field: "aboutYou" },
  { id: "whyHire",     label: "Why Hire Me",       field: "whyHire" },
  { id: "whyCompany",  label: "Why This Company",  field: "whyCompany" },
  { id: "coverLetter", label: "Full Cover Letter", field: null },
];

export function CoverLetterModal({ profile, applications, onApply, onClose }: Props) {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState(profile.values.preferredRole ?? "");
  const [achievement, setAchievement] = useState("");
  const [companyInterest, setCompanyInterest] = useState("");
  const [edited, setEdited] = useState<Partial<Record<CoverLetterSection, boolean>>>({});
  const [replacePending, setReplacePending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
  const [tone,    setTone]      = useState<CoverLetterTone>("professional");
  const [tab,     setTab]       = useState<CoverLetterSection>("coverLetter");
  const [variant, setVariant]   = useState(0);
  const [generated, setGenerated] = useState<Record<CoverLetterSection, string>>(() => generateAll(profile.values, { company: "", role: profile.values.preferredRole ?? "", tone: "professional" }));
  const [copied, setCopied]     = useState(false);
  const [appliedSection, setAppliedSection] = useState<string | null>(null);

  /** Unique companies from tracker history for datalist */
  const pastCompanies = [...new Set(applications.map((a) => a.company).filter(Boolean))];

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLInputElement>("#cl-company")?.focus();
    return () => { previous?.focus(); };
  }, []);

  function handleRegenerate() {
    if (edited[tab] && !replacePending) { setReplacePending(true); return; }
    const nextVariant = variant + 1;
    const result = generateAll(profile.values, {company, role, tone, achievement, companyInterest, variantIndex: nextVariant});
    setGenerated(g => ({...g, [tab]: result[tab]}));
    setVariant(nextVariant);
    setEdited(e => ({...e, [tab]: false}));
    setReplacePending(false);
    setCopied(false);
    setFeedback("Draft updated. Review the wording before using it.");
  }

  function download() {
    const url = URL.createObjectURL(new Blob([generated[tab]], {type:"text/plain;charset=utf-8"}));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${tab}-${company || "application"}`.replace(/[^a-z0-9_-]/gi, "-").slice(0, 100) + ".txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setFeedback("Text download started.");
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(generated[tab]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setFeedback("Copy was blocked. Select the draft text to copy it, or download it.");
    }
  }

  function handleApply() {
    const activeTab = TABS.find((t) => t.id === tab);
    if (!activeTab?.field) return;
    onApply(activeTab.field, generated[tab]);
    setAppliedSection(activeTab.label);
    setTimeout(() => setAppliedSection(null), 2000);
  }

  const currentText   = generated[tab];
  const wordCount     = currentText.trim() ? currentText.trim().split(/\s+/).length : 0;
  const activeTabMeta = TABS.find((t) => t.id === tab)!;

  return (
    <div ref={dialog} className="cl-overlay" role="dialog" aria-modal="true" aria-label="Cover letter generator"
      onKeyDown={event => {
        if (event.key === "Escape") { event.stopPropagation(); onClose(); }
        if (event.key !== "Tab") return;
        const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, [tabindex="0"]') ?? []);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <div className="cl-modal cl-generator">
        {/* ── Header ── */}
        <div className="cl-header">
          <span className="cl-title">✍ Cover Letter Generator</span>
          <PanelCloseButton label="Close Cover letter" onClick={onClose} />
        </div>

        {/* ── Inputs ── */}
        <div className="cl-inputs">
          <div className="cl-input-group">
            <label htmlFor="cl-company">Company</label>
            <input
              id="cl-company"
              list="cl-companies"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Google, TCS, Infosys…"
              autoComplete="off"
            />
            <datalist id="cl-companies">
              {pastCompanies.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div className="cl-input-group">
            <label htmlFor="cl-role">Job Title</label>
            <input
              id="cl-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Software Engineer, SDE Intern…"
            />
          </div>
        </div>

        <div className="cl-inputs">
          <div className="cl-input-group">
            <label htmlFor="cl-achievement">Relevant achievement or contribution</label>
            <textarea id="cl-achievement" rows={3} maxLength={2000} value={achievement} onChange={e => setAchievement(e.target.value)} placeholder="Use a real example: what you did and the result. Otherwise, your saved project details are used." />
          </div>
          <div className="cl-input-group">
            <label htmlFor="cl-interest">Why this company?</label>
            <textarea id="cl-interest" rows={3} maxLength={1500} value={companyInterest} onChange={e => setCompanyInterest(e.target.value)} placeholder="Write a sentence about a specific product, mission, or team that interests you." />
          </div>
        </div>
        <p className="cl-guidance">Change the details, then choose Update draft. Only the open section is updated; your other drafts stay intact.</p>
        {(!profile.values.skills?.trim() || !company.trim() || !role.trim()) && <p className="cl-guidance">For a stronger draft, add {[
          !company.trim() && "a company", !role.trim() && "a job title", !profile.values.skills?.trim() && "skills to your profile",
        ].filter(Boolean).join(", ")}. Missing qualifications are left out.</p>}
        {/* ── Tone selector ── */}
        <div className="cl-tone-row">
          <span className="cl-tone-label">Tone</span>
          <div className="cl-tone-pills">
            {TONES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`cl-tone-pill${tone === t.id ? " active" : ""}`}
                aria-pressed={tone === t.id}
                onClick={() => { setTone(t.id); setReplacePending(false); }}
              >
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Section tabs ── */}
        <div className="cl-tabs" role="tablist" aria-label="Draft sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              id={`cl-tab-${t.id}`}
              aria-controls="cl-draft-panel"
              tabIndex={tab === t.id ? 0 : -1}
              role="tab"
              onKeyDown={event => {
                const index = TABS.findIndex(item => item.id === tab);
                const next = event.key === "ArrowRight" ? (index + 1) % TABS.length : event.key === "ArrowLeft" ? (index + TABS.length - 1) % TABS.length : event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : -1;
                if (next < 0) return;
                event.preventDefault(); setTab(TABS[next].id); setReplacePending(false); setCopied(false);
                document.getElementById(`cl-tab-${TABS[next].id}`)?.focus();
              }}
              aria-selected={tab === t.id}
              className={`cl-tab${tab === t.id ? " active" : ""}`}
              onClick={() => { setTab(t.id); setReplacePending(false); setCopied(false); setAppliedSection(null); setFeedback(""); }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Preview textarea ── */}
        <div className="cl-preview-wrap" id="cl-draft-panel" role="tabpanel" aria-labelledby={`cl-tab-${tab}`}>
          <textarea
            className="cl-preview"
            value={currentText}
            onChange={(e) => { setGenerated((g) => ({ ...g, [tab]: e.target.value })); setEdited(g => ({...g, [tab]: true})); setCopied(false); setFeedback(""); }}
            rows={10}
            aria-label={activeTabMeta.label}
          />
          <span className="cl-word-count">{wordCount} words · {currentText.length} characters{edited[tab] ? " · Edited" : ""}</span>
        </div>

        {/* ── Actions ── */}
        <div className="cl-actions">
          <button type="button" className="cl-btn cl-btn-secondary" onClick={handleRegenerate}>
            {replacePending ? "Replace edited draft" : "Update draft"}
          </button>
          {replacePending && <button type="button" className="cl-btn cl-btn-secondary" onClick={() => setReplacePending(false)}>Keep my edits</button>}
          <div className="cl-actions-right">
            <button type="button" className="cl-btn cl-btn-secondary" disabled={!currentText.trim()} onClick={download}>Download .txt</button>
            <button type="button" className="cl-btn cl-btn-secondary" disabled={!currentText.trim()} onClick={handleCopy}>
              {copied ? "✓ Copied!" : "📋 Copy"}
            </button>
            {activeTabMeta.field && (
              <button type="button" className="cl-btn cl-btn-primary" disabled={!currentText.trim()} onClick={handleApply}>
                {appliedSection ? `✓ Applied to ${appliedSection}` : "✅ Apply to Profile"}
              </button>
            )}
          </div>
        </div>

        {replacePending && <p className="cl-guidance" role="status">Updating this section will replace your edits. Other sections will be kept.</p>}
        <p className="cl-guidance" role="status">{feedback}</p>
        {/* ── Privacy note ── */}
        <p className="cl-privacy">
          🔒 Generated on your device from your saved profile and supplied details. Review every claim before sending. Draft edits are cleared when this window closes.
        </p>
      </div>
    </div>
  );
}
