import { normalize } from "./matching";
import { readDropdownState, verifyDropdownSelection } from "./dropdown-state";

/** Apply the native select value through its platform setter and retry once. */
export async function setNativeSelect(select: HTMLSelectElement, value: string, index: number): Promise<boolean> {
  if (!select.isConnected || select.disabled || index < 0 || !select.options[index] || select.options[index].value !== value) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  const expectedText = select.options[index].text.trim();
  const strategies: (() => void)[] = [
    () => { if (setter) setter.call(select, value); else select.value = value; },
    () => { select.selectedIndex = index; },
  ];
  for (const strategy of strategies) {
    const before = readDropdownState(select);
    strategy();
    select.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    select.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    // Give controlled frameworks time to reconcile before trusting the native value.
    await new Promise(resolve => setTimeout(resolve, 120));
    if (!select.isConnected || select.disabled) return false;
    const after = readDropdownState(select);
    if (select.value === value && select.selectedIndex === index && select.selectedOptions[0]?.value === value &&
      normalize(after.text ?? "") === normalize(expectedText) && verifyDropdownSelection(before, after, expectedText)) return true;
  }
  return false;
}
