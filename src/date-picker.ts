/** Runs in the page world: library instances are not accessible in the isolated content script. */
export function setPageDate(token: string, iso: string): boolean {
  const candidates = document.querySelectorAll<HTMLInputElement>("input[data-easyapply-date]");
  const el = [...candidates].find(input => input.getAttribute("data-easyapply-date") === token);
  if (!el || el.disabled || el.value || !el.readOnly || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return false;
  const picker = (el as HTMLInputElement & { _flatpickr?: { setDate: (date: Date, trigger: boolean) => void; selectedDates: Date[]; config: { minDate?: Date; maxDate?: Date; disable?: unknown[]; enable?: unknown[] } } })._flatpickr;
  if (picker && el.classList.contains("flatpickr-input")) {
    const config = picker.config;
    if ((config.minDate && date < config.minDate) || (config.maxDate && date > config.maxDate) || config.disable?.length || config.enable?.length) return false;
    picker.setDate(date, true);
    el.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    const selected = picker.selectedDates[0];
    return !!selected && selected.getFullYear() === year && selected.getMonth() === month - 1 && selected.getDate() === day;
  }
  const jq = (window as Window & { jQuery?: (el: HTMLInputElement) => { datepicker: (command: string, value?: Date) => unknown } }).jQuery;
  if (jq && el.classList.contains("hasDatepicker")) {
    // Constrained jQuery calendars require manual selection; don't bypass disabled dates.
    const widget = jq(el);
    const options = widget.datepicker("option") as { minDate?: unknown; maxDate?: unknown; beforeShowDay?: unknown };
    if (options.minDate != null || options.maxDate != null || options.beforeShowDay) return false;
    widget.datepicker("setDate", date);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    const selected = widget.datepicker("getDate");
    return selected instanceof Date && selected.getFullYear() === year && selected.getMonth() === month - 1 && selected.getDate() === day;
  }
  return false;
}
