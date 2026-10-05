import { useEffect, useMemo, useState, type FormEvent } from "react";
import { answerCategorySchema, deleteAnswer, editAnswer, getAnswerLibrary, saveAnswer, type NewSavedAnswer, type SavedAnswer } from "./answer-library";
import { memoryAnswerSchema } from "./field-memory";

const categories = answerCategorySchema.options;
const blank: NewSavedAnswer = { question: "", answer: "", category: "general", tags: [], roleTypes: [], favorite: false };
const title = (category: string) => category[0].toUpperCase() + category.slice(1);

export function AnswerLibrary() {
  const [answers, setAnswers] = useState<SavedAnswer[]>([]);
  const [draft, setDraft] = useState<NewSavedAnswer>(blank);
  const [editingId, setEditingId] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try { setAnswers(await getAnswerLibrary()); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load the Answer Library."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);

  const visible = useMemo(() => answers.filter(item =>
    (category === "all" || item.category === category) && (!favoritesOnly || item.favorite) &&
    `${item.question} ${item.answer} ${item.tags.join(" ")} ${item.roleTypes.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase())
  ).sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.updatedAt - a.updatedAt), [answers, category, favoritesOnly, query]);

  function startEdit(item: SavedAnswer) {
    setDraft({ question: item.question, answer: item.answer, category: item.category, tags: [...item.tags], roleTypes: [...item.roleTypes], favorite: item.favorite });
    setEditingId(item.id); setError(""); setNotice("");
    document.getElementById("answer-library-editor")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  function resetEditor() { setDraft(blank); setEditingId(""); setError(""); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const question = draft.question.trim();
    const answer = memoryAnswerSchema.safeParse(draft.answer);
    if (question.length < 3 || question.length > 300 || !answer.success) { setError("Enter a question (3–300 characters) and an ordinary application answer (1–2,000 characters). Sensitive and legal questions are not allowed."); return; }
    const payload: NewSavedAnswer = { ...draft, question, answer: answer.data,
      tags: [...new Set(draft.tags.map(item => item.trim()).filter(Boolean))],
      roleTypes: [...new Set(draft.roleTypes.map(item => item.trim()).filter(Boolean))] };
    setBusy(true); setError(""); setNotice("");
    try {
      if (editingId) await editAnswer(editingId, payload); else await saveAnswer(payload);
      await refresh(); resetEditor(); setNotice(editingId ? "Answer updated." : "Answer saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this answer."); }
    finally { setBusy(false); }
  }
  async function remove(item: SavedAnswer) {
    if (!window.confirm(`Delete the saved answer “${item.question}”?`)) return;
    setBusy(true); setError(""); setNotice("");
    try { await deleteAnswer(item.id); await refresh(); if (editingId === item.id) resetEditor(); setNotice("Answer deleted."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete this answer."); }
    finally { setBusy(false); }
  }
  async function toggleFavorite(item: SavedAnswer) {
    setBusy(true); setError("");
    try { const next = await editAnswer(item.id, { favorite: !item.favorite }); setAnswers(next); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update favorite."); }
    finally { setBusy(false); }
  }

  return <section className="answer-library" aria-labelledby="answer-library-title">
    <header><div><h2 id="answer-library-title">Answer Library</h2><p>Save reusable application answers. Suggestions are reviewed before they can be filled into a form.</p></div><span>{answers.length} / 500 saved</span></header>
    <form id="answer-library-editor" className="answer-library-editor" onSubmit={event => void submit(event)}>
      <h3>{editingId ? "Edit saved answer" : "Add an answer"}</h3>
      <label>Question<input required minLength={3} maxLength={300} value={draft.question} onChange={event => setDraft({ ...draft, question: event.target.value })} /></label>
      <label>Answer<textarea required maxLength={2000} value={draft.answer} onChange={event => setDraft({ ...draft, answer: event.target.value })} /></label>
      <div className="answer-library-form-grid">
        <label>Category<select value={draft.category} onChange={event => setDraft({ ...draft, category: answerCategorySchema.parse(event.target.value) })}>{categories.map(value => <option key={value} value={value}>{title(value)}</option>)}</select></label>
        <label>Role types (comma separated)<input maxLength={500} value={draft.roleTypes.join(", ")} onChange={event => setDraft({ ...draft, roleTypes: event.target.value.split(",").slice(0, 20).map(value => value.trim().slice(0, 100)) })} /></label>
      </div>
      <label>Tags (comma separated)<input maxLength={500} value={draft.tags.join(", ")} onChange={event => setDraft({ ...draft, tags: event.target.value.split(",").slice(0, 20).map(value => value.trim().slice(0, 50)) })} /></label>
      <label className="answer-library-favorite"><input type="checkbox" checked={draft.favorite} onChange={event => setDraft({ ...draft, favorite: event.target.checked })} /> Favorite</label>
      <div className="answer-library-actions"><button type="submit" className="primary" disabled={busy}>{busy ? "Saving…" : editingId ? "Save changes" : "Save answer"}</button>{editingId && <button type="button" disabled={busy} onClick={resetEditor}>Cancel edit</button>}</div>
      {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    </form>
    <div className="answer-library-browse">
      <label>Search answers<input type="search" placeholder="Find a question, answer, role, or tag" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="answer-library-filters"><label>Category<select value={category} onChange={event => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map(value => <option key={value} value={value}>{title(value)}</option>)}</select></label><label className="answer-library-favorite"><input type="checkbox" checked={favoritesOnly} onChange={event => setFavoritesOnly(event.target.checked)} /> Favorites only</label></div>
    </div>
    {loading ? <p role="status">Loading saved answers…</p> : !visible.length ? <p>{answers.length ? "No answers match these filters." : "No answers saved yet."}</p> : <div className="answer-library-list">{visible.map(item => <article key={item.id}>
      <div className="answer-library-entry-heading"><div><h3>{item.question}</h3><span>{title(item.category)} · Used {item.usageCount} {item.usageCount === 1 ? "time" : "times"}{item.roleTypes.length ? ` · ${item.roleTypes.join(", ")}` : ""}</span></div><button type="button" aria-label={item.favorite ? "Remove favorite" : "Add favorite"} aria-pressed={item.favorite} disabled={busy} onClick={() => void toggleFavorite(item)}>{item.favorite ? "★" : "☆"}</button></div>
      <p>{item.answer}</p>{item.tags.length > 0 && <small>Tags: {item.tags.join(", ")}</small>}
      <div className="answer-library-actions"><button type="button" disabled={busy} onClick={() => startEdit(item)}>Edit</button><button type="button" className="danger" disabled={busy} onClick={() => void remove(item)}>Delete</button></div>
    </article>)}</div>}
    <p className="answer-library-privacy">Saved locally in this Chrome profile. This library is for ordinary application answers; never store passwords, API keys, identity numbers, or legal declarations here.</p>
  </section>;
}
