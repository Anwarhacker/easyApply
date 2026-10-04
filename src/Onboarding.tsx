import { useEffect, useRef, useState } from "react";
import { z } from "zod";

const KEY = "onboarding:v2";
const progressSchema = z.object({
  done: z.boolean(),
  step: z.number().int().min(0).max(10),
});

const steps = [
  {
    title: "Welcome to easyApply",
    icon: "🚀",
    subtitle: "AI-Powered Job Application Co-Pilot",
    text: "Save application details locally and fill repetitive forms. Optional AI answers share selected career details with Groq only when you request generation.",
    hint: "Takes under one minute · You can skip or replay anytime",
    items: [
      "Local profile storage; optional online AI",
      "One-click form autofill & smart field detection",
      "Full user control — preview and edit every single match",
    ],
  },
  {
    title: "1-Click PDF Resume Parser",
    icon: "📄",
    subtitle: "Skip manual data entry",
    text: "Import your PDF resume and let easyApply automatically extract your full name, contact info, education, GPA, graduation year, and technical skills in local memory.",
    hint: "Zero API calls — parsed 100% client-side in browser memory.",
    items: [
      "Review and select extracted details before applying",
      "Extracts contact, education, and 40+ skills",
      "Support for multiple profiles (e.g. Frontend, DevOps)",
    ],
  },
  {
    title: "Local Resume Vault & Drag-and-Drop",
    icon: "🗄️",
    subtitle: "Attach resumes with zero browsing",
    text: "Save your resume locally. Use Attach to job page in the popup, or drag from the floating widget into a supported upload area on that same page. Download the file for other apps or unsupported websites.",
    hint: "Resume files stay on this device without extension-level encryption.",
    items: [
      "Same-page resume dragging from the floating widget",
      "Auto-detects resume upload zones on job portals",
      "Automatic file attachment during form fill",
    ],
  },
  {
    title: "Floating Quick Fill Widget & Hotkey",
    icon: "⚡",
    subtitle: "Fill supported job application forms",
    text: "Use the floating draggable widget or press Alt + Shift + F on supported job pages to fill forms instantly without switching tabs or reopening the extension popup.",
    hint: "Move the widget anywhere on the screen — it remembers your position.",
    items: [
      "Alt + Shift + F instant shortcut",
      "Draggable panel after you activate easyApply",
      "Supports common dropdowns and dates; others stay manual",
    ],
  },
  {
    title: "Smart Cover Letter & SOP Generator",
    icon: "✍️",
    subtitle: "Tailored to every company",
    text: "Generate customized Cover Letters, Statements of Purpose (SOP), 'About You', and 'Why Hire You' responses tailored to each company and job title with 3 tones.",
    hint: "Zero external AI APIs needed — runs instantly offline.",
    items: [
      "Auto-detects company name & position",
      "Professional, Enthusiastic, or Concise tone options",
      "Copy or apply directly into your profile",
    ],
  },
  {
    title: "Application Tracker & Encrypted Vault",
    icon: "🛡️",
    subtitle: "Stay organized & secure",
    text: "Auto-detects job submissions to log company, role, date, and status. Keep sensitive PAN/Aadhaar locked in a PBKDF2 AES-GCM 256-bit encrypted vault.",
    hint: "Do not put passwords or banking credentials in notes or profile fields.",
    items: [
      "Detects supported submissions; verify employer confirmation",
      "Search, filter, and track interview progress",
      "Encrypted identity vault with 2-minute auto-lock",
    ],
  },
] as const;

export function Onboarding({
  ready,
  hasProfile,
  onCreate,
}: {
  ready: boolean;
  hasProfile: boolean;
  onCreate: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const modal = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const saving = useRef(false);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void chrome.storage.local
      .get(KEY)
      .then((data) => {
        const progress = progressSchema.safeParse(data[KEY]);
        if (cancelled || (progress.success && progress.data.done)) return;
        const index = progress.success ? progress.data.step : 0;
        setStep(
          Number.isInteger(index) && index >= 0 && index < steps.length
            ? index
            : 0,
        );
        setOpen(true);
      })
      .catch(() => {
        if (!cancelled)
          setError(
            "Could not load the welcome guide. Use Quick tour to try it.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  useEffect(() => {
    if (!open) return;
    const el = modal.current;
    el?.showModal();
    heading.current?.focus();
    return () => el?.close();
  }, [open]);

  useEffect(() => {
    if (open) {
      heading.current?.focus();
      modal.current?.scrollTo(0, 0);
    }
  }, [step, open]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        if (step < steps.length - 1) {
          void move(step + 1);
        }
      } else if (e.key === "ArrowLeft") {
        if (step > 0) {
          void move(step - 1);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, step]);

  async function move(next: number, done = false, create = false) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await chrome.storage.local.set({ [KEY]: { done, step: next } });
      if (done) {
        if (create) await onCreate();
        setOpen(false);
        if (!create) trigger.current?.focus();
      } else setStep(next);
    } catch {
      setError("Could not save your tour progress. Please try again.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  const current = steps[step];

  return (
    <>
      <div className="tour-launch">
        <button
          ref={trigger}
          disabled={!ready}
          type="button"
          className="tour-launch-btn"
          onClick={() => {
            setStep(0);
            setError("");
            setOpen(true);
          }}
        >
          ✨ Quick tour
        </button>
        <span>Explore all features & interactive walkthrough</span>
      </div>

      {!open && error && <p role="alert">{error}</p>}

      {open && (
        <dialog
          ref={modal}
          className="saved-dialog tour-dialog"
          aria-labelledby="tour-heading"
          aria-describedby="tour-description"
          onCancel={(event) => {
            event.preventDefault();
            if (!busy) void move(step, true);
          }}
        >
          <div className="saved-header">
            <span className="eyebrow">QUICK TOUR</span>
            <button
              type="button"
              className="tour-skip-btn"
              disabled={busy}
              onClick={() => void move(step, true)}
            >
              Skip tour ✕
            </button>
          </div>

          <div
            className="tour-progress"
            aria-label={`Step ${step + 1} of ${steps.length}`}
          >
            {steps.map((_, i) => (
              <span
                key={i}
                className={i <= step ? "complete" : ""}
                title={`Step ${i + 1}: ${steps[i].title}`}
              />
            ))}
          </div>

          <div className="tour-badge-row">
            <div className="tour-number" aria-hidden="true">
              {current.icon}
            </div>
            <div className="tour-meta">
              <span className="tour-step-pill">
                STEP {step + 1} OF {steps.length}
              </span>
              <span className="tour-subtitle">{current.subtitle}</span>
            </div>
          </div>

          <h2 id="tour-heading" ref={heading} tabIndex={-1}>
            {current.title}
          </h2>

          <p id="tour-description">{current.text}</p>

          <ul className="tour-example">
            {current.items.map((item) => (
              <li key={item}>
                <span aria-hidden="true" className="tour-check">
                  ✓
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <p className="tour-hint">💡 {current.hint}</p>

          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}

          {busy && <p role="status">Saving progress…</p>}

          <div className="tour-navigation">
            <button
              type="button"
              className="tour-btn tour-btn-secondary"
              disabled={busy || step === 0}
              onClick={() => void move(step - 1)}
            >
              ← Back
            </button>
            <div className="tour-dots">
              {steps.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Go to step ${i + 1}`}
                  className={`tour-dot ${i === step ? "active" : ""}`}
                  onClick={() => void move(i)}
                />
              ))}
            </div>
            <button
              type="button"
              className="tour-btn tour-btn-primary"
              disabled={busy}
              onClick={() =>
                void move(
                  Math.min(step + 1, steps.length - 1),
                  step === steps.length - 1,
                  step === steps.length - 1 && !hasProfile,
                )
              }
            >
              {step === steps.length - 1
                ? hasProfile
                  ? "Finish tour ✓"
                  : "Create my profile ↗"
                : "Next →"}
            </button>
          </div>

          <div className="tour-footer-hint">
            <span>Use Left / Right arrow keys to navigate</span>
            <span>·</span>
            <span>Replay anytime</span>
          </div>
        </dialog>
      )}
    </>
  );
}
