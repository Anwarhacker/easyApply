import { signals, type Control } from "../field-signals";
import { classifyMetadata } from "./classifiers";
import { scoreField } from "./confidence";
import type { DetectedField, FieldMetadata } from "./types";

function text(value: string | null | undefined) {
  return (value ?? "").trim().slice(0, 200);
}

export function collectFieldMetadata(element: Control): FieldMetadata {
  const root = element.getRootNode() as Document | ShadowRoot;
  const labelledBy = (element.getAttribute("aria-labelledby") ?? "").split(/\s+/)
    .map(id => root.getElementById?.(id)?.textContent ?? "").filter(Boolean).join(" ");
  const directLabel = [...((element as HTMLInputElement).labels ?? [])]
    .map(label => label.textContent ?? "").filter(Boolean).join(" ");
  const input = element as HTMLInputElement;
  return {
    tag: element.tagName.toLowerCase(),
    type: text(input.type).toLowerCase(),
    name: text(input.name),
    id: text(element.id),
    placeholder: text(element.getAttribute("placeholder") ?? element.getAttribute("lt-prop-placeholder")),
    ariaLabel: text(element.getAttribute("aria-label") ?? labelledBy),
    autocomplete: text(element.getAttribute("autocomplete")),
    labelText: text(directLabel),
    signals: signals(element).map(text),
  };
}

export function detectField(element: Control): DetectedField {
  const metadata = collectFieldMetadata(element);
  const type = classifyMetadata(metadata);
  const { confidence, evidence } = scoreField(metadata, type);
  return { element, type, confidence, evidence };
}
