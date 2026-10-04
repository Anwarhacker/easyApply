import type { Application } from "./model";

const comparable = (value: unknown) => value === undefined ? "" : value;
const sameRecord = (a: Application, b: Application) => (Object.keys({ ...a, ...b }) as (keyof Application)[]).every(key => comparable(a[key]) === comparable(b[key]));
export function mergeApplicationChanges(current: Application[], baseline: Application[], desired: Application[]): Application[] {
  const next = new Map(current.map(app => [app.id, { ...app }]));
  const before = new Map(baseline.map(app => [app.id, app]));
  const edited = new Map(desired.map(app => [app.id, app]));
  if (next.size !== current.length || before.size !== baseline.length || edited.size !== desired.length) throw Error("Application IDs must be unique.");
  for (const original of baseline) {
    const draft = edited.get(original.id), saved = next.get(original.id);
    if (!draft) {
      if (saved && !sameRecord(saved, original)) throw Error("This application changed in another window. Review it before deleting.");
      next.delete(original.id); continue;
    }
    if (sameRecord(original, draft)) continue;
    if (!saved) throw Error("This application was deleted in another window. Your draft has not been saved.");
    for (const key of Object.keys({ ...original, ...draft }) as (keyof Application)[]) {
      if (comparable(draft[key]) === comparable(original[key])) continue;
      if (comparable(saved[key]) !== comparable(original[key]) && comparable(saved[key]) !== comparable(draft[key]))
        throw Error(`Application ${key} changed in another window. Your draft is still here; reload and review before saving.`);
      saved[key] = draft[key] ?? "";
    }
  }
  for (const draft of desired) if (!before.has(draft.id)) {
    const saved = next.get(draft.id);
    if (saved && !sameRecord(saved, draft)) throw Error("An application with this ID already exists. Refresh before saving.");
    next.set(draft.id, { ...draft });
  }
  return [...next.values()];
}

function jobUrl(raw: string): string {
  try {
    const url = new URL(raw);
    // Keep fragments and job-ID parameters: both can identify different roles.
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^(?:gclid|fbclid)$/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href;
  } catch { return ""; }
}
export function sameApplication(a: Application, b: Application): boolean {
  const normalize = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();
  if (a.appliedDate !== b.appliedDate || normalize(a.company) !== normalize(b.company) || normalize(a.position) !== normalize(b.position)) return false;
  const first = jobUrl(a.url), second = jobUrl(b.url);
  return first && second ? first === second : !first && !second;
}

export const applicationStatuses = ["Applied", "Interview", "Offer", "Rejected", "Withdrawn"] as const;
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function followUpDue(app: Application, today = localDate()): boolean {
  return Boolean(app.followUpDate && app.followUpDate <= today && !["Rejected", "Withdrawn"].includes(app.status));
}
export function filterApplications(apps: Application[], search: string, status: string, due: boolean, sort: string, today = localDate()) {
  const query = search.trim().toLowerCase();
  return apps.filter(app => (status === "All" || app.status === status) && (!due || followUpDue(app, today)) &&
    (!query || [app.company, app.position, app.notes, app.resume].some(value => value.toLowerCase().includes(query))))
    .sort((a, b) => {
      if (sort === "company") return a.company.localeCompare(b.company) || a.position.localeCompare(b.position);
      if (sort === "followUp") return (a.followUpDate || "9999-12-31").localeCompare(b.followUpDate || "9999-12-31") || b.appliedDate.localeCompare(a.appliedDate);
      return sort === "oldest" ? a.appliedDate.localeCompare(b.appliedDate) : b.appliedDate.localeCompare(a.appliedDate);
    });
}
