import { normalize } from "./matching";
import { isReactSelect } from "./react-select";
import { matchNoticeOption } from "./converters";
import { setNativeSelect } from "./native-select";
import { readDropdownState, verifyDropdownSelection } from "./dropdown-state";

export interface OptionCandidate {
  value: string;
  text: string;
  element?: HTMLElement | HTMLOptionElement;
  index?: number;
}

export const COUNTRY_MAP: Record<string, string> = {
  india: "in",
  "united states": "us",
  usa: "us",
  "united kingdom": "gb",
  uk: "gb",
  canada: "ca",
  australia: "au",
  germany: "de",
  france: "fr",
  singapore: "sg",
  "united arab emirates": "ae",
  uae: "ae",
  japan: "jp",
  china: "cn",
  brazil: "br",
  netherlands: "nl",
  spain: "es",
  italy: "it",
  russia: "ru",
  "south africa": "za",
};

export const STATE_MAP: Record<string, string> = {
  // India
  andhra: "ap", "andhra pradesh": "ap", ap: "ap",
  assam: "as", as: "as",
  bihar: "br",
  delhi: "dl", "new delhi": "dl", dl: "dl",
  gujarat: "gj", gj: "gj",
  haryana: "hr", hr: "hr",
  karnataka: "ka", ka: "ka",
  kerala: "kl", kl: "kl",
  maharashtra: "mh", mh: "mh",
  punjab: "pb", pb: "pb",
  rajasthan: "rj", rj: "rj",
  "tamil nadu": "tn", tn: "tn",
  telangana: "tg", tg: "tg",
  "uttar pradesh": "up", up: "up",
  "west bengal": "wb", wb: "wb",
  // USA
  california: "ca", ca: "ca",
  "new york": "ny", ny: "ny",
  texas: "tx", tx: "tx",
  washington: "wa", wa: "wa",
  illinois: "il", il: "il",
  florida: "fl", fl: "fl",
  massachusetts: "ma", ma: "ma",
  georgia: "ga", ga: "ga",
  virginia: "va", va: "va",
};

export const CITY_MAP: Record<string, string[]> = {
  bengaluru: ["bengaluru", "bangalore"],
  bangalore: ["bengaluru", "bangalore"],
  mumbai: ["mumbai", "bombay"],
  bombay: ["mumbai", "bombay"],
  chennai: ["chennai", "madras"],
  madras: ["chennai", "madras"],
  kolkata: ["kolkata", "calcutta"],
  calcutta: ["kolkata", "calcutta"],
  gurugram: ["gurugram", "gurgaon"],
  gurgaon: ["gurugram", "gurgaon"],
  kochi: ["kochi", "cochin"],
  cochin: ["kochi", "cochin"],
  pune: ["pune", "poona"],
  poona: ["pune", "poona"],
};

export const GENDER_MAP: Record<string, string[]> = {
  male: ["male", "m", "man"],
  female: ["female", "f", "woman"],
  other: ["other", "o", "non-binary", "non binary", "prefer not to say"],
};

export const SALUTATION_MAP: Record<string, string[]> = {
  mr: ["mr", "mr.", "mister"],
  mrs: ["mrs", "mrs."],
  ms: ["ms", "ms.", "miss"],
  dr: ["dr", "dr.", "doctor"],
  prof: ["prof", "prof.", "professor"],
};

export const BOOLEAN_MAP: Record<string, string[]> = {
  yes: ["yes", "y", "1", "true", "willing", "authorized", "eligible"],
  no: ["no", "n", "0", "false", "not willing", "unauthorized", "ineligible"],
};

export const WORK_MODE_MAP: Record<string, string[]> = {
  remote: ["remote", "work from home", "wfh", "virtual", "home", "telecommute", "100 remote"],
  onsite: ["onsite", "on site", "work from office", "wfo", "in office", "office", "workplace", "on premise"],
  hybrid: ["hybrid", "flexible", "hybrid work", "partially remote", "flexible working"],
};

export const STUDY_TYPE_MAP: Record<string, string[]> = {
  fulltime: ["full time", "fulltime", "regular", "regular full time", "full time course", "regular fulltime"],
  parttime: ["part time", "parttime", "distance", "correspondence", "distance education", "online", "part time course"],
};

export const EMPLOYMENT_STATUS_MAP: Record<string, string[]> = {
  fresher: ["fresher", "student", "recent graduate", "entry level", "entrylevel", "graduate", "0 1 year", "no experience", "0 years"],
  experienced: ["experienced", "working professional", "employed", "currently employed", "professional", "experienced professional"],
};

export const PRE_DEGREE_MAP: Record<string, string[]> = {
  "12th": ["12th", "class 12", "class xii", "hsc", "puc", "intermediate", "higher secondary", "senior secondary", "10 2", "plus two"],
  diploma: ["diploma", "polytechnic", "3 year diploma", "three year diploma"],
};

function matchCategory<T extends { text: string; value: string }>(answer: string, options: T[], groups: Record<string, string[]>): T | null {
  const categories = (text: string) => {
    const parts = [text, ...text.split(/[()/]/)].map(normalize).filter(Boolean);
    return Object.entries(groups).filter(([, aliases]) => aliases.some(a => parts.includes(normalize(a)))).map(([key]) => key);
  };
  const target = categories(answer);
  if (target.length !== 1) return null;
  const matches = options.filter(option => {
    const keys = categories(option.text);
    return keys.length === 1 && keys[0] === target[0];
  });
  return matches.length === 1 ? matches[0] : null;
}

export function isDropdownControl(el: Element): boolean {
  if (typeof HTMLSelectElement !== "undefined" && el instanceof HTMLSelectElement) return true;
  const tag = (el.tagName || "").toLowerCase();
  if (
    tag === "lyte-dropdown" ||
    tag === "lyte-select" ||
    tag === "crm-select" ||
    tag === "crm-dropdown" ||
    tag === "crm-multi-select" ||
    tag === "crux-select" ||
    tag === "crux-dropdown" ||
    tag === "crux-select-component" ||
    tag === "crux-dropdown-component" ||
    tag === "mat-select" ||
    tag === "p-dropdown" ||
    tag === "el-select" ||
    tag === "v-select" ||
    tag === "ant-select" ||
    tag === "lightning-combobox" ||
    tag === "lightning-base-combobox"
  ) {
    return true;
  }
  const className = typeof el.className === "string" ? el.className : el.getAttribute?.("class") || "";
  if (
    /\b(ant-select|select2|select2-container|chosen-container)\b/.test(className) ||
    /select__control|Select-control/.test(className)
  ) {
    return true;
  }
  if (
    (el.hasAttribute?.("data-zcui") && /select|dropdown/i.test(el.getAttribute("data-zcui") || "")) ||
    (el.hasAttribute?.("data-component") && /select|dropdown/i.test(el.getAttribute("data-component") || "")) ||
    (el.hasAttribute?.("data-field-type") && /select|dropdown/i.test(el.getAttribute("data-field-type") || "")) ||
    (el.hasAttribute?.("data-ui") && /select|dropdown/i.test(el.getAttribute("data-ui") || "")) ||
    (el.hasAttribute?.("data-control") && /select|dropdown/i.test(el.getAttribute("data-control") || "")) ||
    el.hasAttribute?.("data-radix-select-trigger") ||
    (el.hasAttribute?.("data-automation-id") && /select|dropdown/i.test(el.getAttribute("data-automation-id") || "")) ||
    (el.hasAttribute?.("data-uxi-element-id") && /select|dropdown/i.test(el.getAttribute("data-uxi-element-id") || ""))
  ) {
    return true;
  }
  const isInput = typeof HTMLInputElement !== "undefined" && el instanceof HTMLInputElement;
  if (isInput && (isReactSelect(el) || el.getAttribute("role") === "combobox" ||
    ["list", "both", "inline"].includes(el.getAttribute("aria-autocomplete") || "") ||
    !!el.closest("lyte-dropdown,lyte-select,crm-select,crm-dropdown,crux-select,crux-dropdown,mat-select,p-dropdown,el-select,v-select,ant-select,[data-component*='select'],[data-component*='dropdown']"))) return true;
  const isTextArea = typeof HTMLTextAreaElement !== "undefined" && el instanceof HTMLTextAreaElement;
  const role = el.getAttribute?.("role");
  if ((role === "combobox" || role === "listbox") && !isInput && !isTextArea) {
    return true;
  }
  if (
    el.getAttribute?.("aria-haspopup") === "listbox" &&
    !isInput &&
    !isTextArea
  ) {
    return true;
  }
  return false;
}

export function isBlankDropdown(valStr: string): boolean {
  if (!valStr || !valStr.trim()) return true;
  const s = valStr.trim().toLowerCase();
  return (
    /^(select|choose|please select|please choose|none|not specified|-- select --|- select -)\b/i.test(s) ||
    s.startsWith("--") ||
    s.startsWith("-select") ||
    s === "0" ||
    s === "-1" ||
    s === "select..." ||
    s.includes("select one") ||
    s.includes("select an option") ||
    s.includes("choose an option") ||
    s.includes("select country") ||
    s.includes("select state") ||
    s.includes("select city") ||
    s.includes("select salutation") ||
    s.includes("select gender") ||
    s.includes("select country code")
  );
}

export function matchExperienceOption<T extends { value: string; text: string }>(
  targetVal: string,
  options: T[]
): T | null {
  const norm = normalize(targetVal);
  const numericVal = parseFloat(targetVal.replace(/[^0-9.]/g, ""));
  const isFresher =
    norm === "fresher" ||
    norm === "0" ||
    norm === "0 years" ||
    norm === "0 year" ||
    norm === "entry level" ||
    norm === "no experience" ||
    norm === "student" ||
    (!isNaN(numericVal) && numericVal === 0);

  if (isFresher) {
    const matches = options.filter((o) => {
      const raw = `${o.text} ${o.value}`.toLowerCase();
      return (
        raw.includes("fresher") ||
        raw.includes("entry level") ||
        raw.includes("no experience") ||
        raw.includes("student") ||
        /\b0\s*(?:[-–—]|to)\s*[12]\b/.test(raw) ||
        /\b(0|zero)\s*(?:years?|yrs?)\b/.test(raw) ||
        raw.trim() === "0" ||
        raw.includes("< 1") ||
        raw.includes("<1") ||
        raw.includes("less than 1") ||
        raw.includes("below 1")
      );
    });
    if (matches.length === 1) return matches[0];
  }

  const numMatch = targetVal.match(/(\d+(?:\.\d+)?)/);
  if (numMatch) {
    const years = parseFloat(numMatch[1]);
    // First pass: exact range containment (e.g. "2-3 Years", "1 to 3 years")
    const rangeMatches: T[] = [];
    for (const opt of options) {
      const raw = `${opt.text} ${opt.value}`.toLowerCase();
      const range = raw.match(/(\d+(?:\.\d+)?)\s*(?:[-–—]|to)\s*(\d+(?:\.\d+)?)/);
      if (range) {
        const min = parseFloat(range[1]);
        const max = parseFloat(range[2]);
        if (years >= min && years <= max) rangeMatches.push(opt);
      }
    }
    if (rangeMatches.length) return rangeMatches.length === 1 ? rangeMatches[0] : null;
    // Second pass: "X+ years" style (e.g. "5+ Years", "10 and above")
    const plusMatches: T[] = [];
    for (const opt of options) {
      const raw = `${opt.text} ${opt.value}`.toLowerCase();
      const plusMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:\+|plus|more|over|above|and above)/);
      if (plusMatch) {
        const min = parseFloat(plusMatch[1]);
        if (years >= min) plusMatches.push(opt);
      }
    }
    if (plusMatches.length) return plusMatches.length === 1 ? plusMatches[0] : null;
    // Third pass: exact single year match (e.g. "3 Years")
    const singleMatches: T[] = [];
    for (const opt of options) {
      const raw = `${opt.text} ${opt.value}`.toLowerCase();
      const singleMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/);
      if (singleMatch && parseFloat(singleMatch[1]) === years) {
        singleMatches.push(opt);
      }
    }
    if (singleMatches.length) return singleMatches.length === 1 ? singleMatches[0] : null;
  }
  return null;
}

export function matchSalaryOption<T extends { value: string; text: string }>(
  targetVal: string,
  options: T[]
): T | null {
  let lpa: number | null = null;
  const lpaMatch = targetVal.match(/([\d,.]+)\s*(?:lpa|lakh|lac)/i);
  if (lpaMatch) {
    lpa = parseFloat(lpaMatch[1].replace(/,/g, ""));
  } else {
    // Strip commas first (handles Indian format: 2,50,000 → 250000)
    const rawNum = targetVal.replace(/,/g, "").replace(/[^0-9.]/g, "");
    if (rawNum) {
      const val = parseFloat(rawNum);
      lpa = val > 1000 ? val / 100000 : val;
    }
  }
  if (lpa === null || isNaN(lpa)) return null;

  const matches: T[] = [];
  for (const opt of options) {
    // Normalize option text: strip commas for Indian notation
    const rawOpt = `${opt.text} ${opt.value}`.toLowerCase().replace(/,/g, "");
    const range = rawOpt.match(/(\d+(?:\.\d+)?)\s*(?:[-–—]|to)\s*(\d+(?:\.\d+)?)/);
    if (range) {
      let min = parseFloat(range[1]);
      let max = parseFloat(range[2]);
      if (min > 1000) min = min / 100000;
      if (max > 1000) max = max / 100000;
      if (lpa >= min && lpa <= max) matches.push(opt);
    }
    const under = rawOpt.match(/(?:under|less than|below|<)\s*(\d+(?:\.\d+)?)/);
    if (under) {
      let max = parseFloat(under[1]);
      if (max > 1000) max = max / 100000;
      if (lpa < max) matches.push(opt);
    }
    const plus = rawOpt.match(/(\d+(?:\.\d+)?)\s*(?:\+|plus|more|over|above|and above)/);
    if (plus) {
      let min = parseFloat(plus[1]);
      if (min > 1000) min = min / 100000;
      if (lpa >= min) matches.push(opt);
    }
  }
  return matches.length === 1 ? matches[0] : null;
}

export function matchSelectOption<T extends { value: string; text: string }>(
  targetValue: string,
  options: T[],
  field?: string
): T | null {
  if (!targetValue || !options.length) return null;
  const normTarget = normalize(targetValue);
  if (!normTarget) return null;

  // Filter out placeholder options based on visible text
  const isZeroNumericField = field === "backlogs" || field === "totalExperience" || field === "educationGap";
  const realOptions = options.filter((o) => {
    const t = o.text.trim();
    if (isZeroNumericField && (t === "0" || o.value.trim() === "0")) return true;
    return t && !isBlankDropdown(t);
  });
  const searchPool = realOptions;
  if (!searchPool.length) return null;
  if (field === "noticePeriod" || field === "availability") return matchNoticeOption(targetValue, realOptions);

  // 1. Exact match on normalized value or text
  const textMatches = searchPool.filter(o => normalize(o.text) === normTarget);
  if (textMatches.length) return textMatches.length === 1 ? textMatches[0] : null;
  const exact = searchPool.filter((o) => {
    const v = normalize(o.value);
    const t = normalize(o.text);
    return v === normTarget || t === normTarget;
  });
  if (exact.length) return exact.length === 1 ? exact[0] : null;

  // 2. Field-specific semantic matching

  if (
    field === "gender" ||
    (!field && (normTarget === "male" || normTarget === "female" || normTarget === "m" || normTarget === "f"))
  ) {
    return matchCategory(targetValue, searchPool, {
      male: ["male", "m", "man"], female: ["female", "f", "woman"],
      other: ["other", "o"], nonbinary: ["non-binary", "non binary"],
      decline: ["prefer not to say", "prefer not to disclose", "decline to answer"],
    });
  }

  if (field === "salutation") {
    const cleanSal = normTarget.replace(/\./g, "");
    const aliases = SALUTATION_MAP[cleanSal] || [normTarget];
    const match = searchPool.find((o) => {
      const v = normalize(o.value).replace(/\./g, "");
      const t = normalize(o.text).replace(/\./g, "");
      return aliases.some((a) => a.replace(/\./g, "") === v || a.replace(/\./g, "") === t);
    });
    if (match) return match;
  }

  if (field === "country" || field === "nationality") {
    const code = COUNTRY_MAP[normTarget] || normTarget;
    const aliases = [normTarget, ...Object.keys(COUNTRY_MAP).filter(key => COUNTRY_MAP[key] === code)];
    const matches = searchPool.filter(o => normalize(o.value) === code || aliases.some(alias =>
      ` ${normalize(o.text)} `.includes(` ${alias} `)));
    return matches.length === 1 ? matches[0] : null;
  }

  if (field === "state") {
    const code = STATE_MAP[normTarget];
    const matches = searchPool.filter(o => {
      const v = normalize(o.value), t = normalize(o.text);
      return (code && (v === code || t === code)) || t === normTarget;
    });
    return matches.length === 1 ? matches[0] : null;
  }

  if (field === "city" || field === "preferredLocation") {
    const variants = CITY_MAP[normTarget] || [normTarget];
    const matches = searchPool.filter(o => variants.some(variant =>
      normalize(o.value) === variant || ` ${normalize(o.text)} `.includes(` ${variant} `)));
    return matches.length === 1 ? matches[0] : null;
  }

  if (field === "mobile" || field === "countryCode" || targetValue.startsWith("+")) {
    // Use original targetValue (normalize strips "+") to get clean numeric code
    const cleanCode = targetValue.replace(/[^0-9]/g, "");
    if (cleanCode) {
      const match = searchPool.find((o) => {
        const v = o.value.replace(/[^0-9]/g, "");
        const t = o.text.replace(/[^0-9]/g, "");
        // Match exact digits OR "+91" pattern in option text/value
        return (
          v === cleanCode ||
          t === cleanCode ||
          new RegExp(`\\+${cleanCode}(?!\\d)`).test(o.text) ||
          new RegExp(`\\+${cleanCode}(?!\\d)`).test(o.value) ||
          // Also match ISO code (IN, US) via country map (e.g. "+91" → "in" → "IN")
          (normTarget.length > 0 && COUNTRY_MAP[normTarget] === normalize(o.value))
        );
      });
      if (match) return match;
    }
  }


  if (field === "totalExperience" || field === "experience") {
    return matchExperienceOption(targetValue, searchPool);
  }

  if (field === "expectedSalary" || field === "currentSalary") {
    return matchSalaryOption(targetValue, searchPool);
  }

  if (field === "workMode") {
    return matchCategory(targetValue, searchPool, WORK_MODE_MAP);
  }

  if (field === "studyType") {
    return matchCategory(targetValue, searchPool, STUDY_TYPE_MAP);
  }

  if (field === "employmentStatus") {
    return matchCategory(targetValue, searchPool, EMPLOYMENT_STATUS_MAP);
  }

  if (field === "preDegreeType") {
    return matchCategory(targetValue, searchPool, PRE_DEGREE_MAP);
  }

  if (field === "degree") {
    const DEGREE_PATTERNS: [RegExp, RegExp][] = [
      [
        /\b(b\s*e|b\s*tech|bachelor of (?:engineering|technology))\b/i,
        /\b(b\s*e|b\s*tech|bachelor of (?:engineering|technology))\b/i,
      ],
      [
        /\b(b\s*c\s*a|bachelor of computer applications?)\b/i,
        /\b(b\s*c\s*a|bachelor of computer applications?)\b/i,
      ],
      [
        /\b(b\s*s\s*c|b\s*s|bachelor of science)\b/i,
        /\b(b\s*s\s*c|b\s*s|bachelor of science)\b/i,
      ],
      [
        /\b(b\s*c\s*o\s*m|bachelor of commerce)\b/i,
        /\b(b\s*c\s*o\s*m|bachelor of commerce)\b/i,
      ],
      [
        /\b(b\s*b\s*a|bachelor of business administration)\b/i,
        /\b(b\s*b\s*a|bachelor of business administration)\b/i,
      ],
      [
        /\b(b\s*a|bachelor of arts)\b/i,
        /\b(b\s*a|bachelor of arts)\b/i,
      ],
      [
        /\b(m\s*tech|m\s*e|master of (?:engineering|technology))\b/i,
        /\b(m\s*tech|m\s*e|master of (?:engineering|technology))\b/i,
      ],
      [
        /\b(m\s*s\s*c|m\s*s|master of science)\b/i,
        /\b(m\s*s\s*c|m\s*s|master of science)\b/i,
      ],
      [
        /\b(m\s*c\s*a|master of computer applications?)\b/i,
        /\b(m\s*c\s*a|master of computer applications?)\b/i,
      ],
      [
        /\b(m\s*b\s*a|master of business administration)\b/i,
        /\b(m\s*b\s*a|master of business administration)\b/i,
      ],
      [
        /\b(m\s*a|master of arts)\b/i,
        /\b(m\s*a|master of arts)\b/i,
      ],
      [
        /\b(ph\s*d|doctor of philosophy|doctorate)\b/i,
        /\b(ph\s*d|doctor of philosophy|doctorate)\b/i,
      ],
      [
        /\b(diploma|polytechnic)\b/i,
        /\b(diploma|polytechnic)\b/i,
      ],
    ];

    // Priority 1: Specific degree pattern match
    for (const [targetPat, optPat] of DEGREE_PATTERNS) {
      if (targetPat.test(normTarget)) {
        const matches = searchPool.filter((o) => optPat.test(normalize(o.text + " " + o.value)));
        if (matches.length) return matches.length === 1 ? matches[0] : null;
      }
    }

    // Priority 2: Degree level fallback (e.g. Bachelor-level -> "Bachelor's Degree", Master-level -> "Master's Degree")
    const isBachelor = /\b(b\s*e|b\s*tech|b\s*c\s*a|b\s*s\s*c|b\s*s|b\s*c\s*o\s*m|b\s*b\s*a|b\s*a|bachelor|undergraduate)\b/i.test(normTarget);
    const isMaster = /\b(m\s*tech|m\s*e|m\s*s\s*c|m\s*s|m\s*c\s*a|m\s*b\s*a|m\s*a|master|postgraduate)\b/i.test(normTarget);
    const isDoctorate = /\b(ph\s*d|doctorate|doctoral)\b/i.test(normTarget);
    const isDiploma = /\b(diploma|polytechnic)\b/i.test(normTarget);

    if (isBachelor) {
      const matches = searchPool.filter((o) => {
        const combined = normalize(o.text + " " + o.value);
        return /\b(bachelor(?: s)?|undergraduate|graduation)\b/i.test(combined);
      });
      if (matches.length) return matches.length === 1 ? matches[0] : null;
    } else if (isMaster) {
      const matches = searchPool.filter((o) => {
        const combined = normalize(o.text + " " + o.value);
        return /\b(master(?: s)?|postgraduate|post graduation)\b/i.test(combined);
      });
      if (matches.length) return matches.length === 1 ? matches[0] : null;
    } else if (isDoctorate) {
      const match = searchPool.find((o) => {
        const combined = normalize(o.text + " " + o.value);
        return /\b(doctorate|doctoral|ph\s*d)\b/i.test(combined);
      });
      if (match) return match;
    } else if (isDiploma) {
      const match = searchPool.find((o) => {
        const combined = normalize(o.text + " " + o.value);
        return /\b(diploma|polytechnic)\b/i.test(combined);
      });
      if (match) return match;
    }
  }

  if (field === "backlogs") {
    const isZeroOrNo =
      normTarget === "0" ||
      normTarget === "no" ||
      normTarget === "none" ||
      normTarget === "nil" ||
      normTarget === "zero" ||
      normTarget === "false";

    if (isZeroOrNo) {
      // 1. Exact "0", "None", "No Backlogs", "Nil", "Zero"
      const match = searchPool.find((o) => {
        const str = normalize(o.text + " " + o.value);
        return (
          str === "0" ||
          o.text.trim() === "0" ||
          o.value.trim() === "0" ||
          /\b(none|nil|zero|no backlogs?|zero backlogs?|without backlogs?)\b/.test(str)
        );
      });
      if (match) return match;

      // 2. Boolean "No" / "False" option
      const boolMatch = searchPool.find((o) => {
        const str = normalize(o.text + " " + o.value);
        return /\b(no|false)\b/.test(str) && !/\b(yes|true)\b/.test(str);
      });
      if (boolMatch) return boolMatch;
    } else {
      const backlogNum = parseInt(normTarget, 10);
      if (!isNaN(backlogNum) && backlogNum > 0) {
        // 1. Exact numeric count
        const exactMatch = searchPool.find((o) => {
          const str = normalize(o.text + " " + o.value);
          return (
            str === String(backlogNum) ||
            new RegExp(`\\b${backlogNum}\\b`).test(str)
          );
        });
        if (exactMatch) return exactMatch;

        // 2. Numeric range or "X+"
        const rangeMatch = searchPool.find((o) => {
          const str = normalize(o.text + " " + o.value);
          const range = str.match(/(\d+)\s*(?:[-–—]|to)\s*(\d+)/);
          if (range) {
            const min = parseInt(range[1], 10);
            const max = parseInt(range[2], 10);
            if (backlogNum >= min && backlogNum <= max) return true;
          }
          const plus = str.match(/(\d+)\s*(?:\+|plus|more|or more)/);
          if (plus) {
            const min = parseInt(plus[1], 10);
            if (backlogNum >= min) return true;
          }
          return false;
        });
        if (rangeMatch) return rangeMatch;

        // 3. Boolean Yes/No style question: having active backlogs matches Yes / Active
        const affirmativeMatch = searchPool.find((o) => {
          const str = normalize(o.text + " " + o.value);
          return (
            /\b(yes|true|have backlogs?|active backlogs?|has backlogs?)\b/.test(str) &&
            !/\b(no|false|none|nil|zero)\b/.test(str)
          );
        });
        if (affirmativeMatch) return affirmativeMatch;
      } else if (normTarget === "yes" || normTarget === "true") {
        const affirmativeMatch = searchPool.find((o) => {
          const str = normalize(o.text + " " + o.value);
          return (
            /\b(yes|true|have backlogs?|active backlogs?|has backlogs?)\b/.test(str) &&
            !/\b(no|false|none|nil|zero)\b/.test(str)
          );
        });
        if (affirmativeMatch) return affirmativeMatch;
      }
    }
  }

  if (
    field === "graduationYear" ||
    field === "tenthYear" ||
    field === "preDegreeYear" ||
    field === "educationStartYear" ||
    /^(19|20)\d{2}$/.test(normTarget)
  ) {
    const yrMatch = normTarget.match(/\b((19|20)\d{2})\b/);
    if (yrMatch) {
      const yr = yrMatch[1];
      const yrNum = parseInt(yr, 10);
      // Try exact year boundary match first (e.g. "2024" in "2024-2025")
      let match = searchPool.find((o) => {
        const str = o.value + " " + o.text;
        return new RegExp(`\\b${yr}\\b`).test(str);
      });
      if (match) return match;
      // Try shortened academic year range: "2020-21" when target is "2020"
      match = searchPool.find((o) => {
        const str = o.value + " " + o.text;
        // Matches "2020-21", "2020-2021", "20-21"
        return new RegExp(`\\b${yr}\\s*[-–]\\s*(?:\\d{2}|${yrNum + 1})`).test(str) ||
          new RegExp(`\\b${String(yrNum - 1)}\\s*[-–]\\s*(?:\\d{2}|${yr})`).test(str);
      });
      if (match) return match;
      // Try "Batch 2024", "2024 Passed Out", "Class of 2024" style
      match = searchPool.find((o) => {
        const str = (o.value + " " + o.text).toLowerCase();
        return str.includes(yr) && (
          str.includes("batch") || str.includes("pass") || str.includes("class") || str.includes("graduate")
        );
      });
      if (match) return match;
    }
  }

  if (["yes", "no", "true", "false", "1", "0"].includes(normTarget)) {
    const boolKey = ["yes", "true", "1"].includes(normTarget) ? "yes" : "no";
    const aliases = BOOLEAN_MAP[boolKey];
    const match = searchPool.find((o) => {
      const v = normalize(o.value);
      const t = normalize(o.text);
      return aliases.includes(v) || aliases.includes(t);
    });
    if (match) return match;
  }

  // Partial labels are safe only when every target word is present and the
  // result is unique. Never match empty option IDs or just one shared word.
  const tokens = normTarget.split(/\s+/).filter(Boolean);
  if (normTarget.length >= 3) {
    const matches = searchPool.filter(option => {
      const words = normalize(option.text).split(/\s+/);
      return tokens.every(token => words.includes(token));
    });
    if (matches.length === 1) return matches[0];
  }
  return null;
}


export async function fillCustomDropdown(el: HTMLElement, targetValue: string, field?: string): Promise<boolean> {
  if (!el?.isConnected || !targetValue || el.matches(":disabled,[aria-disabled='true'],[aria-multiselectable='true']")) return false;
  const innerSelect = el.querySelector("select");
  if (innerSelect instanceof HTMLSelectElement) {
    if (innerSelect.multiple || innerSelect.matches(":disabled")) return false;
    const selected = innerSelect.selectedOptions[0];
    if (selected && selected.value && !isBlankDropdown(selected.text)) return false;
    const opts = [...innerSelect.options].filter(o => !o.disabled && !o.parentElement?.matches("optgroup[disabled]")).map(o => ({ value: o.value, text: o.text, index: o.index }));
    const matched = matchSelectOption(targetValue, opts, field);
    if (!matched) return false;
    return setNativeSelect(innerSelect, matched.value, matched.index!);
  }

  const selector = "[role='option'],lyte-drop-item,mat-option,.lyteDropdownItem,.ant-select-item-option,.p-dropdown-item,.el-select-dropdown__item,[data-radix-select-item],[data-automation-id='promptOption'],[class*='option']";
  const trigger = el.matches("input,button,[role='combobox'],[aria-haspopup='listbox']") ? el :
    el.querySelector<HTMLElement>("input[role='combobox'],input[aria-autocomplete],input[type='search'],[role='combobox'],[aria-haspopup='listbox'],lyte-drop-button,button,[role='button']") ?? el;
  const searchInput = trigger instanceof HTMLInputElement && (trigger.getAttribute("role") === "combobox" || trigger.hasAttribute("aria-autocomplete") || trigger.type === "search") ? trigger :
    el.querySelector<HTMLInputElement>("input[role='combobox'],input[aria-autocomplete],input[type='search']");
  const readState = () => readDropdownState(el, trigger);
  const original = readState();
  if ([original.value, original.text].some(value => value && !isBlankDropdown(value))) return false;
  const url = location.href;
  const visible = (item: HTMLElement) => item.isConnected && !!item.getClientRects().length && getComputedStyle(item).visibility !== "hidden" && getComputedStyle(item).display !== "none" && !item.closest("[hidden],[aria-hidden='true'],[aria-disabled='true'],[disabled]");
  const visibleLists = () => [...document.querySelectorAll<HTMLElement>("[role='listbox']")].filter(visible);
  const beforeLists = new Set(visibleLists());
  const beforeOptions = new Set([...document.querySelectorAll<HTMLElement>(selector)].filter(visible));
  const ids = [el, trigger].flatMap(control => `${control.getAttribute("aria-controls") || ""} ${control.getAttribute("aria-owns") || ""}`.split(/\s+/).filter(Boolean));
  if (trigger.getAttribute("aria-expanded") !== "true") trigger.click();
  if (searchInput && isBlankDropdown(searchInput.value)) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(searchInput, targetValue);
    else searchInput.value = targetValue;
    searchInput.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, data: targetValue, inputType: "insertText" }));
  }
  const optionElements = () => {
    const lists = visibleLists();
    const related = lists.filter(list => ids.includes(list.id));
    const appeared = lists.filter(list => !beforeLists.has(list));
    let roots: Element[] = related.length ? related : appeared.length ? appeared : trigger.getAttribute("aria-expanded") === "true" && lists.length === 1 ? lists : [];
    if (!roots.length) {
      const owned = ids.map(id => document.getElementById(id)).filter((item): item is HTMLElement => item instanceof HTMLElement && visible(item));
      roots = owned;
    }
    const nested = roots.flatMap(root => [...root.querySelectorAll<HTMLElement>(selector)]);
    const loose = [...document.querySelectorAll<HTMLElement>(selector)].filter(item =>
      visible(item) && !beforeOptions.has(item) && (item.getAttribute("role") === "option" || !!item.closest("[role='listbox']")));
    const local = el.querySelectorAll<HTMLElement>(selector);
    return [...new Set([...nested, ...loose, ...[...local].filter(visible)])].filter(visible);
  };
  let items: HTMLElement[] = [];
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!el.isConnected || location.href !== url || el.matches(":disabled,[aria-disabled='true']")) return false;
    items = optionElements();
    if (items.length) break;
    await new Promise(resolve => setTimeout(resolve, 75));
  }
  const candidates = items.map(item => ({ value: item.getAttribute("data-value") || item.getAttribute("value") || item.textContent?.trim() || "", text: item.textContent?.trim() || "", element: item }));
  const matched = matchSelectOption(targetValue, candidates, field);
  if (!matched) return false;
  const expected = (actual: string) => normalize(actual) === normalize(matched.text) || normalize(actual) === normalize(matched.value) || !!matchSelectOption(targetValue, [{ value: actual, text: actual }], field);
  const beforeClickState = readState();
  matched.element!.click();
  for (let attempt = 0; attempt < 16; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 60));
    if (!el.isConnected || location.href !== url) return false;
    const after = readState();
    const stateChanged = verifyDropdownSelection(beforeClickState, after, [matched.text, matched.value]);
    const expectedValue = [after.value, after.text, after.selected].some(value => !!value && expected(value));
    if (stateChanged && expectedValue) return true;
  }
  // A keyboard fallback is safe only when the visible menu contains exactly
  // the one unique option already resolved by the matcher.
  if (items.length === 1 && items[0] === matched.element && el.isConnected && location.href === url) {
    (trigger as HTMLElement).focus?.();
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", bubbles: true }));
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 60));
      if (!el.isConnected || location.href !== url) return false;
      const after = readState();
      if (verifyDropdownSelection(beforeClickState, after, [matched.text, matched.value]) &&
        [after.value, after.text, after.selected].some(value => !!value && expected(value))) return true;
    }
  }
  return false;
}
