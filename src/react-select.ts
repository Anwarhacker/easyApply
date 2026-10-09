import { normalize } from "./matching";
import { readDropdownState, verifyDropdownSelection } from "./dropdown-state";

// Scope support to the React Select markup observed on Greenhouse. Unknown
// comboboxes still require manual selection.
export function isReactSelect(el: Element): boolean {
  return el instanceof HTMLInputElement && el.getAttribute("role") === "combobox" &&
    el.classList.contains("select__input") && !!el.closest(".select__control");
}

export function reactSelectValue(el: HTMLInputElement): string {
  return el.closest(".select__control")?.querySelector(".select__single-value")?.textContent?.trim() || el.value;
}

export interface SelectContext { state?: string; country?: string; valid?: () => boolean }
export function sameSelectAnswer(actual: string, expected: string, field?: string, context: SelectContext = {}): boolean {
  const clean = (s: string) => normalize(s).replace(/\bbangalore\b/g, "bengaluru");
  if (field === "city" && actual.includes(",") && !expected.includes(",")) {
    const parts = actual.split(",").map(clean);
    const qualifiers = [context.state, context.country].filter((v): v is string => !!v?.trim()).map(clean);
    return parts[0] === clean(expected) && qualifiers.length > 0 && qualifiers.every(q => parts.slice(1).includes(q));
  }
  if (["city", "currentLocation", "preferredLocation"].includes(field ?? "")) return clean(actual) === clean(expected);
  // Greenhouse calling-country options include the dial prefix.
  if (field === "country") return normalize(actual.replace(/\s*\(?\+\d+\)?\s*$/, "")) === normalize(expected);
  return normalize(actual) === normalize(expected);
}

export async function fillReactSelect(el: HTMLInputElement, value: string, field?: string, context: SelectContext = {}): Promise<boolean> {
  if (!isReactSelect(el) || !el.getClientRects().length || el.disabled || reactSelectValue(el) || !value) return false;
  const control = el.closest<HTMLElement>(".select__control") ?? el;
  const before = readDropdownState(el, control);
  let search = "";
  const setSearch = (text: string) => {
    const previous = el.value;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, text);
    (el as HTMLInputElement & { _valueTracker?: { setValue(v: string): void } })._valueTracker?.setValue(previous);
    el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, data: text, inputType: "insertText" }));
    search = text;
  };
  el.focus();
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", bubbles: true }));
  try {
    const openedAt = Date.now();
    const deadline = openedAt + 2000;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 60));
      if (!el.isConnected || el.disabled || el.value !== search || document.activeElement !== el || context.valid?.() === false) return false;
      if (el.closest(".select__control")?.querySelector(".select__single-value")) return false;
      const ids = (el.getAttribute("aria-controls") || "").split(/\s+/).filter(Boolean);
      const options = ids.flatMap(id => [...(document.getElementById(id)?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])])
        .filter(option => option.getClientRects().length && option.getAttribute("aria-disabled") !== "true");
      const matches = options.filter(option => sameSelectAnswer(option.textContent ?? "", value, field, context));
      if (matches.length > 1) return false;
      if (matches.length === 1) {
        const text = matches[0].textContent?.trim() ?? "";
        matches[0].click();
        for (let attempt = 0; attempt < 8; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 50));
          const selected = el.closest(".select__control")?.querySelector(".select__single-value")?.textContent?.trim();
          const after = readDropdownState(el, control);
          if (selected === text && el.getAttribute("aria-expanded") !== "true" && verifyDropdownSelection(before, after, text)) return true;
        }
        return false;
      }
      if (!search && Date.now() - openedAt >= 300) {
        setSearch(["city", "currentLocation", "preferredLocation"].includes(field ?? "") ? value.replace(/\bbangalore\b/gi, "Bengaluru") : value);
      }
    }
    return false;
  } finally {
    // Clear only our own search text; never overwrite a user edit or selection.
    if (el.isConnected && el.value === search && search) setSearch("");
    if (document.activeElement === el) {
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
      el.blur();
    }
  }
}
