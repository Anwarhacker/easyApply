import { matchField } from "../matching";
import type { FieldMetadata } from "./types";

const weights = {
  label: 72,
  aria: 72,
  placeholder: 55,
  autocomplete: 80,
  name: 65,
  id: 40,
  type: 75,
  // Nearby text is only collected from a tiny container with a single control;
  // in that case it acts as the field's visible label rather than page context.
  nearby: 70,
};

export function scoreField(metadata: FieldMetadata, field: string | null) {
  if (!field) return { confidence: 0, evidence: [] as string[] };
  const evidence: string[] = [];
  let score = 0;
  const add = (kind: keyof typeof weights, value: string) => {
    if (!value.trim() || matchField([value]) !== field) return;
    score += weights[kind];
    evidence.push(`${kind === "aria" ? "Accessible label" : kind === "nearby" ? "Nearby label" : kind[0].toUpperCase() + kind.slice(1)}: ${value.trim().slice(0, 100)}`);
  };
  add("label", metadata.labelText);
  add("aria", metadata.ariaLabel);
  add("placeholder", metadata.placeholder);
  add("autocomplete", metadata.autocomplete);
  add("name", metadata.name);
  add("id", metadata.id);
  if (metadata.type === "email" || metadata.type === "tel") add("type", metadata.type);

  const represented = new Set([metadata.labelText, metadata.ariaLabel, metadata.placeholder, metadata.autocomplete, metadata.name, metadata.id]);
  for (const hint of metadata.signals.slice(0, 12)) {
    if (hint && !represented.has(hint) && matchField([hint]) === field) {
      add("nearby", hint);
      represented.add(hint);
      break;
    }
  }
  return { confidence: Math.min(99, score), evidence };
}
