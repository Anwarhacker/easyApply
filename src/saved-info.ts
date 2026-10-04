import { groups, label, type Profile } from "./model";
import type { CustomEntry } from "./custom-info";
export function savedSections(profile: Profile, custom: CustomEntry[] = []) {
  const sections: {
    title: string;
    rows: { key: string; title: string; value: string }[];
  }[] = Object.entries(groups)
    .map(([title, fields]) => ({
      title,
      rows: fields
        .filter((key) => profile.values[key]?.trim())
        .map((key) => ({ key, title: label(key), value: profile.values[key] })),
    }))
    .filter((section) => section.rows.length);
  const learned = Object.entries(profile.customFieldAnswers ?? {});
  if (learned.length) sections.push({title:"Learned answers", rows:learned.map(([question, value]) => ({key:`answer:${question}`,title:question,value}))});
  if (custom.length)
    sections.push({
      title: "Custom saved info",
      rows: custom.map((e) => ({
        key: `custom:${e.id}`,
        title: e.title,
        value: e.value,
      })),
    });
  return sections;
}
export function profileText(profile: Profile, custom: CustomEntry[] = []) {
  return (
    [
      `easyApply — ${profile.title}`,
      ...savedSections(profile, custom).map(
        (section) =>
          `${section.title}\n${section.rows.map((row) => `${row.title}: ${row.value}`).join("\n")}`,
      ),
    ].join("\n\n") + "\n"
  );
}
export function profileFilename(profile: Profile) {
  return `easyApply-${profile.title.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60) || "profile"}.txt`;
}

export function savedRowMatches(row: {title: string; value: string}, query: string) {
  const text = `${row.title} ${row.value}`.normalize("NFKC").toLocaleLowerCase();
  return query.normalize("NFKC").toLocaleLowerCase().trim().split(/\s+/).filter(Boolean).every(term => text.includes(term));
}
export function savedRowsText(rows: {title: string; value: string}[]) {
  return rows.map(row => `${row.title}: ${row.value}`).join("\n\n");
}
