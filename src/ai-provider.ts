import {
  persistAPIKey,
  readPersistentAPIKey,
  clearPersistentAPIKey,
  hasPersistentAPIKey,
} from "./ai-key-storage";
import {
  AI_MODEL,
  answerResponseFormat,
  AI_ORIGIN,
  aiRequestSchema,
  makeMessages,
  redactContact,
  validateAnswers,
} from "./ai";
import { z } from "zod";
const KEY = "easyapply.ai.session";
const settingsSchema = z.object({
  key: z
    .string()
    .min(20)
    .max(300)
    .regex(/^[A-Za-z0-9_-]+$/),
  consent: z.literal(true),
});
let activeRequest = false;
export function isTrustedAIClient(
  sender: chrome.runtime.MessageSender,
): boolean {
  if (sender.id !== chrome.runtime.id || !sender.url) return false;
  try {
    const url = new URL(sender.url);
    return (
      url.protocol === "chrome-extension:" &&
      url.host === chrome.runtime.id &&
      ["/index.html", "/settings.html"].includes(url.pathname)
    );
  } catch {
    return false;
  }
}
async function session() {
  await chrome.storage.session.setAccessLevel({
    accessLevel: "TRUSTED_CONTEXTS",
  });
  const cached = settingsSchema.safeParse(
    (await chrome.storage.session.get(KEY))[KEY],
  );
  if (cached.success) return cached;
  const key = await readPersistentAPIKey();
  const restored = settingsSchema.safeParse(
    key ? { key, consent: true } : undefined,
  );
  if (restored.success)
    await chrome.storage.session.set({ [KEY]: restored.data });
  return restored;
}
export async function handleAIMessage(message: unknown): Promise<unknown> {
  const action = z.object({ type: z.string() }).parse(message).type;
  if (action === "ai-config-get") {
    const current = await session();
    return {
      configured: current.success,
      persistent: await hasPersistentAPIKey(),
      model: AI_MODEL,
    };
  }
  if (action === "ai-config-clear") {
    try {
      await clearPersistentAPIKey();
    } finally {
      await chrome.storage.session.remove(KEY);
    }
    return { configured: false };
  }
  if (action === "ai-config-save") {
    const parsed = z
      .object({
        type: z.literal("ai-config-save"),
        key: settingsSchema.shape.key,
        consent: z.literal(true),
        persistent: z.boolean().optional().default(false),
      })
      .strict()
      .parse(message);
    if (!(await chrome.permissions.contains({ origins: [AI_ORIGIN] })))
      throw Error("Allow access to api.groq.com to enable AI.");
    await chrome.storage.session.setAccessLevel({
      accessLevel: "TRUSTED_CONTEXTS",
    });
    if (parsed.persistent) await persistAPIKey(parsed.key);
    else await clearPersistentAPIKey();
    await chrome.storage.session.set({
      [KEY]: { key: parsed.key, consent: true },
    });
    return { configured: true };
  }
  if (action === "ai-config-persistence") {
    const { persistent } = z
      .object({
        type: z.literal("ai-config-persistence"),
        persistent: z.boolean(),
      })
      .strict()
      .parse(message);
    const saved = await session();
    if (!saved.success) throw Error("Enable AI with a key first.");
    if (persistent) await persistAPIKey(saved.data.key);
    else await clearPersistentAPIKey();
    return { persistent };
  }
  if (action !== "ai-generate") throw Error("Unknown AI action.");
  const parsed = z
    .object({ type: z.literal("ai-generate"), request: aiRequestSchema })
    .strict()
    .parse(message);
  if (activeRequest)
    throw Error("Another AI request is running. Wait for it to finish.");
  activeRequest = true;
  try {
    const saved = await session();
    if (!saved.success)
      throw Error(
        "Enable AI with your Groq key and data-sharing consent first.",
      );
    if (!(await chrome.permissions.contains({ origins: [AI_ORIGIN] })))
      throw Error("AI permission was removed. Enable AI again.");
    // Defense in depth: apply redaction again at the only network boundary.
    const request = {
      ...parsed.request,
      ...(parsed.request.revision
        ? {
            revision: {
              previousAnswer: redactContact(
                parsed.request.revision.previousAnswer,
              ),
              guidance: redactContact(parsed.request.revision.guidance),
            },
          }
        : {}),
      role: redactContact(parsed.request.role),
      company: redactContact(parsed.request.company),
      description: redactContact(parsed.request.description),
      facts: Object.fromEntries(
        Object.entries(parsed.request.facts).map(([key, value]) => [
          key,
          redactContact(value),
        ]),
      ),
      questions: parsed.request.questions.map((q) => ({
        ...q,
        question: redactContact(q.question),
      })),
    };
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${saved.data.key}`,
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: makeMessages(request),
          temperature: 0.3,
          reasoning_effort: "low",
          max_completion_tokens: 4096,
          response_format: answerResponseFormat(request.questions),
        }),
        signal: AbortSignal.timeout(25000),
      },
    );
    if (response.status === 401 || response.status === 403)
      throw Error(
        "Groq rejected the key or model access. Check your key in the Groq console.",
      );
    if (response.status === 429)
      throw Error(
        "Groq's free-tier quota or rate limit was reached. Wait and try again; no automatic retry or paid upgrade was made.",
      );
    if (!response.ok) {
      // Interpret only known error codes; never echo provider content that could
      // contain request data or credentials into the UI.
      const body = await response.json().catch(() => null);
      const code = body?.error?.code;
      if (code === "model_not_found" || code === "model_decommissioned")
        throw Error(
          `Groq model ${AI_MODEL} is unavailable for this account or has been retired. Update/reload easyApply and check your Groq project's model access. Nothing was filled.`,
        );
      if (response.status === 404)
        throw Error(
          `Groq returned HTTP 404 for ${AI_MODEL}. Check model availability in your Groq project and reload the latest easyApply build. Nothing was filled.`,
        );
      throw Error(
        `Groq could not generate answers (HTTP ${response.status}). Try again later.`,
      );
    }
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (
      data?.choices?.[0]?.finish_reason !== "stop" ||
      typeof content !== "string" ||
      content.length > 30000
    )
      throw Error(
        "AI response was incomplete. Nothing was filled; try fewer questions.",
      );
    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      throw Error("AI returned invalid JSON. Nothing was filled.");
    }
    return { answers: validateAnswers(raw, request.questions, true) };
  } catch (error) {
    if (
      error instanceof DOMException &&
      ["AbortError", "TimeoutError"].includes(error.name)
    )
      throw Error("AI request timed out. Nothing was filled. Try again.", {
        cause: error,
      });
    if (error instanceof TypeError)
      throw Error(
        "Could not reach Groq. Check your internet connection and AI permission.",
        { cause: error },
      );
    throw error;
  } finally {
    activeRequest = false;
  }
}
