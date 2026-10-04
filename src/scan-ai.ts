import type { Profile } from "./model";
import {
  aiRequestSchema,
  careerFacts,
  exceedsLimit,
  type AIAnswer,
  type AIQuestion,
} from "./ai";
import { withTimeout } from "./connection";
export interface ScannedAIField {
  question: AIQuestion;
  text: string;
  receipt?: string;
  role: string;
  company: string;
  tabId: number;
}
export interface AIScanResult {
  message: string;
  fields: ScannedAIField[];
}
export async function regenerateScannedAI(
  field: ScannedAIField,
  profile: Profile,
): Promise<ScannedAIField> {
  if (!field.receipt)
    throw Error(
      "This field wasn't filled by AI. Open AI answers to generate it individually.",
    );
  const request = aiRequestSchema.parse({
    role: field.role,
    company: field.company,
    description: "",
    tone: "professional",
    facts: careerFacts(profile.values),
    questions: [field.question],
    revision: {
      previousAnswer: field.text,
      guidance: "Use different wording while preserving supported facts.",
    },
  });
  const result = await withTimeout(
    chrome.runtime.sendMessage({ type: "ai-generate", request }),
    30000,
  );
  if (result?.error) throw Error(result.error);
  const answer = result.answers[0] as AIAnswer;
  if (
    !answer.text.trim() ||
    answer.missingFacts.length ||
    exceedsLimit(answer, field.question)
  )
    throw Error(
      "The new draft needs more facts or is too long. Your current answer was preserved; use AI answers to edit a draft.",
    );
  const updated = await withTimeout(
    chrome.tabs.sendMessage(
      field.tabId,
      { type: "ai-replace", receipt: field.receipt, text: answer.text },
      { frameId: 0 },
    ),
  );
  if (updated?.error) throw Error(updated.error);
  return { ...field, text: answer.text, receipt: updated.receipt };
}
export async function scanAndFillAI(
  tabId: number,
  profile: Profile,
): Promise<AIScanResult> {
  const config = await withTimeout(
    chrome.runtime.sendMessage({ type: "ai-config-get" }),
  );
  if (!config?.configured)
    return {
      message: "AI is not enabled. Open AI answers to add your Groq key.",
      fields: [],
    };
  const scan = await withTimeout(
    chrome.tabs.sendMessage(tabId, { type: "ai-scan" }, { frameId: 0 }),
  );
  if (scan?.error) throw Error(scan.error);
  const questions = scan.questions as AIQuestion[];
  if (!questions.length)
    return { message: "No empty supported AI questions found.", fields: [] };
  const request = aiRequestSchema.parse({
    role: scan.position || profile.values.preferredRole || profile.title,
    company: scan.company || "",
    description: "",
    tone: "professional",
    facts: careerFacts(profile.values),
    questions,
  });
  const result = await withTimeout(
    chrome.runtime.sendMessage({ type: "ai-generate", request }),
    30000,
  );
  if (result?.error) throw Error(result.error);
  const fields = questions.map((question) => ({
    question,
    tabId,
    role: request.role,
    company: request.company,
    text:
      (result.answers as AIAnswer[]).find((a) => a.id === question.id)?.text ??
      "",
  }));
  const answers = (result.answers as AIAnswer[])
    .filter((a) => {
      const q = questions.find((q) => q.id === a.id);
      return (
        q && a.text.trim() && !a.missingFacts.length && !exceedsLimit(a, q)
      );
    })
    .map(({ id, text }) => ({ id, text }));
  if (!answers.length)
    return {
      message:
        "AI answers need more facts or shorter drafts. Open AI answers to review and generate them individually. Nothing was filled by AI.",
      fields,
    };
  const filled = await withTimeout(
    chrome.tabs.sendMessage(
      tabId,
      { type: "ai-fill", token: scan.token, answers },
      { frameId: 0 },
    ),
  );
  if (filled?.error) throw Error(filled.error);
  return {
    fields: fields.map((field) => ({
      ...field,
      receipt: filled.receipts?.[field.question.id],
    })),
    message: `AI filled ${filled.filled} of ${questions.length} questions. Review these answers on the page before submitting.${answers.length < questions.length ? " Some questions need shorter answers or more career details; use AI answers to handle them individually." : ""} ${filled.errors.join(" ")}`,
  };
}
