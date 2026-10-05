import { z } from "zod";
import { memoryAnswerSchema, questionKey, sensitiveMemoryQuestion } from "./field-memory";

export const answerCategorySchema = z.enum(["hr", "technical", "behavioral", "project", "general"]);
export const savedAnswerSchema = z.object({
  id: z.string().min(1).max(100),
  question: z.string().trim().min(3).max(300).refine(value => !sensitiveMemoryQuestion(value), "Sensitive or legal questions cannot be saved in the Answer Library."),
  answer: memoryAnswerSchema,
  category: answerCategorySchema,
  tags: z.array(z.string().trim().min(1).max(50)).max(20),
  roleTypes: z.array(z.string().trim().min(1).max(100)).max(20),
  favorite: z.boolean(),
  usageCount: z.number().int().min(0),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});
export type SavedAnswer = z.infer<typeof savedAnswerSchema>;
export type NewSavedAnswer = Pick<SavedAnswer, "question" | "answer" | "category" | "tags" | "roleTypes" | "favorite">;
export type SavedAnswerUpdate = Partial<NewSavedAnswer>;

const librarySchema = z.array(savedAnswerSchema).max(500);
const storageKey = "easyapply.answer-library";

export async function getAnswerLibrary(): Promise<SavedAnswer[]> {
  const stored = (await chrome.storage.local.get(storageKey))[storageKey];
  const parsed = librarySchema.safeParse(stored ?? []);
  if (!parsed.success) throw Error("The Answer Library could not be validated. It has not been changed; keep the stored data for recovery.");
  return parsed.data;
}

async function updateLibrary(change: (library: SavedAnswer[]) => SavedAnswer[]) {
  return navigator.locks.request("easyapply-answer-library", async () => {
    const current = await getAnswerLibrary();
    const next = librarySchema.parse(change(current));
    await chrome.storage.local.set({ [storageKey]: next });
    return next;
  });
}

export async function saveAnswer(input: NewSavedAnswer): Promise<SavedAnswer> {
  const now = Date.now();
  const answer = savedAnswerSchema.parse({ ...input, id: crypto.randomUUID(), usageCount: 0, createdAt: now, updatedAt: now });
  await updateLibrary(library => {
    if (library.length >= 500) throw Error("The Answer Library is full. Remove an answer before adding another.");
    if (library.some(item => questionKey(item.question) === questionKey(answer.question))) throw Error("An answer for this question already exists. Edit the existing entry instead.");
    return [...library, answer];
  });
  return answer;
}

export async function editAnswer(id: string, updates: SavedAnswerUpdate) {
  const cleanUpdates = Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined));
  return updateLibrary(library => {
    const current = library.find(answer => answer.id === id);
    if (!current) throw Error("This answer was removed in another window. Refresh the library.");
    const next = { ...current, ...cleanUpdates, updatedAt: Date.now() };
    if (library.some(item => item.id !== id && questionKey(item.question) === questionKey(next.question))) throw Error("An answer for this question already exists.");
    return library.map(answer => answer.id === id ? next : answer);
  });
}

export async function deleteAnswer(id: string) {
  return updateLibrary(library => library.filter(answer => answer.id !== id));
}

export async function recordAnswerUsage(id: string) {
  return updateLibrary(library => library.map(answer => answer.id === id ? { ...answer, usageCount: answer.usageCount + 1, updatedAt: Date.now() } : answer));
}
