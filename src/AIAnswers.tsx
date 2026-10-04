import React, { useState, useRef, useEffect } from "react";
import type { Profile } from "./model";
import {
  AI_ORIGIN,
  AI_MODEL,
  careerFacts,
  kindLabels,
  wordCount,
  exceedsLimit,
  aiRequestSchema,
  type AIAnswer,
  type AIQuestion,
} from "./ai";
import { connectToPage, withTimeout } from "./connection";
import contentPath from "./content?script";
async function message(data: unknown) {
  const result = await withTimeout(chrome.runtime.sendMessage(data), 30000);
  if (result?.error) throw Error(result.error);
  return result;
}
export function AIAnswers({
  profile,
  onClose,
}: {
  profile: Profile;
  onClose: () => void;
}) {
  const [key, setKey] = useState("");
  const [persistent, setPersistent] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configured, setConfigured] = useState(false);
  useEffect(() => {
    void message({ type: "ai-config-get" })
      .then((result) => {
        setConfigured(result.configured);
        setPersistent(result.persistent);
      })
      .catch((e) => setStatus(e.message)).finally(() => setConfigLoaded(true));
  }, []);
  const [consent, setConsent] = useState(false);
  const [role, setRole] = useState(
    profile.values.preferredRole || profile.title,
  );
  const [company, setCompany] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [workingField, setWorkingField] = useState<string>();
  const [guidance, setGuidance] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [target, setTarget] = useState<{ id: number; token: string }>();
  const [questions, setQuestions] = useState<AIQuestion[]>(
    ["coverLetter", "whyRole", "whyHire", "whyCompany"].map((kind) => ({
      id: kind,
      kind: kind as AIQuestion["kind"],
      question: kindLabels[kind as AIQuestion["kind"]],
      maxChars: 4000,
      maxWords: kind === "coverLetter" ? 300 : 150,
    })),
  );
  const [answers, setAnswers] = useState<AIAnswer[]>([]);
  const facts = careerFacts(profile.values);
  async function run(task: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setStatus("");
    try {
      await task();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      running.current = false;
      setWorkingField(undefined);
      setBusy(false);
    }
  }
  async function fill(items: AIAnswer[]) {
    if (!target) throw Error("Detect questions on the job page first.");
    const oversized = items.find((a) => {
      const q = questions.find((q) => q.id === a.id);
      return q && exceedsLimit(a, q);
    });
    if (oversized)
      throw Error(
        "A draft exceeds its field limit. Use Shorten answer or edit it before filling. Nothing was filled.",
      );
    const selected = items
      .filter((a) => a.text.trim() && !a.missingFacts.length)
      .map(({ id, text }) => ({ id, text }));
    if (!selected.length)
      throw Error(
        "No complete answers to fill. Add the missing career details first.",
      );
    const result = await withTimeout(
      chrome.tabs.sendMessage(
        target.id,
        { type: "ai-fill", token: target.token, answers: selected },
        { frameId: 0 },
      ),
    );
    setTarget(undefined);
    if (result?.error) throw Error(result.error);
    setStatus(
      `Filled ${result.filled} answers. Review the page before submitting. ${result.errors.join(" ")}`,
    );
  }
  async function generate(autoFill: boolean) {
    const request = aiRequestSchema.parse({
      role,
      company,
      description,
      tone: "professional",
      facts,
      questions,
    });
    const result = await message({ type: "ai-generate", request });
    setAnswers(result.answers);
    if (
      result.answers.some((a: AIAnswer) => {
        const q = questions.find((q) => q.id === a.id);
        return q && exceedsLimit(a, q);
      })
    ) {
      setStatus(
        "Drafts saved. An answer exceeds its limit—use Shorten answer or edit it. Nothing was filled.",
      );
      return;
    }
    if (autoFill) await fill(result.answers);
    else setStatus("Drafts ready. Check all claims before using them.");
  }
  async function generateField(question: AIQuestion) {
    setWorkingField(question.id);
    const previous = answers.find((a) => a.id === question.id);
    const request = aiRequestSchema.parse({
      role,
      company,
      description,
      tone: "professional",
      facts,
      questions: [question],
      ...(previous || guidance[question.id]
        ? {
            revision: {
              previousAnswer: previous?.text.slice(0, 4000) ?? "",
              guidance:
                previous && exceedsLimit(previous, question)
                  ? "Shorten this answer to fit BOTH field limits. Keep only the most relevant supported facts. " +
                    (guidance[question.id] ?? "").slice(0, 350)
                  : (guidance[question.id] ?? ""),
            },
          }
        : {}),
    });
    const result = await message({ type: "ai-generate", request });
    const answer = result.answers[0] as AIAnswer;
    setAnswers((current) => [
      ...current.filter((a) => a.id !== question.id),
      answer,
    ]);
    setStatus(
      exceedsLimit(answer, question)
        ? "Draft saved but still over the limit. Shorten it or edit before filling."
        : `${kindLabels[question.kind]} ${previous ? "regenerated" : "generated"}. Review the draft before filling.`,
    );
  }
  return (
    <div
      className="modal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "#0008",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 12,
      }}
    >
      <section
        className="modal ai-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="AI application answers"
        style={{
          padding: 24,
          maxWidth: 720,
          maxHeight: "90vh",
          overflowY: "auto",
          background: "white",
          color: "#172033",
        }}
      >
        <h2>AI application answers</h2>
        <p>
          Groq · {AI_MODEL}. Use your own Groq Free account; quotas apply. AI
          can make mistakes. Nothing is submitted automatically.
        </p>
        <fieldset disabled={busy} style={{ display: "grid", gap: 12 }}>
          <details className="ai-setup-panel">
            <summary>Enable / manage AI</summary>
            <p>
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noreferrer"
              >
                Create a Groq API key
              </a>
              . Session-only storage is the default.
            </p>
            <label className="ai-persistence-choice">
              <input
                type="checkbox"
                disabled={!configLoaded}
                checked={persistent}
                onChange={(e) => {
                  const next = e.target.checked;
                  if (!configured) {
                    setPersistent(next);
                    return;
                  }
                  void run(async () => {
                    await message({
                      type: "ai-config-persistence",
                      persistent: next,
                    });
                    setPersistent(next);
                    setStatus(
                      next
                        ? "API key encrypted and saved across browser restarts."
                        : "Saved API key removed. AI remains enabled only for this session.",
                    );
                  });
                }}
              />{" "}
              Keep API key across browser restarts (stored in local encrypted
              extension storage)
            </label>
            <p className="ai-help">
              AES-GCM encryption protects the stored value. The decryption key
              is kept on this device so easyApply can restore access
              automatically; this does not protect against someone who controls
              your browser profile or device. Disable AI / clear key removes
              both copies.
            </p>
            <label>
              Groq API key
              <input
                type="password"
                autoComplete="off"
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />{" "}
              I agree to send the career details shown below, job context and
              questions to Groq when I generate answers.
            </label>
            <p>
              <a
                href="https://console.groq.com/docs/your-data"
                target="_blank"
                rel="noreferrer"
              >
                Groq data handling
              </a>
              . Identity vault data and resume files are excluded. Review
              free-text details for personal information.
            </p>
            <button
              type="button"
              className="ai-enable-button"
              disabled={!consent || !key.trim()}
              onClick={() => {
                const permission = chrome.permissions.request({
                  origins: [AI_ORIGIN],
                });
                void run(async () => {
                  if (!(await permission))
                    throw Error("Groq access was not granted.");
                  await message({
                    type: "ai-config-save",
                    key: key.trim(),
                    consent: true,
                    persistent,
                  });
                  setKey("");
                  setConfigured(true);
                  setStatus(
                    persistent
                      ? "AI enabled. Key encrypted and saved for future browser sessions."
                      : "AI enabled for this browser session.",
                  );
                });
              }}
            >
              Enable AI
            </button>
            <button
              type="button"
              onClick={() =>
                void run(async () => {
                  await message({ type: "ai-config-clear" });
                  setKey("");
                  setConfigured(false);
                  setPersistent(false);
                  setStatus("AI disabled; session and saved keys removed.");
                })
              }
            >
              Disable AI / clear key
            </button>
          </details>
          <details>
            <summary>Career details sent from {profile.title}</summary>
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {JSON.stringify(facts, null, 2)}
            </pre>
          </details>
          <label>
            Target role
            <input
              value={role}
              maxLength={200}
              onChange={(e) => {
                setRole(e.target.value);
                setAnswers([]);
              }}
            />
          </label>
          <label>
            Company
            <input
              value={company}
              maxLength={200}
              onChange={(e) => {
                setCompany(e.target.value);
                setAnswers([]);
              }}
            />
          </label>
          <label>
            Job description / relevant requirements
            <textarea
              value={description}
              maxLength={5000}
              onChange={(e) => {
                setDescription(e.target.value);
                setAnswers([]);
              }}
            />
          </label>
          <button
            type="button"
            className="ai-detect-button"
            onClick={() =>
              void run(async () => {
                setTarget(undefined);
                setAnswers([]);
                const [tab] = await chrome.tabs.query({
                  active: true,
                  currentWindow: true,
                });
                if (tab?.id === undefined || !/^https?:/.test(tab.url || ""))
                  throw Error(
                    "Open easyApply from its toolbar popup on the application page to detect questions. You can still generate standalone drafts here.",
                  );
                await connectToPage(tab.id, contentPath);
                const result = await withTimeout(
                  chrome.tabs.sendMessage(
                    tab.id,
                    { type: "ai-scan" },
                    { frameId: 0 },
                  ),
                );
                if (result?.error) throw Error(result.error);
                setQuestions(result.questions);
                setTarget({ id: tab.id, token: result.token });
                if (result.position) setRole(result.position.slice(0, 200));
                if (result.company) setCompany(result.company.slice(0, 200));
                setStatus(
                  `Detected ${result.questions.length} empty questions. Preview expires after two minutes. Standard text fields on the main page are supported.`,
                );
              })
            }
          >
            Detect page questions
          </button>
          <div className="ai-actions ai-main-actions">
            <button
              className="ai-primary"
              type="button"
              disabled={!questions.length}
              onClick={() => void run(() => generate(false))}
            >
              Generate drafts
            </button>
            <button
              className="ai-secondary"
              type="button"
              disabled={!target || !questions.length}
              title={
                !target
                  ? "Detect page questions first"
                  : "Generate answers and fill eligible empty fields"
              }
              onClick={() => void run(() => generate(true))}
            >
              Generate &amp; fill
            </button>
          </div>
          <p className="ai-help">
            Generate all drafts above, or work on one question below. Regenerate
            changes only that draft. Your wording preference and previous draft
            are sent to Groq for regeneration.
          </p>
          {!questions.length && (
            <p>
              No questions selected. Detect the page again to find supported
              empty fields.
            </p>
          )}
          {questions.map((q) => {
            const answer = answers.find((a) => a.id === q.id);
            const text = answer?.text ?? "";
            const overLimit =
              text.length > q.maxChars || wordCount(text) > q.maxWords;
            return (
              <article
                className="ai-answer-card"
                key={q.id}
                aria-label={q.question}
              >
                <div className="ai-card-heading">
                  <h3>{q.question}</h3>
                  <button
                    className="ai-quiet"
                    type="button"
                    aria-label={`Exclude ${q.question}`}
                    onClick={() => {
                      setQuestions((current) =>
                        current.filter((item) => item.id !== q.id),
                      );
                      setAnswers((current) =>
                        current.filter((item) => item.id !== q.id),
                      );
                    }}
                  >
                    Exclude
                  </button>
                </div>
                <small className={overLimit ? "ai-limit-error" : "ai-help"}>
                  {wordCount(text)} / {q.maxWords} words · {text.length} /{" "}
                  {q.maxChars} characters
                </small>
                {overLimit && (
                  <p className="ai-limit-error">
                    This draft is too long to fill. Shorten it or edit it; the
                    full draft is kept below.
                  </p>
                )}
                {answer && (
                  <>
                    <label htmlFor={`ai-answer-${q.id}`} className="ai-help">
                      Your draft
                    </label>
                    <textarea
                      id={`ai-answer-${q.id}`}
                      aria-label={`Draft for ${q.question}`}
                      value={text}
                      onChange={(e) =>
                        setAnswers((current) =>
                          current.map((item) =>
                            item.id === q.id
                              ? {
                                  ...item,
                                  text: e.target.value,
                                  missingFacts: [],
                                }
                              : item,
                          ),
                        )
                      }
                    />
                    {answer.missingFacts.length > 0 && (
                      <p className="ai-limit-error">
                        {answer.missingFacts.join(" ")}
                      </p>
                    )}
                  </>
                )}
                <label className="ai-help" htmlFor={`ai-guidance-${q.id}`}>
                  Writing preference (optional)
                </label>
                <input
                  id={`ai-guidance-${q.id}`}
                  placeholder="e.g. Make it shorter and emphasize my project"
                  maxLength={500}
                  value={guidance[q.id] ?? ""}
                  onChange={(e) =>
                    setGuidance((current) => ({
                      ...current,
                      [q.id]: e.target.value,
                    }))
                  }
                />
                <div className="ai-actions">
                  <button
                    className="ai-secondary"
                    type="button"
                    onClick={() => void run(() => generateField(q))}
                  >
                    {workingField === q.id
                      ? "Generating…"
                      : answer
                        ? overLimit
                          ? "Shorten answer"
                          : "Regenerate"
                        : "Generate this answer"}
                  </button>
                  <button
                    className="ai-quiet"
                    type="button"
                    disabled={!text.trim()}
                    onClick={() =>
                      void run(async () => {
                        await navigator.clipboard.writeText(text);
                        setStatus("Copied answer.");
                      })
                    }
                  >
                    Copy
                  </button>
                </div>
              </article>
            );
          })}
          {answers.length > 0 && target && (
            <button type="button" onClick={() => void run(() => fill(answers))}>
              Fill edited answers
            </button>
          )}
          <button type="button" onClick={onClose}>
            Close
          </button>
        </fieldset>
        <p role="status">{busy ? "Working… Keep this window open." : status}</p>
      </section>
    </div>
  );
}
