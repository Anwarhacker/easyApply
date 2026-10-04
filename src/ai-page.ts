import { z } from "zod";
import { classifyQuestion, wordCount, type AIQuestion } from "./ai";
import { signals } from "./field-signals";
import { extractJobMetadata } from "./tracker-detector";
const entries = new Map<
  string,
  {
    el: HTMLInputElement | HTMLTextAreaElement;
    question: AIQuestion;
    signature: string;
  }
>();
const replacements = new Map<
  string,
  {
    el: HTMLInputElement | HTMLTextAreaElement;
    question: AIQuestion;
    signature: string;
    value: string;
    url: string;
    created: number;
  }
>();
export const aiReplaceSchema = z
  .object({
    type: z.literal("ai-replace"),
    receipt: z.string().max(100),
    text: z.string().min(1).max(4000),
  })
  .strict();
let token = "",
  url = "",
  created = 0;
const signature = (el: HTMLInputElement | HTMLTextAreaElement) =>
  JSON.stringify([signals(el), el.type, el.maxLength, el.form?.action]);
const eligible = (el: HTMLInputElement | HTMLTextAreaElement) =>
  el.isConnected &&
  !el.disabled &&
  !el.readOnly &&
  !el.value &&
  el.getClientRects().length > 0 &&
  getComputedStyle(el).visibility !== "hidden" &&
  !el.closest('[inert], [aria-hidden="true"]');
export const aiFillSchema = z
  .object({
    type: z.literal("ai-fill"),
    token: z.string().max(100),
    answers: z
      .array(
        z
          .object({
            id: z.string().max(100),
            text: z.string().min(1).max(4000),
          })
          .strict(),
      )
      .min(1)
      .max(6),
  })
  .strict();
export function scanAIPage() {
  entries.clear();
  replacements.clear();
  token = crypto.randomUUID();
  url = location.href;
  created = Date.now();
  for (const el of document.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement
  >('textarea,input[type="text"],input:not([type])')) {
    if (
      !eligible(el) ||
      el.matches(
        '[role="combobox"], [aria-haspopup], [autocomplete="one-time-code"]',
      )
    )
      continue;
    const fullQuestion = signals(el).join(" ").replace(/\s+/g, " ").trim();
    const question = fullQuestion.slice(0, 600);
    const kind = classifyQuestion(fullQuestion);
    if (!kind) continue;
    const wordLimit = question.match(
      /(?:max(?:imum)?\s*|up to\s*)?(\d+)\s*words/i,
    );
    const q: AIQuestion = {
      id: crypto.randomUUID(),
      question,
      kind,
      maxChars: el.maxLength >= 0 ? Math.min(el.maxLength, 4000) : 4000,
      maxWords: wordLimit
        ? Math.min(500, Number(wordLimit[1]))
        : kind === "coverLetter"
          ? 300
          : 150,
    };
    if (!q.maxChars || !q.maxWords) continue;
    entries.set(q.id, { el, question: q, signature: signature(el) });
    if (entries.size === 6) break;
  }
  return {
    token,
    questions: [...entries.values()].map((e) => e.question),
    ...extractJobMetadata(document, location.href),
  };
}
export function fillAIPage(raw: z.infer<typeof aiFillSchema>) {
  if (
    raw.token !== token ||
    url !== location.href ||
    Date.now() - created > 120000
  )
    throw Error(
      "This preview expired or the page changed. Detect questions again.",
    );
  token = ""; // Single-use, including partially unsuccessful fills.
  let filled = 0;
  const errors: string[] = [];
  const receipts: Record<string, string> = {};
  for (const answer of raw.answers) {
    const item = entries.get(answer.id);
    if (
      !item ||
      location.href !== url ||
      !eligible(item.el) ||
      signature(item.el) !== item.signature ||
      answer.text.length > item.question.maxChars ||
      wordCount(answer.text) > item.question.maxWords
    ) {
      errors.push(
        "A field changed, was already filled, or exceeded its limit. Rescan to continue.",
      );
      continue;
    }
    const proto =
      item.el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(
      item.el,
      answer.text,
    );
    item.el.dispatchEvent(new Event("input", { bubbles: true }));
    item.el.dispatchEvent(new Event("change", { bubbles: true }));
    if (item.el.value === answer.text && item.el.validity.valid) {
      filled++;
      const receipt = crypto.randomUUID();
      receipts[answer.id] = receipt;
      replacements.set(receipt, {
        ...item,
        value: answer.text,
        url,
        created: Date.now(),
      });
    } else errors.push("A website rejected an answer; review the field.");
  }
  entries.clear();
  return { filled, errors, receipts };
}

export function replaceAIAnswer(raw: z.infer<typeof aiReplaceSchema>) {
  const item = replacements.get(raw.receipt);
  if (
    !item ||
    item.url !== location.href ||
    Date.now() - item.created > 120000 ||
    !item.el.isConnected ||
    item.el.disabled ||
    item.el.readOnly ||
    !item.el.getClientRects().length ||
    getComputedStyle(item.el).visibility === "hidden" ||
    item.el.closest('[inert], [aria-hidden="true"]') ||
    item.el.value !== item.value ||
    signature(item.el) !== item.signature
  )
    throw Error(
      "This field changed or its preview expired. Your current answer was preserved. Scan again to continue.",
    );
  if (
    raw.text.length > item.question.maxChars ||
    wordCount(raw.text) > item.question.maxWords
  )
    throw Error(
      "The new answer exceeds the field limit. Your current answer was preserved.",
    );
  replacements.delete(raw.receipt);
  const proto =
    item.el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(item.el, raw.text);
  item.el.dispatchEvent(new Event("input", { bubbles: true }));
  item.el.dispatchEvent(new Event("change", { bubbles: true }));
  if (item.el.value !== raw.text || !item.el.validity.valid)
    throw Error("The website rejected the answer. Review the page.");
  const receipt = crypto.randomUUID();
  replacements.set(receipt, { ...item, value: raw.text, created: Date.now() });
  return { receipt };
}
