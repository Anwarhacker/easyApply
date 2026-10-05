import { questionKey, sensitiveMemoryQuestion } from "./field-memory";
import { getAnswerLibrary, type SavedAnswer } from "./answer-library";

export interface AnswerMatch {
  answer: SavedAnswer;
  score: number;
  reasons: string[];
}

const stopWords = new Set("a an the is are am do does did you your we our to for of in on and or why what how tell me about can could would should have has had this that with describe explain".split(" "));
function tokens(value: string) {
  return new Set(questionKey(value).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(token => token && !stopWords.has(token)));
}

export function questionSimilarity(a: string, b: string) {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection++;
  return intersection / new Set([...left, ...right]).size;
}

export function rankAnswerMatches(question: string, library: SavedAnswer[], role?: string, limit = 5): AnswerMatch[] {
  if (question.trim().length < 3 || question.length > 300 || sensitiveMemoryQuestion(question)) return [];
  const roleKey = role ? questionKey(role) : "";
  return library.map(answer => {
    const similarity = questionSimilarity(question, answer.question);
    const reasons: string[] = [];
    let score = similarity;
    if (roleKey && answer.roleTypes.some(value => questionKey(value) === roleKey)) { score += 0.15; reasons.push("Role match"); }
    if (answer.favorite) { score += 0.03; reasons.push("Favorite"); }
    if (answer.usageCount) score += Math.min(answer.usageCount * 0.005, 0.05);
    if (similarity >= 0.8) reasons.push("Similar question");
    return { answer, score: Math.min(score, 1), reasons };
  }).filter(match => match.score >= 0.55).sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(limit, 5)));
}

export async function findAnswerMatches(question: string, role?: string, limit = 5): Promise<AnswerMatch[]> {
  const library = await getAnswerLibrary();
  return rankAnswerMatches(question, library, role, limit);
}
