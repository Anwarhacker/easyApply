import { isReactSelect } from "./react-select";
// Check syntax before touching any input, including a detached validation probe.
export function validInputSyntax(type: string, value: string): boolean {
  if (["number", "range"].includes(type))
    return (
      /^-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?$/.test(value) &&
      Number.isFinite(Number(value))
    );
  if (type === "month")
    return (
      /^\d{4,}-\d{2}$/.test(value) &&
      +value.slice(0, -3) > 0 &&
      +value.slice(-2) >= 1 &&
      +value.slice(-2) <= 12
    );
  if (type === "date" || type === "datetime-local") {
    const parts = value.match(/^(\d{4,})-(\d{2})-(\d{2})(?:T(.+))?$/);
    if (!parts) return false;
    const [, y, m, d, time] = parts;
    const year = +y,
      month = +m,
      day = +d;
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return (
      year > 0 &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= days[month - 1] &&
      (type === "date" ? !time : !!time && validInputSyntax("time", time))
    );
  }
  if (type === "time")
    return /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?$/.test(value);
  if (type === "week") {
    const parts = value.match(/^(\d{4,})-W(\d{2})$/);
    if (!parts || +parts[1] < 1 || +parts[2] < 1 || +parts[2] > 53)
      return false;
    const date = new Date(0);
    date.setUTCFullYear(+parts[1], 0, 1);
    const year = +parts[1],
      leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return (
      +parts[2] <= 52 ||
      date.getUTCDay() === 4 ||
      (leap && date.getUTCDay() === 3)
    );
  }
  if (type === "color") return /^#[0-9a-f]{6}$/i.test(value);
  return true;
}

export function inputCompatibilityError(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement,
  value: string,
): string | null {
  if (el instanceof HTMLSelectElement && el.multiple)
    return "Multi-select control requires manual selection";
  // Browser validity.tooLong/tooShort does not reliably report values assigned
  // by script. Check text limits ourselves, including textarea controls.
  if (value && (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement &&
    ["text", "search", "url", "tel", "email", "password"].includes(el.type)))) {
    if (el.maxLength >= 0 && value.length > el.maxLength)
      return `saved value exceeds this field's ${el.maxLength}-character limit`;
    if (el.minLength > 0 && value.length < el.minLength)
      return `saved value is shorter than this field's ${el.minLength}-character minimum`;
  }
  if (
    !value ||
    !(el instanceof HTMLInputElement) ||
    ["radio", "checkbox", "file"].includes(el.type)
  )
    return null;
  if (isReactSelect(el)) return null;
  if (
    el.getAttribute("role") === "combobox" ||
    el.getAttribute("aria-haspopup") === "listbox" ||
    el.closest('[role="combobox"]')
  )
    return "custom dropdown requires manual selection";
  if (!validInputSyntax(el.type, value))
    return `saved value is not a valid ${el.type}; enter a compatible value manually`;
  const probe = el.cloneNode(false) as HTMLInputElement;
  probe.value = value;
  if (
    probe.value !== value &&
    [
      "number",
      "range",
      "date",
      "month",
      "week",
      "time",
      "datetime-local",
      "color",
    ].includes(el.type)
  )
    return "saved value would be changed by this field; enter it manually";
  if (probe.validity.rangeUnderflow || probe.validity.rangeOverflow)
    return "saved value is outside this field's allowed range";
  if (probe.validity.stepMismatch)
    return "saved value does not match this field's allowed increment";
  if (
    probe.validity.typeMismatch ||
    probe.validity.patternMismatch ||
    probe.validity.badInput
  )
    return "saved value does not match this field's required format";
  return null;
}
