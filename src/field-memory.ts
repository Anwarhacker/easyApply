import { z } from "zod";
import { forbidden, matchField } from "./matching";
import { customEntrySchema } from "./custom-info";

// Keep words, numbers, negation and locations; only typography is normalized.
export const questionKey = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim().replace(/[?*：:]+$/g, "").trim();
export function sensitiveMemoryQuestion(s: string): boolean {
  return forbidden(s) || /\b(gender|race|ethnic|ethnicity|veteran|disab|disability|medical|health|religion|sexual|orientation|marital|born|nationality|pregnan|citizen|visa|sponsor|criminal|convict|arrest|legal|authorization|authorisation|certif|attest|declar|signature|salary|compensation|password|passphrase|secret|token|api key|pin|identity|national id|tax id|age|birth)\w*\b/i.test(s);
}
export function safeMemoryQuestion(s: string): boolean {
  return s.trim().length >= 3 && !/^(answer|other|details|value)$/i.test(s.trim()) && s.length <= 300 && !sensitiveMemoryQuestion(s) && !matchField([s]);
}
export const memoryAnswerSchema = z.string().trim().min(1).max(2000).refine(value => customEntrySchema.shape.value.safeParse(value).success && !/-----BEGIN|\b(?:gsk_|sk-)[a-zA-Z0-9_-]+/.test(value), "Use ordinary application answers only.");
export const customFieldAnswersSchema = z.record(z.string().refine(safeMemoryQuestion), memoryAnswerSchema).refine(record => Object.keys(record).length <= 100, "Save up to 100 remembered answers per profile.");
export const memoryCandidateSchema = z.object({ question: z.string().refine(safeMemoryQuestion), answer: memoryAnswerSchema });
export function rememberedAnswer(question: string, answers: Record<string, string>): string {
  if (!safeMemoryQuestion(question)) return "";
  const matches = Object.entries(answers).filter(([label]) => questionKey(label) === questionKey(question));
  return matches.length === 1 && memoryAnswerSchema.safeParse(matches[0][1]).success ? matches[0][1] : "";
}

/** Apply deliberate edits while retaining answers learned since the editor opened. */
export function mergeRememberedAnswers(current: Record<string, string>, original: Record<string, string | undefined>, draft: Record<string, string>) {
  const merged = {...current};
  const remove = (question: string) => { for (const label of Object.keys(merged)) if (questionKey(label) === questionKey(question)) delete merged[label]; };
  for (const question of Object.keys(original)) if (!(question in draft)) remove(question);
  for (const [question, answer] of Object.entries(draft)) if (original[question] !== answer) { remove(question); merged[question] = answer; }
  return merged;
}
