import { matchSelectOption } from "./dropdown";
export { setNativeSelect } from "./native-select";

export interface RadioChoice<T = unknown> {
  value: string;
  text: string;
  element?: T;
  disabled?: boolean;
}

const radioNormalize = (value: string) => value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

/** Resolve a radio answer only when exactly one enabled option matches. */
export function matchRadioChoice<T>(answer: string, choices: RadioChoice<T>[]): RadioChoice<T> | null {
  if (!answer.trim()) return null;
  const enabled = choices.filter(choice => !choice.disabled && (choice.text.trim() || choice.value.trim()));
  const exact = enabled.filter(choice => radioNormalize(choice.text) === radioNormalize(answer) || radioNormalize(choice.value) === radioNormalize(answer));
  if (exact.length) return exact.length === 1 ? exact[0] : null;
  const match = matchSelectOption(answer, enabled.map(choice => ({ value: choice.value, text: choice.text, choice })));
  return match?.choice ?? null;
}

export function isRadioControl(element: Element): boolean {
  return (element instanceof HTMLInputElement && element.type === "radio") || element.getAttribute("role") === "radio";
}

export function radioGroupChoices(radio: Element): RadioChoice<HTMLElement>[] {
  if (!isRadioControl(radio)) return [];
  const root = radio.getRootNode() as Document | ShadowRoot;
  const peers: HTMLElement[] = radio instanceof HTMLInputElement
    ? [...root.querySelectorAll<HTMLInputElement>('input[type="radio"]')].filter(peer => peer.form === radio.form && (radio.name ? peer.name === radio.name : peer === radio))
    : radio.closest<HTMLElement>("[role='radiogroup']")
      ? [...radio.closest<HTMLElement>("[role='radiogroup']")!.querySelectorAll<HTMLElement>("[role='radio']")]
      : [radio as HTMLElement];
  return peers.map(peer => ({
    value: peer instanceof HTMLInputElement ? peer.value : peer.getAttribute("data-value") || peer.getAttribute("value") || peer.getAttribute("aria-valuetext") || "",
    text: (peer instanceof HTMLInputElement ? [...(peer.labels ?? [])].map(label => label.textContent ?? "").join(" ").trim() : peer.getAttribute("aria-label") || peer.getAttribute("aria-labelledby")?.split(/\s+/).map(id => root.getElementById?.(id)?.textContent ?? "").join(" ").trim() || peer.textContent?.trim()) || peer.getAttribute("title") || "",
    element: peer,
    disabled: (peer instanceof HTMLInputElement && peer.disabled) || peer.matches(":disabled,[aria-disabled='true']"),
  }));
}

export function selectRadioChoice(radio: HTMLElement): boolean {
  if (!radio.isConnected || !isRadioControl(radio) || radio.matches(":disabled,[aria-disabled='true']") ||
    (radio instanceof HTMLInputElement ? radio.checked : radio.getAttribute("aria-checked") === "true")) return false;
  radio.click();
  return radio.isConnected && (radio instanceof HTMLInputElement ? radio.checked : radio.getAttribute("aria-checked") === "true");
}

export function optionMatchesAnswer(answer: string, option: { value: string; text: string }, field?: string): boolean {
  const match = matchSelectOption(answer, [option], field);
  return !!match;
}
