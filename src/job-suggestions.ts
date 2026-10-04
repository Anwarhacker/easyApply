import type { Profile } from "./model";

export interface JobContext { title: string; description: string }
export interface ProfileSuggestion { profileId: string; title: string; score: number; roleTerms: string[]; skillTerms: string[] }
const stop = new Set("a an and or the to of in for with on at is are be you your our we us as from by have will this that experience years skills knowledge required preferred role job work working team good strong ability developer engineer senior junior software".split(" "));
function terms(text: string): Set<string> {
  return new Set((text.toLowerCase()
    .replace(/\b(node|next|vue|react)\.js\b/g, "$1js")
    .replace(/\breactjs\b/g, "react").replace(/\bvuejs\b/g, "vue")
    .replace(/\bfront[ -]end\b/g, "frontend").replace(/\bback[ -]end\b/g, "backend")
    .replace(/\bfull[ -]stack\b/g, "fullstack")
    .match(/\.net\b|[a-z][a-z0-9]*(?:\+\+|#)?/g) ?? [])
    .filter(t => t.length > 1 && !stop.has(t)));
}

/** Local lexical evidence, not a qualification score or an AI hiring assessment. */
export function suggestProfiles(job: JobContext, profiles: Profile[]): ProfileSuggestion[] {
  const title = terms(job.title.slice(0, 300));
  const description = terms(job.description.slice(0, 16000));
  const all = new Set([...title, ...description]);
  return profiles.map(profile => {
    const role = terms(`${profile.title} ${profile.values.preferredRole}`);
    const roleTerms = [...role].filter(t => title.has(t));
    const skillTerms = [...terms(`${profile.values.skills} ${profile.values.technologies}`)].filter(t => all.has(t));
    const roleBody = [...role].filter(t => description.has(t));
    const score = roleTerms.length * 6 + skillTerms.length * 3 + roleBody.length;
    return { profileId: profile.id, title: profile.title, score, roleTerms, skillTerms };
  }).filter(s => s.roleTerms.length > 0 || s.skillTerms.length >= 2)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, 3);
}

export function readJobContext(doc: Document): JobContext {
  const title = doc.querySelector("h1")?.textContent?.trim().slice(0, 300) ?? "";
  const node = doc.querySelector('[itemprop="description"], #job-description, .job-description, [data-testid="job-description"], .job__description, main, [role="main"]');
  const copy = node?.cloneNode(true) as Element | undefined;
  copy?.querySelectorAll("form, input, textarea, select, button, nav, header, footer, script, style, #easyapply-host").forEach(el => el.remove());
  return { title, description: copy?.textContent?.replace(/\s+/g, " ").trim().slice(0, 16000) ?? "" };
}
