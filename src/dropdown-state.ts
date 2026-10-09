import { normalize } from "./matching";

export interface DropdownState {
  value?: string;
  text?: string;
  selected?: string;
  expanded?: boolean;
  activeOption?: string;
}

/** Capture the form-facing state exposed by a native or custom dropdown. */
export function readDropdownState(element: HTMLElement, trigger: HTMLElement = element): DropdownState {
  if (element instanceof HTMLSelectElement) {
    const option = element.selectedOptions[0];
    return { value: element.value, text: option?.text.trim() ?? "", selected: option ? `${option.index}:${option.value}` : "" };
  }
  const select = element.querySelector("select");
  const option = select instanceof HTMLSelectElement ? select.selectedOptions[0] : null;
  const display = element.querySelector<HTMLElement>("[aria-valuetext],[data-selected-value],[data-value],.mat-mdc-select-value,.p-dropdown-label,.ant-select-selection-item,.select2-selection__rendered,[data-radix-select-value],.select__single-value,[class*='singleValue'],.selected-value,[class*='selectedValue'],.select-value");
  const inputValue = element instanceof HTMLInputElement ? element.value : "";
  const componentValue = (element as HTMLElement & { value?: unknown }).value;
  const hiddenValue = element.querySelector<HTMLInputElement>("input[type='hidden']")?.value ?? "";
  const value = element.getAttribute("data-selected-value") ?? element.getAttribute("data-value") ?? element.getAttribute("value") ?? element.getAttribute("lt-prop-selected") ?? trigger.getAttribute("data-selected-value") ?? trigger.getAttribute("data-value") ?? (hiddenValue || inputValue || (typeof componentValue === "string" ? componentValue : ""));
  const ownText = trigger === element && !trigger.querySelector("[role='option'],[role='listbox']") ? trigger.textContent?.trim() : "";
  const text = display?.getAttribute("aria-valuetext")?.trim() || display?.textContent?.trim() || trigger.getAttribute("aria-valuetext")?.trim() || (trigger === element ? ownText : trigger.textContent?.trim()) || "";
  return {
    value: value.trim(),
    text,
    selected: option ? `${option.index}:${option.value}` : element.getAttribute("data-selected-value") ?? element.getAttribute("lt-prop-selected") ?? "",
    expanded: trigger.getAttribute("aria-expanded") === null ? undefined : trigger.getAttribute("aria-expanded") === "true",
    activeOption: trigger.getAttribute("aria-activedescendant") || undefined,
  };
}

/** Require a changed, form-facing value that safely resolves to the expected answer. */
export function verifyDropdownSelection(before: DropdownState, after: DropdownState, expected: string | string[]): boolean {
  const expectedValues = (Array.isArray(expected) ? expected : [expected]).filter(Boolean).map(normalize);
  if (!expectedValues.length) return false;
  const changed = (["value", "text", "selected"] as const)
    .some(key => (before[key] ?? "") !== (after[key] ?? ""));
  if (!changed) return false;
  const actuals = [after.value, after.text, after.selected].filter((value): value is string => !!value?.trim());
  return actuals.some(actual => expectedValues.includes(normalize(actual)));
}
