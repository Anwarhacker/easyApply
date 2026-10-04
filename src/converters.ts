import type { Control } from "./field-signals";
import { normalize } from "./matching";

// --- DATE CONVERSION ---

export interface ParsedDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];


function parseDateUnchecked(raw: string): ParsedDate | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();

  // YYYY-MM-DD or YYYY/MM/DD
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    return { year: parseInt(m[1], 10), month: parseInt(m[2], 10), day: parseInt(m[3], 10) };
  }

  // YYYY-MM (month only)
  m = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (m) {
    return { year: parseInt(m[1], 10), month: parseInt(m[2], 10), day: 1 };
  }

  // DD/MM/YYYY or DD-MM-YYYY (if day > 12 it's definitely DD/MM, else default to DD/MM for common non-US formats)
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const first = parseInt(m[1], 10);
    const second = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    // If first > 12, it must be day/month
    if (first > 12 && second <= 12) {
      return { year, month: second, day: first };
    }
    // If second > 12, it must be month/day
    if (second > 12 && first <= 12) {
      return { year, month: first, day: second };
    }
    // Default to day/month/year
    return { year, month: second, day: first };
  }

  // "Month YYYY" or "Mon YYYY" (e.g. "September 2024", "Sep 2024")
  const monthMatch = s.match(/^([a-zA-Z]+)[,\s]+(\d{4})$/);
  if (monthMatch) {
    const monthName = monthMatch[1].toLowerCase();
    const monthIndex = MONTH_NAMES.findIndex(
      (name) => name.toLowerCase().startsWith(monthName)
    );
    if (monthIndex !== -1) {
      return { year: parseInt(monthMatch[2], 10), month: monthIndex + 1, day: 1 };
    }
  }

  // Year only "YYYY"
  if (/^(19|20)\d{2}$/.test(s)) {
    return { year: parseInt(s, 10), month: 1, day: 1 };
  }

  const named = s.match(/^(\d{1,2})[ /.-]+([a-zA-Z]+)[ ,/.-]+(\d{4})$/);
  if (named) {
    const month = MONTH_NAMES.findIndex(n => n.toLowerCase() === named[2].toLowerCase() || n.slice(0, 3).toLowerCase() === named[2].toLowerCase());
    if (month >= 0) return { year: +named[3], month: month + 1, day: +named[1] };
  }
  return null;
}

export function parseDate(raw: string): ParsedDate | null {
  const parsed = parseDateUnchecked(raw?.replace(/\./g, "/"));
  if (!parsed) return null;
  const d = new Date(0);
  d.setUTCFullYear(parsed.year, parsed.month - 1, parsed.day);
  return d.getUTCFullYear() === parsed.year && d.getUTCMonth() === parsed.month - 1 && d.getUTCDate() === parsed.day ? parsed : null;
}

export function calculateAge(raw: string, today = new Date()): number | null {
  // Age requires a complete date, not an education-style year/month value.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const dob = parseDate(raw);
  if (!dob) return null;
  let age = today.getFullYear() - dob.year;
  if (today.getMonth() + 1 < dob.month || (today.getMonth() + 1 === dob.month && today.getDate() < dob.day)) age--;
  return age >= 0 && age <= 120 ? age : null;
}

export const isAgeHint = (h: string) => /^(?:current age|age(?: in years| years)?)$/.test(normalize(h));

/** Part labels only count in a DOB group, never arbitrary day/month/year fields. */
export function birthDatePart(el: Control, hints: string[]): "day" | "month" | "year" | null {
  const input = el as HTMLInputElement;
  const own = [input.name, input.id, input.autocomplete, input.placeholder, el.getAttribute?.("aria-label"), ...Array.from(input.labels ?? []).map(l => l.textContent ?? "")].filter(Boolean).map(h => normalize(h!));
  const context = hints.some(h => /\b(dob|bday|birth|birthday)\b/.test(normalize(h)));
  if (!context) return null;
  const parts = (["day", "month", "year"] as const).filter(part => own.some(h => h === part || h === ({day:"dd",month:"mm",year:"yyyy"}[part]) || new RegExp("^(?:dob|bday|birth|birthday|date of birth) " + part + "$|^" + part + " (?:of birth|dob|bday)$").test(h)));
  return parts.length === 1 ? parts[0] : null;
}

export function birthPartValue(parsed: ParsedDate, part: "day" | "month" | "year", options?: {text: string; value: string}[]): string {
  if (!options) return String(parsed[part]);
  const target = parsed[part];
  // Labels take precedence: August/value=7 is August, not July.
  const byLabel = options.filter(o => {
    const label = o.text.trim().toLowerCase();
    return /^\d+$/.test(label) ? +label === target : part === "month" && [MONTH_NAMES[target-1].toLowerCase(), MONTH_NAMES[target-1].slice(0,3).toLowerCase()].includes(label);
  });
  if (byLabel.length === 1) return byLabel[0].value;
  if (byLabel.length) return "";
  const zeroBased = part === "month" && options.filter(o => /^\d+$/.test(o.value) && +o.value >= 0 && +o.value <= 11).length === 12 && !options.some(o => o.value === "12");
  const matches = options.filter(o => /^\d+$/.test(o.value) && +o.value === target - (zeroBased ? 1 : 0));
  return matches.length === 1 ? matches[0].value : "";
}

export function formatDate(
  parsed: ParsedDate,
  format: "YYYY-MM-DD" | "YYYY-MM" | "MM/DD/YYYY" | "DD/MM/YYYY" | "Month YYYY" | "YYYY"
): string {
  const y = String(parsed.year);
  const mm = String(parsed.month).padStart(2, "0");
  const dd = String(parsed.day).padStart(2, "0");

  switch (format) {
    case "YYYY-MM-DD":
      return `${y}-${mm}-${dd}`;
    case "YYYY-MM":
      return `${y}-${mm}`;
    case "MM/DD/YYYY":
      return `${mm}/${dd}/${y}`;
    case "DD/MM/YYYY":
      return `${dd}/${mm}/${y}`;
    case "Month YYYY":
      return `${MONTH_NAMES[parsed.month - 1]} ${y}`;
    case "YYYY":
      return y;
  }
}

function isInput(el: unknown): el is HTMLInputElement {
  return typeof HTMLInputElement !== "undefined"
    ? el instanceof HTMLInputElement
    : typeof el === "object" && el !== null && "type" in el;
}

export function convertDateForControl(raw: string, el: Control, hints: string[]): string {
  const parsed = parseDate(raw);
  if (!parsed) return raw;

  // HTML5 Date input
  if (isInput(el) && el.type === "date") {
    return formatDate(parsed, "YYYY-MM-DD");
  }

  // HTML5 Month input
  if (isInput(el) && el.type === "month") {
    return formatDate(parsed, "YYYY-MM");
  }


  const allText = [
    (el as HTMLInputElement).placeholder || "",
    (el as HTMLInputElement).pattern || "",
    (el as HTMLInputElement).name || "",
    ...hints,
  ].join(" ").toLowerCase();

  const template = allText.match(/\b(?:yyyy[-/. ]mm[-/. ]dd|mm[-/. ]dd[-/. ]yyyy|dd[-/. ](?:mmmm|mmm|month|mon|mm)[-/. ]yyyy)\b/)?.[0];
  if (template) return template.replace(/yyyy|mmmm|month|mmm|mon|mm|dd/g, token => ({ yyyy: String(parsed.year), mm: String(parsed.month).padStart(2, "0"), dd: String(parsed.day).padStart(2, "0"), mon: MONTH_NAMES[parsed.month-1].slice(0,3), mmm: MONTH_NAMES[parsed.month-1].slice(0,3), mmmm: MONTH_NAMES[parsed.month-1], month: MONTH_NAMES[parsed.month-1] })[token]!);
  if (/\b(month yyyy|mon yyyy)\b/.test(allText)) {
    return formatDate(parsed, "Month YYYY");
  }
  // Year-only fields: graduation year, passing year, batch year, etc.
  if (
    /\b(year only|graduation year|passing year|batch year|year of passing|year of graduation)\b/.test(allText) ||
    /^(grad(uation)?|passing|batch|tenth|pre.?degree|education.?start).*year|year.*(grad|pass|batch)/i.test(allText) ||
    /^\d{4}$/.test((el as HTMLInputElement).placeholder || "")
  ) {
    return formatDate(parsed, "YYYY");
  }

  return raw;
}



// --- NOTICE PERIOD CONVERSION ---

export function parseNoticeDays(raw: string): number | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.toLowerCase().trim();

  if (/^immediate(?:ly| joiner)?$/.test(s)) {
    return 0;
  }

  // Weeks (e.g. "2 weeks", "4 weeks")
  const weekMatch = s.match(/^(\d+(?:\.\d+)?)\s*(?:weeks?|wks?)$/);
  if (weekMatch) {
    return Number(weekMatch[1]) * 7;
  }

  // Months (e.g. "1 month", "2 months", "3 months")
  const monthMatch = s.match(/^(\d+(?:\.\d+)?)\s*(?:months?|mos?)$/);
  if (monthMatch) {
    return Number(monthMatch[1]) * 30;
  }

  // Days (e.g. "15 days", "30 days", "45")
  const dayMatch = s.match(/^(\d+(?:\.\d+)?)\s*(?:days?)?$/);
  if (dayMatch) {
    return Number(dayMatch[1]);
  }

  return null;
}

export function noticeThresholdAnswer(value: string, hints: string[]): string | null {
  const question = hints.map(normalize).find(s => /\bnotice period\b.*\b(?:less than|under|within|at most|more than|over|at least)\b/.test(s));
  if (!question) return null;
  const threshold = question.match(/^(?:is )?(?:your )?notice period (less than|under|within|at most|more than|over|at least) (\d+) (days?|weeks?|months?)$/);
  if (!threshold) return "";
  // Do not turn ranges, dates, or "serving notice" into invented durations.
  if (!/^(?:immediate(?:ly)?|\d+(?:\.\d+)?(?:\s*(?:days?|weeks?|wks?|months?))?)$/i.test(value.trim())) return "";
  const duration = value.trim().match(/^(\d+(?:\.\d+)?)(?:\s*(days?|weeks?|wks?|months?))?$/i);
  const days = duration ? Number(duration[1]) * (/^w/i.test(duration[2] ?? "") ? 7 : /^m/i.test(duration[2] ?? "") ? 30 : 1) : 0;
  const limit = parseNoticeDays(`${threshold[2]} ${threshold[3]}`);
  if (days === null || limit === null) return "";
  const op = threshold[1];
  const yes = ["less than", "under"].includes(op) ? days < limit
    : ["within", "at most"].includes(op) ? days <= limit
    : ["more than", "over"].includes(op) ? days > limit : days >= limit;
  return yes ? "Yes" : "No";
}

export function matchNoticeOption<T extends { text: string; value: string }>(
  rawNotice: string,
  options: T[]
): T | null {
  const exactText = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const exact = options.filter(o => exactText(o.text) === exactText(rawNotice));
  if (exact.length) return exact.length === 1 ? exact[0] : null;
  const targetDays = parseNoticeDays(rawNotice);
  if (targetDays === null) return null;
  const durations: T[] = [], ranges: T[] = [];
  for (const opt of options) {
    const text = opt.text.toLowerCase().trim();
    const equivalent = text.match(/^(.+?)\s*\((.+?)\)$/);
    const days = equivalent && parseNoticeDays(equivalent[1]) === parseNoticeDays(equivalent[2])
      ? parseNoticeDays(equivalent[1]) : parseNoticeDays(text);
    if (days === targetDays) { durations.push(opt); continue; }
    const range = text.match(/^(\d+)\s*(?:-|–|to)\s*(\d+)\s*(days?|weeks?|months?)$/);
    if (range) {
      const low = parseNoticeDays(`${range[1]} ${range[3]}`)!;
      const high = parseNoticeDays(`${range[2]} ${range[3]}`)!;
      if (targetDays >= low && targetDays <= high) ranges.push(opt);
      continue;
    }
    const bound = text.match(/^(less than|under|within|up to|at most|more than|over|at least) (\d+\s*(?:days?|weeks?|months?))$/);
    const suffix = text.match(/^(\d+\s*(?:days?|weeks?|months?)) (or less|or more)$/);
    const limit = parseNoticeDays(bound?.[2] ?? suffix?.[1] ?? "");
    if (limit === null) continue;
    const op = bound?.[1] ?? suffix?.[2];
    if (op === "less than" || op === "under" ? targetDays < limit
      : op === "more than" || op === "over" ? targetDays > limit
      : op === "at least" || op === "or more" ? targetDays >= limit : targetDays <= limit) ranges.push(opt);
  }
  const candidates = durations.length ? durations : ranges;
  return candidates.length === 1 ? candidates[0] : null;
}


// --- SALARY CONVERSION ---

export interface ParsedSalary {
  amount: number; // in base units, e.g. 1,200,000
  isAnnual: boolean;
  currency: string;
  isLakhs: boolean;
}

export function parseSalary(raw: string): ParsedSalary | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();

  // Detect Lakhs (e.g. "12 LPA", "8.5 Lakhs", "12l")
  const lpaMatch = s.match(/([\d,]+(?:\.\d+)?)\s*(?:lpa|lakh|lac|l\b)/i);
  if (lpaMatch) {
    const val = parseFloat(lpaMatch[1].replace(/,/g, ""));
    return {
      amount: Math.round(val * 100000),
      isAnnual: true,
      currency: "INR",
      isLakhs: true,
    };
  }

  // Detect Thousands (e.g. "120k", "120K")
  const kMatch = s.match(/([\d,]+(?:\.\d+)?)\s*k\b/i);
  if (kMatch) {
    const val = parseFloat(kMatch[1].replace(/,/g, ""));
    return {
      amount: Math.round(val * 1000),
      isAnnual: true,
      currency: s.includes("$") ? "USD" : "INR",
      isLakhs: false,
    };
  }

  // Raw numbers with optional currency prefix/commas
  const cleanNumber = s.replace(/[^0-9.]/g, "");
  if (!cleanNumber || isNaN(Number(cleanNumber))) return null;

  const num = parseFloat(cleanNumber);
  const isMonthly = /month|monthly|\/mo\b/i.test(s);
  const currency = s.includes("$") ? "USD" : s.includes("€") ? "EUR" : "INR";

  // If number <= 100 and no other context, might be LPA in Indian context if INR
  if (num <= 100 && !isMonthly && currency === "INR") {
    return {
      amount: Math.round(num * 100000),
      isAnnual: true,
      currency,
      isLakhs: true,
    };
  }

  return {
    amount: isMonthly ? num * 12 : num,
    isAnnual: !isMonthly,
    currency,
    isLakhs: false,
  };
}

export function convertSalaryForControl(raw: string, el: Control, hints: string[]): string {
  const parsed = parseSalary(raw);
  if (!parsed) return raw;

  const allHints = [
    (el as HTMLInputElement).placeholder || "",
    (el as HTMLInputElement).name || "",
    ...hints,
  ].join(" ").toLowerCase();

  const expectsMonthly = /\b(monthly|per month|\/mo|per month in)\b/.test(allHints);
  const expectsLakhs = /\b(in lakhs?|in lpa|lakhs?|lpa)\b/.test(allHints);
  const expectsNumericOnly =
    isInput(el) &&
    (el.type === "number" || el.inputMode === "numeric");

  let targetAmount = parsed.amount;
  if (expectsMonthly) {
    targetAmount = Math.round(parsed.amount / 12);
  }

  if (expectsLakhs) {
    const inLakhs = +(targetAmount / 100000).toFixed(2);
    return String(inLakhs);
  }

  if (expectsNumericOnly) {
    return String(Math.round(targetAmount));
  }

  return String(Math.round(targetAmount));
}


// --- MAIN CONVERTER ENTRY POINT ---

export function smartConvert(
  field: string | null,
  value: string,
  el: Control,
  hints: string[],
  allValues?: Record<string, string>
): string {
  // Titles are explicit profile data; never invent one from gender or a default.
  if (field === "salutation") {
    return value;
  }

  if (field === "countryCode") {
    const options = el instanceof HTMLSelectElement ? [...el.options].flatMap(o => callingCodes(o.text + " " + o.value)) : [];
    return splitInternationalPhone(allValues?.mobile ?? value, options)?.callingCode ?? "";
  }
  if (field === "mobile" && value) {
    const split = splitPhoneControl(value, el);
    if (split) return split.nationalNumber;
  }

  if (!value || !field) return value;
  if (field === "noticePeriod") {
    const answer = noticeThresholdAnswer(value, hints);
    if (answer !== null) return answer;
  }

  if (field === "dob") {
    if (hints.some(isAgeHint)) return String(calculateAge(value) ?? "");
    const parsed = parseDate(value);
    if (!parsed) return "";
    const part = birthDatePart(el, hints);
    if (part) return birthPartValue(parsed, part, typeof HTMLSelectElement !== "undefined" && el instanceof HTMLSelectElement ? [...el.options].filter(o => !o.disabled).map(o => ({text: o.text, value: o.value})) : undefined);
  }

  // Date fields
  if (
    field === "dob" ||
    field === "graduationYear" ||
    field === "tenthYear" ||
    field === "preDegreeYear" ||
    field === "educationStartYear" ||
    field === "joiningDate" ||
    (isInput(el) && ["date", "month"].includes(el.type))
  ) {
    return convertDateForControl(value, el, hints);
  }

  // Salary fields
  if (
    field === "expectedSalary" ||
    field === "currentSalary" ||
    hints.some((h) => /\b(salary|ctc|compensation)\b/i.test(normalize(h)))
  ) {
    return convertSalaryForControl(value, el, hints);
  }

  return value;
}

/** Extract explicit calling prefixes, never digits from country names or ISO codes. */
export function callingCodes(text: string): string[] {
  return [...text.matchAll(/\+(\d{1,3})(?!\d)/g)].map(m => "+" + m[1]);
}
export function splitInternationalPhone(raw: string, availableCodes: string[]) {
  const cleaned = raw.trim().replace(/[\s().-]/g, "").replace(/^00/, "+");
  if (!/^\+[1-9]\d{6,14}$/.test(cleaned)) return null;
  const matches = [...new Set(availableCodes)].filter(code => /^\+[1-9]\d{0,2}$/.test(code) && cleaned.startsWith(code)).sort((a,b) => b.length-a.length);
  const callingCode = matches[0];
  if (!callingCode || cleaned.length - callingCode.length < 4) return null;
  return { callingCode, nationalNumber: cleaned.slice(callingCode.length) };
}
export function splitPhoneControl(raw: string, control: Control) {
  let parent = control.parentElement;
  for (let depth = 0; parent && depth < 3; depth++, parent = parent.parentElement) {
    if (parent.matches("body,form")) break;
    const selectors = [...parent.querySelectorAll("select")].filter(select => [...select.options].some(o => callingCodes(o.text + " " + o.value).length));
    if (selectors.length > 1 || parent.querySelectorAll('input[type="tel"]').length > 1) return null;
    if (selectors.length !== 1) continue;
    const selector = selectors[0];
    if (selector.disabled) return null;
    const options = [...selector.options].filter(o => !o.disabled);
    const parsed = splitInternationalPhone(raw, options.flatMap(o => callingCodes(o.text + " " + o.value)));
    if (!parsed) return null;
    const matching = options.filter(o => callingCodes(o.text + " " + o.value).includes(parsed.callingCode));
    const option = matching.find(o => o.selected) ?? (matching.length === 1 ? matching[0] : undefined);
    if (!option) return null;
    return { ...parsed, selector, optionValue: option.value, optionIndex: option.index };
  }
  return null;
}
