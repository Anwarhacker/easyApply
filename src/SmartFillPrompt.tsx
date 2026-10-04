import { useState, useRef } from "react";
import { PanelCloseButton } from "./PanelCloseButton";
import { resumePrompt } from "./resume-prompt";
import { groups, type Profile } from "./model";
import { downloadText } from "./text-download";
const roles = [
  "Frontend Developer",
  "Full Stack Developer",
  "Java Full Stack Developer",
  "MERN Stack Developer",
  "Backend Developer",
  "Java Developer",
  "DevOps Engineer",
];

export function SmartFillPrompt({ open, onClose, profile }: { open: boolean; onClose: () => void; profile?: Profile }) {
  const initialRole = profile?.values.preferredRole?.trim() || "Frontend Developer";
  const [scope, setScope] = useState<"all" | "missing">("all");
  const [jobDescription, setJobDescription] = useState("");
  const preview = useRef<HTMLTextAreaElement>(null);
  const fields = Object.values(groups).flat().filter(key => scope === "all" || !profile?.values[key]?.trim());
  const [selectedRole, setSelectedRole] = useState(roles.includes(initialRole) ? initialRole : "other"),
    [customRole, setCustomRole] = useState(roles.includes(initialRole) ? "" : initialRole),
    [copying, setCopying] = useState(false),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  const role = selectedRole === "other" ? customRole : selectedRole;
  const valid = !!role.trim() && fields.length > 0,
    prompt = resumePrompt(role, {fields, jobDescription});
  return (
    <section className="smart-prompt" onKeyDown={event => { if (open && event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
      {open && (
        <div id="smart-prompt-panel" className="card">
          <div className="smart-prompt-header">
            <h2>Turn your resume into profile answers</h2>
            <PanelCloseButton label="Close Smart fill" onClick={onClose} />
          </div>
          <p className="smart-fill-instructions">
            Copy this prompt, paste it into ChatGPT, and attach your resume
            there. Review the answers, then enter them in Settings.
          </p>
          <label htmlFor="prompt-role">Target role</label>
          <select
            id="prompt-role"
            value={selectedRole}
            disabled={copying}
            onChange={(e) => {
              setSelectedRole(e.target.value);
              setMessage("");
            }}
            aria-describedby="prompt-role-help"
          >
            {roles.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
            <option value="other">Other role…</option>
          </select>
          {selectedRole === "other" && (
            <>
              <label htmlFor="custom-prompt-role">Custom target role</label>
              <input
                id="custom-prompt-role"
                maxLength={100}
                value={customRole}
                disabled={copying}
                onChange={(e) => {
                  setCustomRole(e.target.value);
                  setMessage("");
                }}
                placeholder="Enter your target role"
              />
            </>
          )}
          <p id="prompt-role-help" className="footnote">
            Choose Frontend Developer, Full Stack Developer, or another listed
            role. Choose Other role to type your own.
          </p>
          <label htmlFor="prompt-scope">Fields to prepare</label>
          <select id="prompt-scope" value={scope} disabled={copying} onChange={e => { setScope(e.target.value as "all" | "missing"); setMessage(""); }}>
            <option value="all">All profile fields</option>
            <option value="missing" disabled={!profile}>Only missing fields in this profile</option>
          </select>
          <p className="footnote">{fields.length} fields included{profile ? ` · ${profile.title}` : ""}. Saved values are never added to the prompt.</p>
          <label htmlFor="prompt-job">Job description (optional)</label>
          <textarea id="prompt-job" rows={3} maxLength={6000} value={jobDescription} disabled={copying} placeholder="Paste the role's responsibilities and requirements to tailor the suggestions."
            onChange={e => { setJobDescription(e.target.value); setMessage(""); }} />
          <label htmlFor="resume-prompt">Prompt to copy</label>
          <textarea
            ref={preview}
            id="resume-prompt"
            className="prompt-preview"
            readOnly
            rows={9}
            value={prompt}
            spellCheck={false}
          />
          <button
            type="button"
            className="primary wide"
            disabled={!valid || copying}
            onClick={async () => {
              setCopying(true);
              setFailed(false);
              setMessage("");
              try {
                await navigator.clipboard.writeText(prompt);
                setMessage(
                  "Prompt copied. Paste it into ChatGPT and attach your resume.",
                );
              } catch {
                setFailed(true);
                setMessage(
                  "Copy was blocked. Select the prompt text and copy it manually.",
                );
              } finally {
                setCopying(false);
              }
            }}
          >
            {copying ? "Copying…" : "Copy prompt"}
          </button>
          <div className="smart-prompt-actions">
            <button type="button" disabled={!valid || copying} onClick={() => { preview.current?.focus(); preview.current?.select(); }}>Select prompt</button>
            <button type="button" disabled={!valid || copying} onClick={() => {
              downloadText(prompt, "easyApply-resume-prompt.txt"); setFailed(false); setMessage("Prompt downloaded. Attach your resume when using it.");
            }}>Download prompt</button>
          </div>
          {!valid && (
            <p className="notice">{!role.trim() ? "Enter a target role to copy the prompt." : "No missing fields. Choose All profile fields to prepare a fresh profile."}</p>
          )}
          {message && (
            <p
              role={failed ? "alert" : "status"}
              className={failed ? "notice error" : "notice"}
            >
              {message}
            </p>
          )}
          <p className="footnote">
            This copies instructions only. easyApply does not upload your
            resume or send data to ChatGPT. Copying includes any job description you entered. It does not import answers
            automatically.
          </p>
        </div>
      )}
    </section>
  );
}
