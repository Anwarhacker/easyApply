import { SavedAccounts } from "./SavedAccounts";
import { LearningSettings } from "./LearningSettings";
import { mergeProfileEdits } from "./profile-edits";
import { WorkspaceDashboard } from "./WorkspaceDashboard";
import { JobMatchPanel } from "./JobMatchPanel";
import { Tracker } from "./Tracker";
import { disclosureOptions, disclosureKeys } from "./disclosures";
import { essentials, missingEssentials, matchStatus, type MatchStatus } from "./fill-insights";
import { memoryCandidateSchema, questionKey, safeMemoryQuestion, mergeRememberedAnswers } from "./field-memory";
import { kindLabels } from "./ai";
import { scanAndFillAI, regenerateScannedAI, type ScannedAIField } from "./scan-ai";
import { AIAnswers } from "./AIAnswers";
import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  blankProfile,
  groups,
  label,
  profileSchema,
  type Profile,
  type Match,
  type Application,
  type Sensitive,
  type Field,
} from "./model";
import {
  readData,
  saveProfiles,
  patchProfileValues,
  saveActiveProfile,
  commitApplicationChanges,
  seal,
  unlock,
  restrictStorage,
} from "./storage";
import contentPath from "./content?script";
import { connectToPage, connectionError, withTimeout } from "./connection";
import { PREVIEW_TTL, applicationSchema } from "./security";
import "./style.css";
import { fieldOptions, type FresherField } from "./fresher";
import { SavedInfo } from "./SavedInfo";
import { Features } from "./Features";
import { Onboarding } from "./Onboarding";
import { labelExamples } from "./label-examples";
import { SmartFillPrompt } from "./SmartFillPrompt";
import { WhyHireBoxes } from "./WhyHireBoxes";
import { AboutYouBox } from "./AboutYouBox";
import { AnswerLibrary } from "./AnswerLibrary";
import { getAnswerLibrary, recordAnswerUsage } from "./answer-library";
import { ResumeParserModal } from "./ResumeParserModal";
import { CoverLetterModal } from "./CoverLetterModal";
import { ResumeVaultCard } from "./ResumeVaultCard";
import {
  getStoredResume,
  deleteStoredResume,
  type StoredResume,
} from "./resume-vault";
function ProfileSection({ title, headingId, children }: { title: string; headingId?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <section className="card">
    <details className="profile-section" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
      <summary><h2 id={headingId} tabIndex={-1}>{title}</h2></summary>
      <div className="profile-section-body">{children}</div>
    </details>
  </section>;
}
function revealProfileControl(element: HTMLElement | null) {
  if (!element) return;
  let parent = element.closest("details");
  while (parent) { parent.open = true; parent = parent.parentElement?.closest("details") ?? null; }
  element.scrollIntoView({block:"center"});
  element.focus({preventScroll:true});
}
function App() {
  const [showJobMatch, setShowJobMatch] = useState(false);
  const [trackerDueOnly, setTrackerDueOnly] = useState(() => new URLSearchParams(location.search).get("due") === "1");
  const [scannedAIFields, setScannedAIFields] = useState<ScannedAIField[]>([]);
  const [regeneratingAI, setRegeneratingAI] = useState<string>();
  const [autoAI, setAutoAI] = useState(true);
  const [showAI, setShowAI] = useState(false);
  const smartButton = useRef<HTMLButtonElement>(null);
  const [smartOpen, setSmartOpen] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [matchFilter, setMatchFilter] = useState<MatchStatus | "all">("all");
  const [matchSearch, setMatchSearch] = useState("");
  const [answerQuestion, setAnswerQuestion] = useState(() => new URLSearchParams(location.search).get("question")?.slice(0, 500) ?? "");
  const [answerValue, setAnswerValue] = useState("");
  const [answerError, setAnswerError] = useState("");
  const [answerAdded, setAnswerAdded] = useState(false);
  const [profileSavedToast, setProfileSavedToast] = useState(0);
  useEffect(() => {
    if (!profileSavedToast) return;
    const timer = setTimeout(() => setProfileSavedToast(0), 5000);
    return () => clearTimeout(timer);
  }, [profileSavedToast]);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [showCoverLetterModal, setShowCoverLetterModal] = useState(false);
  const [savedResume, setSavedResume] = useState<StoredResume | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeLoadError, setResumeLoadError] = useState("");
  const [resumeRefresh, setResumeRefresh] = useState(0);
  const savedButton = useRef<HTMLButtonElement>(null);
  const saveProfileButton = useRef<HTMLButtonElement>(null);
  const addAnswerButton = useRef<HTMLButtonElement>(null);
  const settings = location.pathname.includes("settings");
  const initialTab =
    (new URLSearchParams(location.search).get("tab") as string) ||
    location.hash.replace("#", "") ||
    "profiles";
  const [profiles, setProfiles] = useState<Profile[]>([]),
    [apps, setApps] = useState<Application[]>([]),
    [active, setActive] = useState(""),
    [tab, setTab] = useState(
      ["profiles", "identity", "tracker", "answers"].includes(initialTab) ? initialTab : "profiles"
    ),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [matches, setMatches] = useState<Match[]>([]),
    [target, setTarget] = useState<number>(),
    [pass, setPass] = useState(""),
    [identity, setIdentity] = useState<Sensitive>({ pan: "", aadhaar: "" }),
    [confirmed, setConfirmed] = useState(false);
  const [operation, setOperation] = useState("Loading your saved data…"),
    [failed, setFailed] = useState(false),
    [loaded, setLoaded] = useState(false),
    [pageUrl, setPageUrl] = useState(""),
    [scanToken, setScanToken] = useState("");
  const working = useRef(false);
  const previewProfile = useRef<Profile | null>(null);
  function lockIdentity() {
    setIdentity({ pan: "", aadhaar: "" });
    setPass("");
    setMatches([]);
    setConfirmed(false);
    setScanToken("");
  }
  useEffect(() => {
    if (!identity.pan && !identity.aadhaar) return;
    const timer = setTimeout(() => {
      lockIdentity();
      setMessage("Identity automatically locked after two minutes.");
    }, PREVIEW_TTL);
    return () => clearTimeout(timer);
  }, [identity]);
  useEffect(() => {
    if (!scanToken) return;
    const timer = setTimeout(() => {
      setMatches([]);
      setScanToken("");
      setConfirmed(false);
      setMessage("Preview expired. Scan again to use the current page.");
    }, PREVIEW_TTL);
    return () => clearTimeout(timer);
  }, [scanToken]);
  const form = useForm<Profile>({
    resolver: zodResolver(profileSchema),
    defaultValues: blankProfile(),
  });
  // Subscribe during render; reading isDirty only in an event handler does not
  // subscribe React Hook Form to dirty-state updates.
  const isProfileDirty = form.formState.isDirty;
  const profile = profiles.find((p) => p.id === active);
  const resumeActiveId = useRef(active);
  resumeActiveId.current = active;
  useEffect(() => {
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local") return;
      if (changes.applications && Array.isArray(changes.applications.newValue)) {
        const rows = changes.applications.newValue.map(value => applicationSchema.safeParse(value));
        if (rows.length <= 5000 && rows.every(row => row.success)) setApps(rows.flatMap(row => row.success ? [row.data] : []));
      }
      if (!changes.profiles) return;
      const next = changes.profiles.newValue;
      if (!Array.isArray(next)) return;
      const parsed = next.map(value => profileSchema.safeParse(value));
      if (parsed.some(value => !value.success)) return;
      const incoming = parsed.flatMap(value => value.success ? [value.data] : []);
      setProfiles(incoming);
      const selected = incoming.find(value => value.id === active);
      const previous = (changes.profiles.oldValue as Profile[] | undefined)?.find(value => value.id === active);
      if (JSON.stringify(previous) !== JSON.stringify(selected)) {
        setMatches([]); setScanToken(""); setConfirmed(false); setScannedAIFields([]);
        if (selected && !form.formState.isDirty && !working.current) form.reset(selected);
      }
      if (selected && !form.getFieldState("customFieldAnswers").isDirty)
        form.setValue("customFieldAnswers", selected.customFieldAnswers ?? {}, {shouldDirty:false});
    };
    chrome.storage.onChanged.addListener(changed);
    return () => chrome.storage.onChanged.removeListener(changed);
  }, [active, form]);
  const openedRequestedField = useRef(false);
  useEffect(() => {
    if (!loaded || busy || !settings || openedRequestedField.current) return;
    openedRequestedField.current = true;
    const requested = new URLSearchParams(location.search).get("field");
    if (requested && Object.values(groups).flat().includes(requested as Field)) {
      revealProfileControl(document.getElementById(`profile-${requested}`));
    } else if (new URLSearchParams(location.search).has("question")) {
      revealProfileControl(document.getElementById("remembered-answer-editor"));
    }
  }, [loaded, busy, settings, form]);
  const missing = missingEssentials(form.watch("values"));
  const visibleMatches = matches.filter(m => (matchFilter === "all" || matchStatus(m) === matchFilter) && `${m.label} ${m.reason ?? ""}`.toLowerCase().includes(matchSearch.toLowerCase().trim()));
  async function run(fn: () => Promise<void>, label = "Saving changes…") {
    if (working.current) return;
    working.current = true;
    setOperation(label);
    setFailed(false);
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setFailed(true);
      if (label.startsWith("Filling")) lockIdentity();
      setMessage(connectionError(e));
    } finally {
      setBusy(false);
      working.current = false;
    }
  }
  async function load() {
    await run(async () => {
      await restrictStorage();
      const d = await readData();
      setProfiles(d.profiles);
      setApps(d.applications);
      const requestedProfile = new URLSearchParams(location.search).get("profile");
      const selectedId = d.profiles.some(p => p.id === requestedProfile) ? requestedProfile! : d.activeProfileId;
      choose(selectedId);
      form.reset(d.profiles.find((p) => p.id === selectedId) ?? blankProfile());
      setLoaded(true);
    }, "Loading your saved data…");
  }
  useEffect(() => {
    void load();
  }, []); // initial local load
  useEffect(() => {
    const handleHash = () => {
      const h = location.hash.replace("#", "");
      if (["profiles", "identity", "tracker"].includes(h)) {
        setTab(h);
      }
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);
  useEffect(() => {
    let cancelled = false;
    setSavedResume(null); setResumeLoadError(""); setResumeLoading(!!active);
    if (active) void getStoredResume(active).then(res => {
      if (!cancelled) setSavedResume(res);
    }).catch(error => {
      if (!cancelled) setResumeLoadError(error instanceof Error ? error.message : "Could not load the saved resume.");
    }).finally(() => { if (!cancelled) setResumeLoading(false); });
    return () => { cancelled = true; };
  }, [active, resumeRefresh]);
  function choose(id: string) {
    if (loaded) { setAnswerQuestion(""); setAnswerValue(""); }
    setAnswerError(""); setAnswerAdded(false);
    setScannedAIFields([]);
    setActive(id);
    form.reset(profiles.find((p) => p.id === id) ?? blankProfile());
    setMatches([]);
    setIdentity({ pan: "", aadhaar: "" });
    setPass("");
    setConfirmed(false);
    setScanToken("");
    setSavedResume(null);
    setResumeLoading(!!id);
  }
  function canLeaveDraft() {
    return !settings || (!isProfileDirty && !answerValue.trim() && !answerQuestion.trim()) || window.confirm("Discard unsaved changes to this profile?");
  }
  async function updateProfileAnswer(field: "aboutYou" | "whyHire", text: string) {
    if (!profile) throw new Error("Select a saved profile first.");
    const next = await patchProfileValues(profile, { [field]: text });
    setProfiles(next);
    form.setValue(`values.${field}`, text);
  }
  async function scan() {
    setScannedAIFields([]);
    setMatches([]);
    setTarget(undefined);
    setConfirmed(false);
    const latest = await readData();
    const profile = latest.profiles.find(p => p.id === active);
    if (!profile) throw Error("Create and save a profile in Settings first.");
    setProfiles(latest.profiles);
    previewProfile.current = profile;
    const [current] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!current?.id || !/^https?:/.test(current.url ?? ""))
      throw Error(
        "Open a regular http/https job application page, then reopen easyApply.",
      );
    await connectToPage(current.id, contentPath);
    let resumeStatus: string;
    try {
      const upload = await withTimeout(chrome.tabs.sendMessage(current.id, { type: "fill-saved-resume", profileId: profile.id }, { frameId: 0 }));
      resumeStatus = upload?.error ? `Resume: ${upload.error}` : upload.message;
    } catch { resumeStatus = "Could not attach the saved resume. Check the resume field on the page."; }
    let aiStatus = "";
    if (autoAI) {
      setOperation("Scanning and generating AI answers…");
      try { const aiResult = await scanAndFillAI(current.id, profile); aiStatus = aiResult.message; setScannedAIFields(aiResult.fields); }
      catch (error) { aiStatus = `AI could not finish: ${error instanceof Error ? error.message : String(error)} Ordinary fields are still available for review.`; }
    }

    let answerLibrary = [] as Awaited<ReturnType<typeof getAnswerLibrary>>;
    let answerLibraryStatus = "";
    try { answerLibrary = await getAnswerLibrary(); }
    catch (error) { answerLibraryStatus = error instanceof Error ? `Saved answer suggestions unavailable: ${error.message}` : "Saved answer suggestions unavailable."; }

    const rememberedProfile = (await readData()).profiles.find(p => p.id === profile.id);
    const result = await withTimeout(
      chrome.tabs.sendMessage(
        current.id,
        {
          type: "detect",
          profileId: profile.id,
          customFieldAnswers: rememberedProfile?.customFieldAnswers,
          customFieldAnswerKinds: rememberedProfile?.customFieldAnswerKinds,
          answerLibrary,
          values: { ...profile.values, ...identity },
        },
        { frameId: 0 },
      ),
    );
    if (result.error) throw Error(result.error);
    setTarget(current.id);
    setScanToken(result.scanId);
    setPageUrl(result.url);
    setMatches(result.matches);
    setMatchFilter("all");
    setMatchSearch("");
    setConfirmed(false);
    setMessage([resumeStatus, answerLibraryStatus, aiStatus || (
      result.matches.length
        ? result.matches.some((m: Match) => m.selected)
          ? "Review each value before filling."
          : "No fields are selected. Check that your profile has values for these fields. Unrecognized or unsupported fields need manual entry."
        : "No eligible fields found. Embedded frames and closed shadow roots are not supported."),
      result.matches.some((m: Match) => m.answerSuggestions?.length) ? "Choose a saved answer below to add it to the reviewed fill list." : ""].filter(Boolean).join(" "),
    );
  }
  return (
    <main className={settings ? "settings" : "popup"} aria-busy={busy}>
      <header className="app-header">
        <div className="header-top">
        <div className="brand">
          <img src="/icons/logo.svg" alt="" width="36" height="36" />
          <span>
            easy<span className="brand-accent">Apply</span>
          </span>
        </div>
        <button className="header-ai-button" type="button" disabled={!profile || busy || !loaded} onClick={() => setShowAI(true)}>AI answers</button>
        </div>
        <div className="header-actions" aria-label="Application tools">
          <button type="button" className="highlight-action" disabled={!profile || busy || !loaded} onClick={() => setShowJobMatch(true)}>Resume ↔ Job Match</button>
          <button
            type="button"
            className="highlight-action"
            title="Generate personalized cover letter, SOP, about you & why hire"
            disabled={!profile || busy || !loaded}
            onClick={() => setShowCoverLetterModal(true)}
          >
            Cover letter
          </button>
          <button
            type="button"
            className="highlight-action"
            title="Extract profile fields locally from your PDF resume"
            onClick={() => setShowResumeModal(true)}
          >
            PDF resume
          </button>
          <button
            type="button"
            className="highlight-action"
            ref={smartButton}
            aria-expanded={smartOpen}
            aria-controls="smart-prompt-panel"
            onClick={() => setSmartOpen(!smartOpen)}
          >
            Smart fill
          </button>
          <button
            ref={savedButton}
            className="saved-info-button"
            disabled={busy || !loaded}
            onClick={() =>
              void run(async () => {
                const data = await readData();
                setProfiles(data.profiles);
                setShowSaved(true);
              }, "Loading saved info…")
            }
          >
            Saved info
          </button>
        </div>
      </header>
      {loaded && <SavedAccounts />} 
      {showAI && profile && <AIAnswers key={profile.id} profile={profile} onClose={() => setShowAI(false)} />}
      {showJobMatch && profile && <JobMatchPanel key={profile.id} profile={profile} onClose={() => setShowJobMatch(false)} />}
      <SmartFillPrompt key={`smart:${profile?.id ?? "no-profile"}`} profile={profile} open={smartOpen} onClose={() => { setSmartOpen(false); smartButton.current?.focus(); }} />
      {showResumeModal && (
        <ResumeParserModal
          currentValues={form.getValues("values")}
          profileId={active || form.getValues("id")}
          onClose={() => {
            setShowResumeModal(false);
            if (active || profile?.id) {
              setResumeRefresh(value => value + 1);
            }
          }}
          onApply={(extractedFields) => {
            if (active || profile?.id) {
              setResumeRefresh(value => value + 1);
            }
            Object.entries(extractedFields).forEach(([k, v]) => {
              form.setValue(`values.${k as Field}`, v, {
                shouldDirty: true,
                shouldValidate: true,
              });
            });
            if (profile) {
              void run(async () => {
                const next = await patchProfileValues(profile, extractedFields);
                setProfiles(next);
                setMessage("Imported resume details into your profile.");
              }, "Saving imported resume details…");
            } else {
              setMessage(
                "Imported resume details into form. Save profile to keep changes.",
              );
            }
          }}
        />
      )}
      {showCoverLetterModal && profile && (
        <CoverLetterModal
          profile={profile}
          applications={apps}
          onClose={() => setShowCoverLetterModal(false)}
          onApply={(fieldName, textValue) => {
            form.setValue(`values.${fieldName as Field}`, textValue, {
              shouldDirty: true,
              shouldValidate: true,
            });
            void run(async () => {
              const next = await patchProfileValues(profile, { [fieldName]: textValue });
              setProfiles(next);
              setMessage(`Updated ${fieldName} in profile.`);
            }, "Saving profile…");
          }}
        />
      )}
      <h1 className="workspace-page-title">{settings ? "Your next chapter starts here." : "Make the next application easier."}</h1>
      {busy && (
        <div role="status" className="loading-banner">
          <span className="spinner" aria-hidden="true" />
          {operation}
        </div>
      )}
      {message && (
        <p
          role={failed ? "alert" : "status"}
          className={failed ? "notice error" : "notice"}
        >
          {message}
        </p>
      )}
      <div role="status" aria-live="polite" aria-atomic="true">
        {profileSavedToast > 0 && (
          <div className="profile-saved-toast">
            <span aria-hidden="true">✓</span>
            <span>Profile saved on this device.</span>
            <button type="button" aria-label="Dismiss profile saved notification" onClick={() => setProfileSavedToast(0)}>×</button>
          </div>
        )}
      </div>
      {!loaded && !busy && (
        <button onClick={() => void load()}>Retry loading data</button>
      )}
      <fieldset disabled={busy || !loaded} className="app-controls">
        <div className="toolbar">
          <select
            aria-label="Active profile"
            value={active}
            onChange={(e) => {
              const id = e.target.value;
              if (!canLeaveDraft()) { e.currentTarget.value = active; return; }
              void run(async () => {
                await saveActiveProfile(id);
                choose(id);
              }, "Selecting profile…");
            }}
          >
            <option value="">Select a profile</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          {settings ? (
            <button
              className="highlight-action"
              onClick={() => { if (!canLeaveDraft()) return; void run(async () => {
                await saveActiveProfile("");
                choose("");
                form.reset(blankProfile("New profile"));
                setTab("profiles");
              }, "Creating a new profile…"); }}
            >
              + New profile
            </button>
          ) : (
            <button onClick={() => chrome.runtime.openOptionsPage()}>
              Settings ↗
            </button>
          )}
        </div>
        {(!settings || tab === "profiles") && <WorkspaceDashboard
          key={`workspace:${active}`} profile={profile} apps={apps} compact={!settings}
          onEdit={field => {
            if (!settings) {
              void chrome.tabs.create({ url: chrome.runtime.getURL(`settings.html?tab=profiles${field ? `&field=${encodeURIComponent(field)}` : ""}`) });
              return;
            }
            setTab("profiles");
            requestAnimationFrame(() => revealProfileControl(field ? document.getElementById(`profile-${field}`) : document.querySelector<HTMLInputElement>('[name="title"]')));
          }}
          onResume={() => setShowResumeModal(true)}
          onTracker={due => {
            if (settings) { setTrackerDueOnly(due); setTab("tracker"); requestAnimationFrame(() => document.querySelector("nav")?.scrollIntoView({ block: "start" })); }
            else void chrome.tabs.create({ url: chrome.runtime.getURL(`settings.html?tab=tracker${due ? "&due=1" : ""}`) });
          }}
        />}
        {settings ? (
          <>
            <nav>
              {[
                { id: "profiles", label: "Job Profiles" },
                { id: "identity", label: "Encrypted Identity" },
                { id: "tracker", label: "Application Tracker" },
                { id: "answers", label: "Answer Library" },
              ].map((t) => (
                <button
                  type="button"
                  className={tab === t.id ? "active" : ""}
                  aria-pressed={tab === t.id}
                  key={t.id}
                  onClick={() => { if (t.id === "tracker") setTrackerDueOnly(false); setTab(t.id); }}
                >
                  {t.label}
                </button>
              ))}
            </nav>
            {tab === "profiles" && (
              <form
                onInvalidCapture={event => revealProfileControl(event.target as HTMLElement)}
                onSubmit={form.handleSubmit((data) =>
                  run(async () => {
                    if (answerValue.trim()) {
                      setAnswerError("Click Add answer to include your typed answer before saving the profile.");
                      requestAnimationFrame(() => {
                        revealProfileControl(addAnswerButton.current);
                      });
                      return;
                    }
                    await navigator.locks.request("easyapply-field-memory", async () => {
                      const current = await readData();
                      const saved = current.profiles.find(p => p.id === data.id);
                      if (!saved && active === data.id) throw Error("This profile was deleted in another window. Your draft has not been saved.");
                      if (saved) {
                        const baseline = profileSchema.parse(form.formState.defaultValues);
                        const merged = mergeProfileEdits(saved, baseline, data);
                        data = { ...merged, customFieldAnswers: data.customFieldAnswers };
                      }
                      if (saved) data.customFieldAnswers = form.getFieldState("customFieldAnswers").isDirty
                        ? mergeRememberedAnswers(saved.customFieldAnswers ?? {}, form.formState.defaultValues?.customFieldAnswers ?? {}, data.customFieldAnswers ?? {})
                        : saved.customFieldAnswers;
                      const next = saved ? current.profiles.map(p => p.id === data.id ? data : p) : [...current.profiles, data];
                      await saveProfiles(next, data.id);
                      setProfiles(next);
                    });
                    setActive(data.id);
                    form.reset(data);
                    setAnswerAdded(false);
                    setProfileSavedToast(Date.now());
                  }),
                  errors => {
                    const field = Object.keys(errors.values ?? {})[0];
                    const target = field ? document.getElementById(`profile-${field}`) : errors.customFieldAnswers ? document.getElementById("remembered-answer-editor") : document.querySelector<HTMLInputElement>('[name="title"]');
                    revealProfileControl(target);
                  },
                )}
              >
                <div className="profile-section-tools">
                  <button type="button" onClick={() => document.querySelectorAll<HTMLDetailsElement>("details.profile-section").forEach(section => { section.open = true; })}>Expand all sections</button>
                  <button type="button" onClick={() => document.querySelectorAll<HTMLDetailsElement>("details.profile-section").forEach(section => { section.open = false; })}>Collapse all sections</button>
                </div>
                <ProfileSection title="Job profile">
                  <div className="profile-readiness">
                    <div className="readiness-heading"><strong>Your profile essentials</strong><span>{essentials.length - missing.length}/{essentials.length} added</span></div>
                    <progress aria-label="Profile essentials added" max={essentials.length} value={essentials.length - missing.length} />
                    <p>{missing.length ? "Add these details to cover more common application fields. Select one to edit it." : "Your essentials are complete. Review and save when you’re ready."}</p>
                    <div className="readiness-fields">{missing.map(key => <button type="button" key={key} onClick={() => revealProfileControl(document.getElementById(`profile-${key}`))}>+ {label(key)}</button>)}</div>
                  </div>
                  <p>
                    Create separate profiles for Frontend Developer, Java
                    Developer, or DevOps Engineer.
                  </p>
                  <label>
                    Profile name
                    <input {...form.register("title")} />
                    <small>{form.formState.errors.title?.message}</small>
                  </label>
                  <ResumeVaultCard
                    key={active}
                    profileId={active || profile?.id}
                    profileName={profile?.title}
                    loading={resumeLoading}
                    loadError={resumeLoadError}
                    onRetry={() => setResumeRefresh(value => value + 1)}
                    savedResume={savedResume}
                    onSave={resume => { if (resumeActiveId.current === active) setSavedResume(resume); }}
                    onDelete={() => { if (resumeActiveId.current === active) setSavedResume(null); }}
                    onToast={setMessage}
                  />
                </ProfileSection>
                {Object.entries(groups).map(([title, fields]) => (
                  <ProfileSection title={title} key={title}>
                    {title === "Voluntary Disclosures" && <>
                      <p>Optional, user-approved defaults. Nothing is inferred from your profile or generated by AI. Leave a choice blank to skip it. Only clearly matching website options are filled; review them before submitting.</p>
                      <p>These sensitive answers are saved locally with your profile, without vault encryption, and included in profile exports. Turning this off stops disclosure autofill but keeps your saved choices.</p>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={form.watch("values.disclosuresEnabled") === "yes"} onChange={e => form.setValue("values.disclosuresEnabled", e.target.checked ? "yes" : "", {shouldDirty: true})} />Enable user-approved disclosure defaults for this profile</label>
                    </>}
                    {title === "Application eligibility" && (
                      <p>
                        Answer only for your situation and this company. These
                        answers start unchecked in the autofill preview. Leaving
                        an answer blank means it will not be filled. Background
                        check answers are explicit profile choices and are never inferred.
                      </p>
                    )}
                    {title === "Joining preferences" && (
                      <p>
                        Use 0 for total experience only if accurate. Notice
                        period and salary may be written as “Immediate” or “Not
                        applicable” where appropriate; nothing is assumed.
                      </p>
                    )}
                    {title === "School education" && (
                      <p>
                        Record your 10th and either 12th or Diploma details.
                        Enter percentages as numbers, without the % sign.
                      </p>
                    )}
                    <div className="grid">
                      {fields.filter(k => k !== "disclosuresEnabled").map((k) => (
                        <div key={k}>
                          <label htmlFor={`profile-${k}`}>{label(k)}</label>
                          <span id={`examples-${k}`} className="field-aliases" hidden={disclosureKeys.includes(k)}>
                            Also labeled: {labelExamples(k).join(" / ")}
                          </span>
                          {disclosureOptions[k] ? (
                            <select id={`profile-${k}`} disabled={form.watch("values.disclosuresEnabled") !== "yes"} {...form.register(`values.${k}`)}>
                              <option value="">Leave unanswered</option>
                              {disclosureOptions[k].map(value => <option key={value} value={value}>{value}</option>)}
                            </select>
                          ) : fieldOptions[k as FresherField] ? (
                            <select
                              id={`profile-${k}`}
                              aria-describedby={`examples-${k}`}
                              aria-label={label(k)}
                              {...form.register(`values.${k}`)}
                            >
                              <option value="">Not specified</option>
                              {fieldOptions[k as FresherField]!.map((value) => (
                                <option key={value} value={value}>
                                  {value}
                                </option>
                              ))}
                            </select>
                          ) : [
                              "experience",
                              "internships",
                              "skills",
                              "technologies",
                              "aboutYou",
                              "whyHire",
                              "whyCompany",
                              "currentAddress",
                              "permanentAddress",
                              "projectDescription",
                              "projectContribution",
                              "certifications",
                            ].includes(k) ? (
                            <textarea
                              id={`profile-${k}`}
                              aria-describedby={`examples-${k}`}
                              {...form.register(`values.${k}`)}
                            />
                          ) : (
                            <input
                              id={`profile-${k}`}
                              aria-describedby={`examples-${k}`}
                              type={
                                k === "dob" || k === "joiningDate"
                                  ? "date"
                                  : k === "email"
                                    ? "email"
                                    : "text"
                              }
                              {...form.register(`values.${k}`)}
                            />
                          )}
                          {k === "gender" && <small>For gender autofill, explicitly choose a default in Voluntary Disclosures below.</small>}
                          <small>
                            {form.formState.errors.values?.[k]?.message}
                          </small>
                        </div>
                      ))}
                    </div>
                  </ProfileSection>
                ))}
                <ProfileSection title="Remembered field answers" headingId="remembered-answer-editor">
                  <p>Add the exact question and your answer for specific screening questions, including Yes/No dropdowns.</p>
                  <label>Question<input value={answerQuestion} maxLength={300} onChange={e => setAnswerQuestion(e.target.value)} /></label>
                  <label>Your answer<input value={answerValue} maxLength={2000} onChange={e => setAnswerValue(e.target.value)} /></label>
                  <button ref={addAnswerButton} type="button" onClick={() => {
                    const candidate = memoryCandidateSchema.safeParse({ question: answerQuestion.trim(), answer: answerValue.trim() });
                    if (!candidate.success) { setAnswerError("Use an unmatched application question and a nonempty answer. Consent and sensitive questions cannot be saved here."); return; }
                    const answers = { ...form.getValues("customFieldAnswers") };
                    for (const question of Object.keys(answers)) if (questionKey(question) === questionKey(candidate.data.question)) delete answers[question];
                    if (Object.keys(answers).length >= 100) { setAnswerError("You can save up to 100 answers. Remove one first."); return; }
                    answers[candidate.data.question] = candidate.data.answer;
                    form.setValue("customFieldAnswers", answers, { shouldDirty: true });
                    setAnswerQuestion(""); setAnswerValue(""); setAnswerError("");
                    setAnswerAdded(true);
                    requestAnimationFrame(() => {
                      saveProfileButton.current?.scrollIntoView({ block: "center" });
                      saveProfileButton.current?.focus({ preventScroll: true });
                    });
                  }}>Add answer</button>
                  {answerError && <p role="alert">{answerError}</p>}
                  <p>Answers saved or learned from unmatched questions. Used only for the same normalized question during Scan or Quick Fill. Stored locally with this profile; no AI or semantic guessing. Edit or forget an answer below, then save your profile.</p>
                  {!Object.keys(form.watch("customFieldAnswers") ?? {}).length && <p>No remembered answers yet. After using easyApply on a page, answer an unmatched question and leave the field. Turn on automatic learning above to save new answers without a prompt.</p>}
                  {Object.entries(form.watch("customFieldAnswers") ?? {}).map(([question, answer]) => <div key={question} className="mb-4">
                    <label>{question}<textarea maxLength={2000} value={answer} onChange={e => form.setValue("customFieldAnswers", {...form.getValues("customFieldAnswers"), [question]:e.target.value}, {shouldDirty:true})} /></label>
                    <button type="button" onClick={() => { const next = {...form.getValues("customFieldAnswers")}; delete next[question]; form.setValue("customFieldAnswers", next, {shouldDirty:true}); }}>Forget answer</button>
                  </div>)}
                  {form.formState.errors.customFieldAnswers && <p role="alert">Remembered answers must be nonempty, ordinary application information and at most 2,000 characters. Forget an answer to remove it.</p>}
                </ProfileSection>
                <ProfileSection title="Documents to prepare">
                  <p>
                    Keep your resume, photo, 10th and 12th/Diploma marksheets,
                    degree marksheets, PDC or degree certificate, and
                    internship/certification documents ready. Upload only the
                    documents requested by the employer, directly on its
                    application page.
                  </p>
                  <p>
                    easyApply does not store document files or upload them
                    automatically. PAN and Aadhaar numbers belong only in the
                    encrypted Identity vault. Voluntary disclosures require explicit opt-in above. Legal
                    declarations that require consent stay manual.
                  </p>
                </ProfileSection>
                <footer>
                  {answerAdded && <p role="status">Answer added to your draft. Click Save profile to keep it on this device.</p>}
                  <button ref={saveProfileButton} type="submit" className="primary" disabled={busy}>
                    Save profile
                  </button>
                  {profile && (
                    <button
                      type="button"
                      className="danger"
                      onClick={() => {
                        if (
                          window.confirm(
                            "Delete this profile, its saved resume, custom saved entries, and encrypted identity? Application tracker records stay separate.",
                          )
                        )
                          void run(async () => {
                            await navigator.locks.request("easyapply-field-memory", async () => {
                              const current = await readData();
                              const next = current.profiles.filter(p => p.id !== active);
                              await deleteStoredResume(active);
                              await chrome.storage.local.remove(["vault:" + active, "custom:" + active, "easyapply.learning:" + active]);
                              await saveProfiles(next, current.activeProfileId === active ? "" : current.activeProfileId);
                              setProfiles(next);
                            });
                            choose("");
                            setMessage("Profile deleted.");
                          });
                      }}
                    >
                      Delete profile
                    </button>
                  )}
                </footer>
              </form>
            )}
            {tab === "answers" && <AnswerLibrary />}
            {tab === "identity" && (
              <section className="card">
                <h2>Encrypted identity vault</h2>
                <p>
                  PAN and Aadhaar are encrypted separately with AES-GCM. Your
                  vault passphrase is never saved. Losing it means the identity
                  data cannot be recovered.
                </p>
                <p>
                  Never enter account passwords, OTPs, UPI PINs, or banking
                  credentials.
                </p>
                <p>
                  Identity locks automatically after two minutes. Keep your
                  passphrase separate from account passwords.
                </p>
                <label>
                  Vault passphrase
                  <input
                    type="password"
                    autoComplete="off"
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                  />
                </label>
                <label>
                  PAN
                  <input
                    type="password"
                    autoComplete="off"
                    value={identity.pan}
                    onChange={(e) =>
                      setIdentity({
                        ...identity,
                        pan: e.target.value.toUpperCase(),
                      })
                    }
                  />
                </label>
                <label>
                  Aadhaar
                  <input
                    type="password"
                    autoComplete="off"
                    value={identity.aadhaar}
                    onChange={(e) =>
                      setIdentity({ ...identity, aadhaar: e.target.value })
                    }
                  />
                </label>
                <div className="toolbar">
                  <button
                    className="primary"
                    disabled={busy || !profile}
                    onClick={() =>
                      run(async () => {
                        if (
                          identity.pan &&
                          !/^[A-Z]{5}\d{4}[A-Z]$/.test(identity.pan)
                        )
                          throw Error(
                            "PAN must contain five letters, four digits, and a final letter.",
                          );
                        if (
                          identity.aadhaar &&
                          !/^\d{12}$/.test(identity.aadhaar)
                        )
                          throw Error("Aadhaar must contain 12 digits.");
                        await seal(active, pass, identity);
                        setPass("");
                        setIdentity({ pan: "", aadhaar: "" });
                        setMessage("Identity encrypted and locked.");
                      }, "Encrypting identity…")
                    }
                  >
                    Encrypt & save
                  </button>
                  <button
                    disabled={busy || !profile}
                    onClick={() =>
                      run(async () => {
                        setIdentity(await unlock(active, pass));
                        setPass("");
                        setMessage("Unlocked for this settings session.");
                      }, "Unlocking identity…")
                    }
                  >
                    Unlock
                  </button>
                  <button
                    onClick={() => {
                      setIdentity({ pan: "", aadhaar: "" });
                      setPass("");
                    }}
                  >
                    Lock
                  </button>
                  <button
                    disabled={!profile || busy}
                    onClick={() =>
                      run(async () => {
                        await chrome.storage.local.remove("vault:" + active);
                        setIdentity({ pan: "", aadhaar: "" });
                        setPass("");
                        setMessage("Encrypted identity deleted.");
                      })
                    }
                  >
                    Delete identity
                  </button>
                </div>
              </section>
            )}
            {tab === "tracker" && (
              <Tracker
                key={`tracker:${trackerDueOnly}`}
                initialDueOnly={trackerDueOnly}
                apps={apps}
                update={async (next, baseline) => {
                  setApps(await commitApplicationChanges(baseline, next));
                }}
              />
            )}
          </>
        ) : (
          <>
            <section className="card">
              <h2>Ready when you are</h2>
              <p>
                {profile
                  ? "Attach your saved resume, preview your details, and fill empty AI questions in one scan."
                  : "Add your first profile in Settings to get started."}
              </p>
              {!profile && <button type="button" className="primary wide" onClick={() => chrome.runtime.openOptionsPage()}>Create my first profile →</button>}
              <button
                className="primary wide"
                disabled={busy || !profile}
                onClick={() => run(scan, "Scanning application fields…")}
              >
                {busy && operation.startsWith("Scanning")
                  ? "Scanning…"
                  : "Scan application form"}
              </button>
              {scannedAIFields.length > 0 && <section className="scan-ai-fields" aria-label="Scanned AI fields">
                <div className="scan-ai-heading"><h3>AI application fields</h3><span className="scan-ai-count">{scannedAIFields.length} {scannedAIFields.length === 1 ? "field" : "fields"}</span></div>
                <p className="hint">Regenerate replaces only this AI-filled answer. Available for two minutes; manual edits are preserved.</p>
                {scannedAIFields.map(field => <div className="scan-ai-row" key={field.question.id}>
                  <div><strong title={field.question.question}>{kindLabels[field.question.kind]}</strong><small>{field.receipt ? "Filled by AI" : "Needs review in AI answers"}</small></div>
                  <button type="button" className="scan-ai-regenerate" disabled={busy || !field.receipt} aria-label={`Regenerate ${field.question.question}`} onClick={() => void run(async () => {
                    if (!profile) return;
                    setRegeneratingAI(field.question.id);
                    try {
                      const updated = await regenerateScannedAI(field, profile);
                      setScannedAIFields(current => current.map(item => item.question.id === field.question.id ? updated : item));
                      setMatches([]); setScanToken("");
                      setMessage("Regenerated and updated this field. Review the answer on the page. Scan again before filling ordinary fields.");
                    } finally { setRegeneratingAI(undefined); }
                  }, "Regenerating AI answer…")}>{regeneratingAI === field.question.id ? "Regenerating…" : "Regenerate"}</button>
                </div>)}
              </section>}
              <label className="scan-ai-toggle">
                <input type="checkbox" checked={autoAI} disabled={busy} onChange={e => setAutoAI(e.target.checked)} />
                Generate and fill AI questions during scan
              </label>
              <p className="hint">Uses your enabled Groq account and saved career details, page questions, role and company. Keep the popup open. Existing answers stay untouched; review generated text before submitting.</p>
              <details className="popup-resume-details">
                <summary>Resume document · {resumeLoading ? "Loading…" : resumeLoadError ? "Unavailable" : savedResume ? "Saved" : "Add a resume"}</summary>
              <ResumeVaultCard
                key={active}
                profileId={active || profile?.id}
                profileName={profile?.title}
                loading={resumeLoading}
                loadError={resumeLoadError}
                onRetry={() => setResumeRefresh(value => value + 1)}
                savedResume={savedResume}
                onSave={resume => { if (resumeActiveId.current === active) setSavedResume(resume); }}
                onDelete={() => { if (resumeActiveId.current === active) setSavedResume(null); }}
                onAttach={async () => {
                  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                  if (!tab?.id || !/^https?:/.test(tab.url ?? "")) throw Error("Open the job application page, then reopen the extension popup.");
                  await connectToPage(tab.id, contentPath);
                  const result = await withTimeout(chrome.tabs.sendMessage(tab.id, { type: "fill-saved-resume", profileId: active }, { frameId: 0 }));
                  if (result?.error) throw Error(result.error);
                  return result?.message || "No supported resume field found. Download the resume and use Choose file.";
                }}
                onToast={setMessage}
              />
              </details>
              <details>
                <summary>Include encrypted identity</summary>
                <label>
                  Vault passphrase
                  <input
                    type="password"
                    autoComplete="off"
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                  />
                </label>
                <button
                  disabled={busy || !profile}
                  onClick={() =>
                    run(async () => {
                      setIdentity(await unlock(active, pass));
                      setPass("");
                      setMessage(
                        "Identity unlocked. Scan again to include it.",
                      );
                    }, "Unlocking identity…")
                  }
                >
                  Unlock for this session
                </button>
                <button
                  onClick={() => {
                    setIdentity({ pan: "", aadhaar: "" });
                    setMatches([]);
                    setPass("");
                    setConfirmed(false);
                  }}
                >
                  Lock & clear preview
                </button>
              </details>
            </section>
            {matches.length > 0 && (
              <section className="card">
                <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
                  <h2 className="mb-0 flex items-center gap-2">
                    Review matches{" "}
                    <span className="badge">
                      {matches.filter((m) => m.selected).length} of {matches.length} selected
                    </span>
                  </h2>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      className="text-xs py-1 px-2.5"
                      onClick={() =>
                        setMatches(
                          matches.map((m) =>
                            !m.blocked && (m.field || m.remembered) && m.value && m.kind !== "file" && (m.confidence === undefined || m.confidence >= 70)
                              ? { ...m, selected: true }
                              : m,
                          ),
                        )
                      }
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      className="text-xs py-1 px-2.5"
                      onClick={() =>
                        setMatches(
                          matches.map((m) => ({ ...m, selected: false })),
                        )
                      }
                    >
                      Deselect all
                    </button>
                  </div>
                </div>
                <p>
                  Unchecked fields stay untouched. Upload documents manually.
                </p>
                {matches.some(m => m.confidence !== undefined && m.confidence < 70) && <p className="hint">Low-confidence matches start unchecked and are excluded from Select all. Review the field evidence, then select each one individually if it is correct.</p>}
                <p className="destination">
                  Destination: {pageUrl ? new URL(pageUrl).host : ""} · Preview
                  expires in 2 minutes
                </p>
                <div className="matches-scroll-list">
                  <div className="match-tools">
                    <input type="search" aria-label="Search detected fields" placeholder="Find a field or skip reason…" value={matchSearch} onChange={e => setMatchSearch(e.target.value)} />
                    <div className="match-filters" aria-label="Filter detected fields">{(["all", "ready", "attention", "preserved"] as const).map(status => <button type="button" key={status} aria-pressed={matchFilter === status} onClick={() => setMatchFilter(status)}>{({ all: "All", ready: "Ready", attention: "Needs attention", preserved: "Already filled" })[status]} <span>{matches.filter(m => status === "all" || matchStatus(m) === status).length}</span></button>)}</div>
                  </div>
                  {!visibleMatches.length && <p role="status">No fields match this filter. Try All or clear your search.</p>}
                  {visibleMatches.map((m) => (
                    <React.Fragment key={m.id}><label className={`match ${m.selected ? "match-selected" : ""} ${(!m.field && !m.remembered) || !m.value ? "match-empty" : ""}`}>
                      <input
                        type="checkbox"
                        checked={m.selected}
                        disabled={m.blocked || (!m.field && !m.remembered) || !m.value || m.kind === "file"}
                        onChange={(e) =>
                          setMatches(
                            matches.map((x) =>
                              x.id === m.id
                                ? { ...x, selected: e.target.checked }
                                : x,
                            ),
                          )
                        }
                      />
                      <span>
                        <strong>{m.label}</strong>
                        <em>
                          {m.kind === "file"
                            ? "File upload — select your document manually"
                            : m.sensitive && m.value
                              ? `•••• ${m.value.slice(-4)}`
                              : m.value || m.reason || "Needs your answer"}
                          {m.reason && m.value ? ` · ${m.reason}` : ""}
                          {m.confidence !== undefined ? ` · ${m.confidence}% detection confidence${m.evidence?.length ? ` (${m.evidence.join("; ")})` : ""}` : ""}
                          {m.remembered ? " · Remembered answer" : ""}
                          {m.sensitive ? " · Sensitive" : ""}
                        </em>
                        {matchStatus(m) === "attention" && !m.blocked && !m.sensitive && m.kind !== "file" && !m.value && (m.field || safeMemoryQuestion(m.label)) && (
                          <button type="button" className={`match-repair${m.field ? "" : " match-repair-saved"}`} onClick={e => {
                            e.preventDefault();
                            const query = new URLSearchParams({ profile: active });
                            if (m.field) query.set("field", m.field);
                            else query.set("question", m.label);
                            void chrome.tabs.create({ url: chrome.runtime.getURL(`settings.html?${query}#profiles`) });
                          }}>{m.field ? `Add ${label(m.field as Field)} to profile` : "Add a saved answer"} ↗</button>
                        )}
                      </span>
                    </label>
                    {!!m.answerSuggestions?.length && <div className="answer-match-suggestions" aria-label={`Saved answers for ${m.label}`}>
                      <strong>Saved answer suggestions</strong>
                      {m.answerSuggestions.map(suggestion => <article key={suggestion.id}>
                        <div><span>{Math.round(suggestion.score * 100)}% · {suggestion.category}{suggestion.reasons.length ? ` · ${suggestion.reasons.join(", ")}` : ""}</span><p>{suggestion.question}</p><blockquote>{suggestion.answer}</blockquote></div>
                        <button type="button" disabled={busy} onClick={event => {
                          event.preventDefault(); event.stopPropagation();
                          void recordAnswerUsage(suggestion.id).catch(() => {});
                          setMatches(current => current.map(item => item.id === m.id ? { ...item, value: suggestion.answer, answerId: suggestion.id, remembered: true, selected: true, reason: "Saved answer selected — review before filling." } : item));
                        }}>{m.answerId === suggestion.id ? "Selected" : "Use answer"}</button>
                      </article>)}
                    </div>}
                    </React.Fragment>
                  ))}
                </div>
            </section>
            )}
            <AboutYouBox profile={profile} onSaveAboutYou={text => updateProfileAnswer("aboutYou", text)} />
            <WhyHireBoxes profile={profile} onSaveWhyHire={text => updateProfileAnswer("whyHire", text)} />
            <p className="footnote">
              Your data stays in this Chrome profile. easyApply never submits
              applications.
            </p>
            <Features />
          </>
        )}
      </fieldset>
      <p className="footnote">
        <a href="privacy.html" target="_blank" rel="noreferrer">Privacy policy</a>
      </p>
      {profile && <LearningSettings key={`learning:${profile.id}`} profileId={profile.id} count={Object.keys(profile.customFieldAnswers ?? {}).length} />}
      <Onboarding
        ready={loaded && !busy}
        hasProfile={profiles.length > 0}
        onCreate={async () => {
          if (settings) {
            setTab("profiles");
            requestAnimationFrame(() => revealProfileControl(document.querySelector<HTMLInputElement>('[name="title"]')));
          } else await chrome.runtime.openOptionsPage();
        }}
      />
      {showSaved && (
        <SavedInfo
          profiles={profiles}
          initialId={active}
          onClose={() => {
            setShowSaved(false);
            savedButton.current?.focus();
          }}
        />
      )}
      {!settings && matches.length > 0 && (
        <div className="matches-footer-action" role="region" aria-label="Fill selected fields actions">
                {matches.some((m) => m.sensitive && m.selected) && (
                  <label className="match match-confirm-pan">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      disabled={busy}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    I confirm filling the selected PAN/Aadhaar fields on this
                    page.
                  </label>
                )}

                  <p className="fill-selection-summary" aria-live="polite">{matches.filter(m => m.selected).length} fields selected · Review before filling</p>
                  <button type="button"
                    className="primary wide fill-cta-btn"
                    disabled={
                      busy ||
                      !matches.some((m) => m.selected) ||
                      (matches.some((m) => m.sensitive && m.selected) &&
                        !confirmed)
                    }
                    onClick={() =>
                    run(async () => {
                      if (!matches.some((m) => m.selected))
                        throw Error(
                          "Select at least one matched field before filling.",
                        );
                      if (!target) throw Error("Scan the page again.");
                      const latestProfile = (await readData()).profiles.find(p => p.id === previewProfile.current?.id);
                      if (!latestProfile || JSON.stringify(latestProfile) !== JSON.stringify(previewProfile.current))
                        throw Error("This profile changed since the preview. Scan again to use its latest saved details.");
                      const current = await chrome.tabs.get(target);
                      if (current.url !== pageUrl) {
                        setMatches([]);
                        throw Error(
                          "The application page changed. Scan again before filling.",
                        );
                      }
                      const r = await withTimeout(
                        chrome.tabs.sendMessage(
                          target,
                          {
                            type: "fill",
                            scanId: scanToken,
                            matches: matches.filter(
                              (m) => m.selected || m.kind === "file",
                            ),
                            confirmSensitive: confirmed,
                          },
                          { frameId: 0 },
                        ),
                        60000,
                      );
                      if (r.error) throw Error(r.error);
                      setMessage(
                        `Filled ${r.filled} fields. ${r.errors.join(". ")} Review the page and submit manually.`,
                      );
                      setConfirmed(false);
                      setMatches([]);
                      setScanToken("");
                      setIdentity({ pan: "", aadhaar: "" });
                      setPass("");
                      if (r.errors.length) setFailed(true);
                    }, "Filling selected fields…")
                  }
                >
                  {busy && operation.startsWith("Filling")
                    ? "Filling…"
                    : "Fill selected fields"}
                </button>
              </div>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);


