import { installFieldMemory, memoryQuestion } from "./field-memory-page";
import { localDate } from "./application-tracker";
import { installStepMonitor, isNextStepLabel, navigationLabel } from "./step-monitor";
import { customFieldAnswersSchema, customFieldAnswerKindsSchema, rememberedAnswer, rememberedAnswerKind } from "./field-memory";
import { isDisclosureField, approvedDisclosureValue, disclosureAnswerMatches } from "./disclosures";
import { fillSavedResume } from "./resume-page";
import { aiFillSchema, scanAIPage, fillAIPage, aiReplaceSchema, replaceAIAnswer } from "./ai-page";
import { matchField, forbidden, normalize } from "./matching";
import type { Match, Profile, Application } from "./model";
import { signals, type Control } from "./field-signals";
import { detectField } from "./field-detection";
import { rankAnswerMatches } from "./answer-matcher";
import type { SavedAnswer } from "./answer-library";
import { savedAnswerSchema } from "./answer-library";
import { PREVIEW_TTL, secureIdentityPage } from "./security";
import { z } from "zod";
import { legalFields } from "./fresher";
import { InPageWidget } from "./inpage-widget";
import { inputCompatibilityError } from "./input-compatibility";
import { isReactSelect, reactSelectValue, fillReactSelect } from "./react-select";
import { isRadioControl, matchRadioChoice, radioGroupChoices, selectRadioChoice, setNativeSelect, optionMatchesAnswer } from "./selection-engine";
import { smartConvert, matchNoticeOption, splitPhoneControl, birthDatePart } from "./converters";
import { extractJobMetadata, isSubmitTrigger } from "./tracker-detector";
import {
  isDropdownControl,
  isBlankDropdown,
  matchSelectOption,
  fillCustomDropdown,
} from "./dropdown";
import { generateSection } from "./cover-letter";
import {
  getStoredResume,
  base64ToFile,
  injectFileIntoInput,
  acceptsResumeFile,
  isResumeInput,
} from "./resume-vault";

function fieldForControl(el: Control, hints = signals(el), detected = matchField(hints)) {
  const field = detected;
  return field && birthDatePart(el, hints) ? "dob" : field;
}
function supportedDatePicker(el: Control): boolean {
  return el instanceof HTMLInputElement && el.readOnly && fieldForControl(el) === "dob" && (el.classList.contains("flatpickr-input") || el.classList.contains("hasDatepicker"));
}

function radioHasSelection(el: Control): boolean {
  if (!isRadioControl(el)) return false;
  if (!(el instanceof HTMLInputElement)) return !!el.closest("[role='radiogroup']")?.querySelector("[role='radio'][aria-checked='true']");
  // Native groups share a tree, form owner and nonempty name. Unnamed radios
  // are independent even when they share a fieldset.
  if (!el.name) return el.checked;
  return [...(el.getRootNode() as Document | ShadowRoot).querySelectorAll<HTMLInputElement>('input[type="radio"]')]
    .some(peer => peer.name === el.name && peer.form === el.form && peer.checked);
}

function controlIdentity(el: Control): string {
  const tag = el.tagName.toLowerCase();
  const input = el as HTMLInputElement;
  if (el.id) return `id:${tag}:${el.id}`;
  if (input.name) return `name:${tag}:${input.name}`;
  const label = signals(el).find(value => value.trim());
  return label ? `label:${tag}:${normalize(label)}` : "";
}

function rediscoverControl(key: string, field: string | null): Control | null {
  if (!key) return null;
  const candidates = getAllControls().filter(el => controlIdentity(el) === key && fieldForControl(el) === field);
  return candidates.length === 1 ? candidates[0] : null;
}
function precedesInForm(first: Control, second: Control): boolean {
  return first.closest("form") === second.closest("form") &&
    !!(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

const rememberedMatches = new Map<string, {question: string; answer: string; kind: "text" | "textarea" | "select" | ""}>();
const answerSuggestionMatches = new Map<string, Map<string, {question: string; answer: string}>>();
const disclosureApprovals = new Map<string, string>();
function disclosureControlValue(el: Control, answer: string): string {
  if (!answer) return "";
  if (el instanceof HTMLSelectElement) {
    const options = [...el.options].filter(o => !o.disabled && !o.parentElement?.matches("optgroup[disabled]") && disclosureAnswerMatches(answer, o.text));
    return options.length === 1 ? options[0].value : "";
  }
  if (el instanceof HTMLInputElement && el.type === "radio") {
    const peers = [...(el.getRootNode() as Document | ShadowRoot).querySelectorAll<HTMLInputElement>('input[type="radio"]')].filter(r => el.name ? r.name === el.name && r.form === el.form : r.closest("fieldset") === el.closest("fieldset"));
    if (!el.name && !el.closest("fieldset")) return "";
    if (peers.some(r => r.checked)) return "";
    const candidates = peers.filter(r => !r.disabled && [...Array.from(r.labels ?? []).map(l => l.textContent ?? ""), r.getAttribute("aria-label") ?? ""].some(text => disclosureAnswerMatches(answer, text)));
    return candidates.length === 1 && candidates[0] === el ? answer : "";
  }
  // Unknown/custom controls and multi-select checkboxes need manual review.
  return "";
}

const phonePairs = new Map<string, { selector: HTMLSelectElement; optionValue: string; optionIndex: number; previous: string; options: string }>();
const registry = new Map<string, Control>();
let filling = false;
const selectContexts = new Map<string, { state: string; country: string }>();
const snapshots = new Map<string, { value: string; kind: string; action: string; match: Match; selectOptions?: string; expectedOptionText?: string; expectedAnswer?: string; controlKey: string }>();
let scanProfileId = "";
let scanId = "",
  scanUrl = "",
  scannedAt = 0;
let expiry: ReturnType<typeof setTimeout> | undefined;

function getAllControls(): Control[] {
  const query =
    "input,textarea,select,[role='radio'],lyte-dropdown,lyte-select,crm-select,crm-dropdown,crm-multi-select,crux-select,crux-dropdown,crux-select-component,crux-dropdown-component,mat-select,p-dropdown,el-select,v-select,ant-select,lightning-combobox,lightning-base-combobox,.ant-select,.select2-container,.chosen-container,[data-zcui*='select'],[data-zcui*='dropdown'],[data-component*='select'],[data-component*='dropdown'],[data-field-type*='select'],[data-field-type*='dropdown'],[data-ui*='dropdown'],[data-ui*='select'],[data-control*='dropdown'],[data-control*='select'],[data-radix-select-trigger],[data-automation-id*='select'],[data-automation-id*='dropdown'],[role='combobox']:not(input):not(textarea),[role='listbox']:not(input):not(textarea),[aria-haspopup='listbox']:not(input):not(textarea)";
  const elements = new Set<Control>();
  function search(node: Document | Element | ShadowRoot) {
    node.querySelectorAll<Control>(query).forEach((el) => elements.add(el));
    node.querySelectorAll("*").forEach((el) => {
      if (el.shadowRoot) {
        search(el.shadowRoot);
      }
    });
  }
  search(document);
  return Array.from(elements);
}

const controlValue = (el: Control) => {
  if (el instanceof HTMLInputElement && isReactSelect(el)) return reactSelectValue(el);
  if (isRadioControl(el)) {
    return el instanceof HTMLInputElement ? String(el.checked) : String(el.getAttribute("aria-checked") === "true");
  }
  if (el instanceof HTMLInputElement && el.type === "checkbox") {
    return String(el.checked);
  }
  if (el instanceof HTMLSelectElement) {
    return el.value || el.options[el.selectedIndex]?.text || "";
  }
  if (isDropdownControl(el)) {
    if (el instanceof HTMLInputElement && !isBlankDropdown(el.value)) return el.value;
    return (
      (el as HTMLElement).getAttribute("lt-prop-selected") ||
      (el as HTMLElement).getAttribute("data-selected") ||
      (el as HTMLElement).getAttribute("data-value") ||
      el.querySelector("lyte-drop-button, .lyteDropdownSelection, .mat-mdc-select-value, .p-dropdown-label, .ant-select-selection-item, .select2-selection__rendered, [data-radix-select-value], .select__single-value, [class*='singleValue'], .selected, .select-value")?.textContent?.trim() ||
      el.textContent?.trim() ||
      ""
    );
  }
  return (el as HTMLInputElement).value || "";
};

function detect(values: Record<string, string>, answers: Record<string, string> = {}, profileId = "", answerLibrary: SavedAnswer[] = [], answerKinds: Record<string, "text" | "textarea" | "select"> = {}): Match[] {
  if (filling) throw Error("A fill is still running. Wait for its result before scanning again.");
  rememberedMatches.clear();
  answerSuggestionMatches.clear();
  registry.clear();
  selectContexts.clear();
  disclosureApprovals.clear();
  phonePairs.clear();
  snapshots.clear();
  scanId = crypto.randomUUID();
  scanProfileId = profileId;
  scanUrl = location.href;
  scannedAt = Date.now();
  clearTimeout(expiry);
  expiry = setTimeout(() => {
    scanId = "";
    snapshots.clear();
    registry.clear();
    rememberedMatches.clear();
    answerSuggestionMatches.clear();
    disclosureApprovals.clear();
    phonePairs.clear();
  }, PREVIEW_TTL);
  const answerRole = answerLibrary.length
    ? extractJobMetadata(document, location.href).position || values.preferredRole
    : values.preferredRole;
  const matches = getAllControls()
    .filter(
      (el) => {
        if ((el as HTMLInputElement).disabled || el.matches(":disabled")) return false;
        const isSelect = el instanceof HTMLSelectElement;
        const isCustomDropdown = isDropdownControl(el);
        if (isReactSelect(el) && !el.getClientRects().length) return false;
        if (!isSelect && !isCustomDropdown && !el.getClientRects().length) return false;
        if (!isCustomDropdown && ["hidden", "submit", "button", "reset", "password"].includes((el as HTMLInputElement).type)) return false;
        // Avoid treating inner inputs of custom dropdowns as independent text fields
        if (el instanceof HTMLInputElement && el.closest("lyte-dropdown, lyte-select, crm-select, crm-dropdown, crux-select, crux-dropdown, crux-select-component, crux-dropdown-component, mat-select, p-dropdown, el-select, v-select, ant-select, lightning-combobox, [role='combobox']:not(input)")) return false;
        // If an element contains another control (e.g. a container div wrapping a select/custom component), do not detect container
        if (!isSelect && el.querySelector("select, lyte-dropdown, lyte-select, crm-select, crm-dropdown, crux-select, crux-dropdown, crux-select-component, mat-select, p-dropdown, el-select, v-select, ant-select, lightning-combobox")) return false;
        return true;
      },
    )
    .map((el): Match | null => {
      if (registry.size >= 300) return null;
      const hints = signals(el);
      if (hints.some(forbidden)) return null;
      const detection = detectField(el);
      const field = fieldForControl(el, hints, detection.type),
        id = crypto.randomUUID();
      registry.set(id, el);
      if (isReactSelect(el)) selectContexts.set(id, { state: values.state ?? "", country: values.country ?? "" });
      const kind = isDropdownControl(el) ? "select" : isRadioControl(el) ? "radio" : (el as HTMLInputElement).type || el.tagName.toLowerCase();
      let value = field ? (values[field] ?? "") : "";
      let expectedOptionText: string | undefined;
      let expectedAnswer: string | undefined;
      let radioChoiceResolved = false;
      let answerSuggestions: Match["answerSuggestions"];
      let unmatchedOption = false;
      if (field && !value && (field === "aboutYou" || field === "whyHire" || field === "whyCompany")) {
        const meta = extractJobMetadata(document, location.href);
        value = generateSection(field, values, {
          company: meta.company || "your organization",
          role: meta.position || values.preferredRole || "this position",
          tone: "professional",
        });
      }
      if (field === "mobile") {
        const pair = splitPhoneControl(value, el);
        if (pair) phonePairs.set(id, { ...pair, previous: pair.selector.value, options: pair.selector.innerHTML });
      }
      if (field) {
        value = supportedDatePicker(el) ? value : smartConvert(field, value, el, hints, values);
      }
      if (field?.startsWith("preDegree") && field !== "preDegreeType") {
        const text = hints.map(normalize).join(" ");
        const school =
            /\b(12th|class 12|hsc|puc|higher secondary|pre university)\b/.test(
              text,
            ),
          diploma = /\bdiploma\b/.test(text);
        if (
          !values.preDegreeType ||
          (school && !diploma && values.preDegreeType !== "12th") ||
          (diploma && !school && values.preDegreeType !== "Diploma")
        )
          value = "";
      }
      if (
        kind === "radio" &&
        value
      ) {
        const radio = el as HTMLElement;
        const peers = radioGroupChoices(radio);
        if (field === "noticePeriod" || field === "availability") {
          const choice = matchNoticeOption(value, peers.map(p => ({ element: p.element!, value: p.value, text: p.text })));
          if (choice?.element !== radio) value = "";
          else radioChoiceResolved = true;
        } else {
          const choice = matchRadioChoice(value, peers);
          if (choice?.element !== radio) value = "";
          else radioChoiceResolved = true;
        }
      }
      if (isDropdownControl(el) && value) {
        if (el instanceof HTMLSelectElement) {
          const opts = [...el.options].filter((o) => !o.disabled && !o.parentElement?.matches("optgroup[disabled]")).map((o) => ({
            value: o.value,
            text: o.text,
            index: o.index,
          }));
          expectedAnswer = value;
          const matched = field === "dob" && birthDatePart(el, hints) ? opts.find(o => o.value === value) : matchSelectOption(value, opts, field ?? undefined);
          if (matched) {
            expectedOptionText = matched.text;
            value = matched.value || matched.text;
          } else unmatchedOption = true;
        }
      }

      if (
        kind === "checkbox" &&
        value &&
        !value
          .split(/[,;\n]/)
          .some(
            (v) =>
              normalize(v) === normalize((el as HTMLInputElement).value) ||
              hints.some((s) => normalize(s) === normalize(v)),
          )
      )
        value = "";
      if (!field) {
        const question = memoryQuestion(el);
        const answer = rememberedAnswer(question, answers);
        const rememberedKind = rememberedAnswerKind(question, answerKinds);
        const controlKind = el instanceof HTMLSelectElement ? "select" : el instanceof HTMLTextAreaElement ? "textarea" : el instanceof HTMLInputElement ? "text" : "";
        if (answer && (el instanceof HTMLSelectElement || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && (!rememberedKind || rememberedKind === controlKind)) {
          if (el instanceof HTMLSelectElement) {
            const options = [...el.options].filter(o => !o.disabled && !o.parentElement?.matches("optgroup[disabled]") && o.text.trim() === answer);
            value = options.length === 1 ? options[0].value : "";
            if (value) { expectedAnswer = answer; expectedOptionText = answer; }
          } else value = answer;
          if (value) rememberedMatches.set(id, {question,answer,kind:rememberedKind});
        } else if (question && (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement && ["text", "search"].includes(el.type))) {
          const suggestions = rankAnswerMatches(question, answerLibrary, answerRole);
          if (suggestions.length) {
            answerSuggestions = suggestions.map(({ answer: saved, score, reasons }) => ({ id: saved.id, question: saved.question, answer: saved.answer, category: saved.category, score, reasons }));
            answerSuggestionMatches.set(id, new Map(suggestions.map(({ answer: saved }) => [saved.id, { question, answer: saved.answer }])));
          }
        }
      }
      if (isDisclosureField(field)) {
        const approved = approvedDisclosureValue(field, values);
        value = disclosureControlValue(el, approved);
        // The approved disclosure matcher is authoritative; generic option
        // matching does not understand equivalent decline-to-answer labels.
        unmatchedOption = !!approved && !value;
        if (value) disclosureApprovals.set(id, approved);
      }
      const incompatible = supportedDatePicker(el) ? null : (el as HTMLInputElement).readOnly
        ? "Read-only control requires manual selection" : inputCompatibilityError(el, value);
      const valStr = controlValue(el).toLowerCase();
      const isBlank = isDropdownControl(el) ? isBlankDropdown(valStr) : !valStr;
      const existingSelection = radioHasSelection(el) || (kind === "checkbox" && (el as HTMLInputElement).checked);
      const blocked = !!incompatible || unmatchedOption || existingSelection || (!["checkbox", "radio"].includes(kind) && !isBlank);
      const confidence = radioChoiceResolved ? Math.max(detection.confidence, 80) : detection.confidence;
      const lowConfidence = !!field && confidence < 70;
      const reason = existingSelection ? "Already filled — existing choice preserved" : incompatible || (unmatchedOption ? "No matching dropdown option" : !isBlank && !["checkbox", "radio"].includes(kind)
        ? "Already filled — existing value preserved" : !field && !rememberedMatches.has(id)
          ? "Needs your answer — no profile field matched" : !value
            ? "No usable saved value — update this profile field" : legalFields.includes(field ?? "")
              ? "Review and select this answer yourself" : lowConfidence
                ? `Low confidence (${detection.confidence}%). Confirm this field before filling.` : undefined);
      const match: Match = {
        reason,
        blocked,
        confidence: field ? confidence : undefined,
        evidence: field ? (radioChoiceResolved ? [...detection.evidence, "Radio option uniquely matches the saved answer"] : detection.evidence) : undefined,
        answerSuggestions,
        id,
        label:
          (hints.find(Boolean) ?? kind) +
          (incompatible ? ` — ${incompatible}` : ""),
        field,
        value,
        kind,
        remembered: rememberedMatches.has(id),
        sensitive: field === "pan" || field === "aadhaar",
        selected:
          !!value &&
          !blocked &&
          !incompatible &&
          kind !== "file" &&
          field !== "pan" &&
          field !== "aadhaar" &&
          !legalFields.includes(field ?? "") &&
          !lowConfidence &&
          (["checkbox", "radio"].includes(kind)
            ? controlValue(el) === "false"
            : isBlank),
      };
      snapshots.set(id, {
        selectOptions: el instanceof HTMLSelectElement ? el.innerHTML : undefined,
        expectedOptionText,
        expectedAnswer,
        controlKey: controlIdentity(el),
        value: controlValue(el),
        kind,
        action: (el as HTMLInputElement).form?.action ?? "",
        match,
      });
      return match;
    })
    .filter((m): m is Match => m !== null);
  const parentFields: Record<string, string[]> = {
    state: ["country"],
    city: ["state", "country"],
    preferredLocation: ["state", "country"],
    branch: ["degree"],
  };
  for (const child of matches) {
    if (!child.field || child.reason !== "No matching dropdown option" || !child.value) continue;
    const parents = parentFields[child.field] ?? [];
    if (matches.some(parent => parent.selected && parent.value && parents.includes(parent.field ?? ""))) {
      child.blocked = false;
      child.reason = undefined;
      child.selected = true;
    }
  }
  return matches;
}
async function fill(
  matches: Match[],
  confirmSensitive: boolean,
  token: string,
): Promise<{ filled: number; errors: string[] }> {
  if (filling) throw Error("A fill is already running. Wait for its result.");
  filling = true;
  try { return await performFill(matches, confirmSensitive, token); }
  finally { filling = false; }
}
async function performFill(
  matches: Match[],
  confirmSensitive: boolean,
  token: string,
): Promise<{ filled: number; errors: string[] }> {
  if (
    token !== scanId ||
    location.href !== scanUrl ||
    Date.now() - scannedAt > PREVIEW_TTL
  )
    throw Error("This preview expired or the page changed. Scan again.");
  let filled = 0;
  const errors: string[] = [];
  const receipts: { el: Control; expected: string; label: string }[] = [];
  const changedControls: Control[] = [];
  const fillDeadline = Date.now() + 45000;
  for (const m of matches) {
    if (!m.selected && m.kind !== "file") continue;
    if (token !== scanId || location.href !== scanUrl || Date.now() - scannedAt > PREVIEW_TTL) {
      errors.push("The page changed or the preview expired during filling. Scan again for the remaining fields.");
      break;
    }
    if (Date.now() > fillDeadline) { errors.push("Some dropdowns took too long. Scan again to fill the remaining fields."); break; }
    let el = registry.get(m.id);
    const snapshot = snapshots.get(m.id);
    let replacedByParent = false;
    if (el && !el.isConnected && snapshot && filled > 0) {
      const replacement = rediscoverControl(snapshot.controlKey, m.field);
      if (replacement) { el = replacement; registry.set(m.id, replacement); replacedByParent = true; }
    }
    const hasEarlierDropdown = el ? changedControls.some(parent => parent !== el && isDropdownControl(parent) && precedesInForm(parent, el!)) : false;
    if (el instanceof HTMLSelectElement && snapshot?.expectedAnswer && hasEarlierDropdown &&
      !matchSelectOption(snapshot.expectedAnswer, [...el.options].filter(o => !o.disabled && !o.parentElement?.matches("optgroup[disabled]")).map(o => ({ value: o.value, text: o.text })), m.field ?? undefined)) {
      for (let attempt = 0; attempt < 15; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (token !== scanId || location.href !== scanUrl) break;
        if (!el.isConnected) {
          const replacement = rediscoverControl(snapshot.controlKey, m.field);
          if (replacement instanceof HTMLSelectElement) { el = replacement; registry.set(m.id, replacement); replacedByParent = true; }
        }
        if (!(el instanceof HTMLSelectElement)) break;
        const options = [...el.options].filter(o => !o.disabled && !o.parentElement?.matches("optgroup[disabled]")).map(o => ({ value: o.value, text: o.text }));
        if (matchSelectOption(snapshot.expectedAnswer, options, m.field ?? undefined)) break;
      }
    }
    const isSelect = el instanceof HTMLSelectElement;
    const isCustomDropdown = el ? isDropdownControl(el) : false;
    const currentKind = isCustomDropdown
      ? "select"
      : el && isRadioControl(el) ? "radio" : (el as HTMLInputElement)?.type || el?.tagName.toLowerCase();
    const suggestedAnswer = m.answerId ? answerSuggestionMatches.get(m.id)?.get(m.answerId) : undefined;
    const optionsChanged = isSelect && (el as HTMLSelectElement).innerHTML !== snapshot?.selectOptions;
    const dependencyRefresh = !!el && filled > 0 && isSelect && (replacedByParent || optionsChanged);
    if (dependencyRefresh && el instanceof HTMLSelectElement && snapshot) {
      const answer = snapshot.expectedAnswer || m.value;
      const options = [...el.options].filter(o => !o.disabled && !o.parentElement?.matches("optgroup[disabled]")).map(o => ({ value: o.value, text: o.text, index: o.index }));
      const refreshed = matchSelectOption(answer, options, m.field ?? undefined);
      if (!refreshed) {
        errors.push(`${m.label}: dependent options changed and no unique match remains; select manually`);
        continue;
      }
      m.value = refreshed.value;
      snapshot.match.value = refreshed.value;
      snapshot.expectedAnswer = answer;
      snapshot.expectedOptionText = refreshed.text;
      snapshot.value = controlValue(el);
      snapshot.selectOptions = el.innerHTML;
      snapshot.action = el.form?.action ?? "";
    }
    if (
      !el ||
      !snapshot ||
      !el.isConnected ||
      (!isSelect && !isCustomDropdown && !el.getClientRects().length) ||
      currentKind !== snapshot.kind ||
      ((el as HTMLInputElement).form?.action ?? "") !== snapshot.action ||
      (controlValue(el) !== snapshot.value && !dependencyRefresh) ||
      (optionsChanged && !dependencyRefresh) ||
      snapshot.match.field !== m.field ||
      (!m.answerId && snapshot.match.value !== m.value) ||
      (m.answerId && (!suggestedAnswer || suggestedAnswer.answer !== m.value)) ||
      (el as HTMLInputElement).disabled ||
      el.matches(":disabled") ||
      ((el as HTMLInputElement).readOnly && !supportedDatePicker(el)) ||
      fieldForControl(el) !== m.field ||
      signals(el).some(forbidden)
    ) {
      errors.push(`${m.label}: field changed; scan again`);
      continue;
    }
    if ((el as HTMLInputElement).type === "file") {
      const fileInput = el as HTMLInputElement;
      if (fileInput.files?.length) continue;
      let injected = false;
      if (isResumeInput(signals(fileInput), fileInput)) {
        try {
          if (!scanProfileId) throw Error("Scan with a saved profile before attaching a resume.");
          const stored = await getStoredResume(scanProfileId);
          if (stored && stored.dataBase64) {
            const fileObj = base64ToFile(
              stored.dataBase64,
              stored.name,
              stored.type,
            );
            if (token !== scanId || location.href !== scanUrl || !fileInput.isConnected || fileInput.matches(":disabled") || fileInput.files?.length)
              throw Error("Resume field or page changed; scan again.");
            if (!acceptsResumeFile(fileObj, fileInput.accept)) throw Error("Saved resume format is not accepted by this field.");
            injected = injectFileIntoInput(fileInput, fileObj);
          }
        } catch (error) {
          errors.push(error instanceof Error ? error.message : "Resume could not be attached. Select it manually.");
        }
      }

      if (injected) {
        fileInput.style.outline = "3px solid #10b981";
        fileInput.style.borderRadius = "4px";
        fileInput.scrollIntoView({ block: "center" });
        filled++;
      } else {
        fileInput.style.outline = "3px solid #7c3aed";
        fileInput.scrollIntoView({ block: "center" });
      }
      continue;
    }
    if (!m.selected || (!m.field && !rememberedMatches.has(m.id) && !m.answerId) || !m.value) continue;
    if (snapshot.match.blocked) { errors.push(`${m.label}: ${snapshot.match.reason}`); continue; }
    if (radioHasSelection(el)) {
      errors.push(`${m.label}: a radio choice is already selected; existing answer preserved`);
      continue;
    }
    const memory = suggestedAnswer ?? rememberedMatches.get(m.id);
    const currentMemoryKind = el instanceof HTMLSelectElement ? "select" : el instanceof HTMLTextAreaElement ? "textarea" : el instanceof HTMLInputElement ? "text" : "";
    if (memory && (memoryQuestion(el) !== memory.question || ("kind" in memory && memory.kind && memory.kind !== currentMemoryKind) || (el instanceof HTMLSelectElement && [...el.options].filter(o => !o.disabled && !o.parentElement?.matches("optgroup[disabled]") && o.value === m.value && o.text.trim() === memory.answer).length !== 1))) {
      errors.push(`${m.label}: remembered question changed; scan again`); continue;
    }
    if (isDisclosureField(m.field)) {
      const approved = disclosureApprovals.get(m.id) ?? "";
      if (!approved || disclosureControlValue(el, approved) !== m.value) {
        errors.push(`${m.label}: disclosure choices changed; review and scan again`);
        continue;
      }
    }
    if (supportedDatePicker(el)) {
      const token = crypto.randomUUID();
      el.setAttribute("data-easyapply-date", token);
      try {
        const response = await chrome.runtime.sendMessage({ type: "set-page-date", token, iso: m.value });
        if (response?.filled) { receipts.push({ el, expected: controlValue(el), label: m.label }); filled++; }
        else errors.push(`${m.label}: calendar requires manual selection`);
      } catch { errors.push(`${m.label}: calendar requires manual selection`); }
      finally { el.removeAttribute("data-easyapply-date"); }
      continue;
    }
    if (el instanceof HTMLInputElement && isReactSelect(el)) {
      if (await fillReactSelect(el, m.value, m.field ?? undefined, { ...selectContexts.get(m.id), valid: () => scanId === token && location.href === scanUrl })) { receipts.push({ el, expected: controlValue(el), label: m.label }); filled++; }
      else errors.push(`${m.label}: no unique matching option was accepted; select manually`);
      continue;
    }
    const incompatible = isCustomDropdown ? null : inputCompatibilityError(el, m.value);
    if (incompatible) {
      errors.push(`${m.label}: ${incompatible}`);
      continue;
    }
    const pair = phonePairs.get(m.id);
    if (pair) {
      if (!pair.selector.isConnected || pair.selector.disabled || pair.selector.value !== pair.previous || pair.selector.innerHTML !== pair.options) { errors.push(`${m.label}: calling-code selector changed; scan again`); continue; }
      pair.selector.selectedIndex = pair.optionIndex;
      pair.selector.dispatchEvent(new Event("input", { bubbles: true }));
      pair.selector.dispatchEvent(new Event("change", { bubbles: true }));
      if (pair.selector.value !== pair.optionValue || !el.isConnected) { errors.push(`${m.label}: calling code was rejected; review the page`); continue; }
    }
    if ((m.field === "pan" || m.field === "aadhaar") && !confirmSensitive) {
      errors.push("Sensitive identity requires confirmation");
      continue;
    }
    if (
      (m.field === "pan" || m.field === "aadhaar") &&
      !secureIdentityPage(location.href)
    ) {
      errors.push(`${m.label}: identity requires HTTPS`);
      continue;
    }
    if (el instanceof HTMLSelectElement) {
      const opts = [...el.options].filter((o) => !o.disabled && !o.parentElement?.matches("optgroup[disabled]")).map((o) => ({
        value: o.value,
        text: o.text,
        index: o.index,
        element: o,
      }));
      // Scan already resolved the visible answer to an option ID. Do not
      // reinterpret that opaque ID as a duration, salary, or other answer.
      const candidates = opts.filter(o => o.value === m.value);
      const matched = candidates.length === 1 ? candidates[0] : null;
      if (!matched) {
        errors.push(`${m.label}: no matching option`);
        continue;
      }
      if (typeof matched.index !== "number" || !await setNativeSelect(el, matched.value, matched.index)) {
        errors.push(`${m.label}: website did not accept the selected option; review this field`);
        continue;
      }
      el.dispatchEvent(new FocusEvent("blur", { bubbles: true, composed: true }));
      el.dispatchEvent(new FocusEvent("focusout", { bubbles: true, composed: true }));
      const selected = el.selectedOptions[0];
      if (!selected || normalize(selected.text) !== normalize(snapshot.expectedOptionText ?? matched.text) ||
        !optionMatchesAnswer(snapshot.expectedAnswer ?? "", { value: selected.value, text: selected.text }, m.field ?? undefined)) {
        errors.push(`${m.label}: selected option does not match the expected answer; review this field`);
        continue;
      }
      receipts.push({ el, expected: matched.value, label: m.label });
      filled++;
      changedControls.push(el);
      continue;
    }
    if (isDropdownControl(el)) {
      const ok = await fillCustomDropdown(el as HTMLElement, m.value, m.field ?? undefined);
      if (ok) {
        receipts.push({ el, expected: controlValue(el), label: m.label });
        filled++;
        changedControls.push(el);
      } else {
        errors.push(`${m.label}: could not select option`);
      }
      continue;
    } else if (isRadioControl(el) || el instanceof HTMLInputElement && el.type === "checkbox") {
      if (isRadioControl(el)) {
        if (!(el instanceof HTMLElement) || !selectRadioChoice(el)) {
          errors.push(`${m.label}: website did not accept the selected choice; review this field`);
          continue;
        }
      } else {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set?.call(el, true);
        el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        el.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      }
      const checked = el instanceof HTMLInputElement ? el.checked : el.getAttribute("aria-checked") === "true";
      const roleGroup = !(el instanceof HTMLInputElement) ? el.closest("[role='radiogroup']") : null;
      const groupValid = !roleGroup || roleGroup.querySelectorAll("[role='radio'][aria-checked='true']").length === 1;
      if (!checked || !groupValid) {
        errors.push(`${m.label}: website did not accept the selected choice; review this field`);
        continue;
      }
      receipts.push({ el, expected: "true", label: m.label });
      if (el instanceof HTMLElement) {
        el.dispatchEvent(new FocusEvent("blur", { bubbles: true, composed: true }));
        el.dispatchEvent(new FocusEvent("focusout", { bubbles: true, composed: true }));
      }
      filled++;
      if (isRadioControl(el)) changedControls.push(el);
      continue;
    } else if (
      el instanceof HTMLInputElement &&
      (el.type === "date" || el.type === "month" || el.type === "datetime-local")
    ) {
      // Native date inputs need descriptor set + change event.
      // React's _valueTracker must be reset to the *previous* value so React
      // detects the synthetic change even when the raw value hasn't visually changed.
      const tracker = (
        el as unknown as { _valueTracker?: { getValue: () => string; setValue: (v: string) => void } }
      )._valueTracker;
      const prevVal = tracker?.getValue?.() ?? el.value;
      try {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")
          ?.set?.call(el, m.value);
      } catch {
        /* Ignore descriptor access errors */
      }
      el.value = m.value;
      receipts.push({ el, expected: m.value, label: m.label });
      if (tracker) {
        tracker.setValue(prevVal);
      }
      el.dispatchEvent(new Event("focus", { bubbles: true, composed: true }));
      el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      el.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      el.dispatchEvent(new FocusEvent("blur", { bubbles: true, composed: true }));
      el.dispatchEvent(new FocusEvent("focusout", { bubbles: true, composed: true }));
      filled++;
      continue;
    } else {
      const tracker = (
        el as unknown as { _valueTracker?: { getValue: () => string; setValue: (v: string) => void } }
      )._valueTracker;
      // Set tracker to OLD value so React sees the "before" state and fires
      // a synthetic onChange when the descriptor set changes the real value.
      const prevVal = tracker?.getValue?.() ?? (el as HTMLInputElement).value;
      try {
        Object.getOwnPropertyDescriptor(
          el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype,
          "value",
        )?.set?.call(el, m.value);
      } catch {
        /* Ignore descriptor access errors */
      }
      (el as HTMLInputElement).value = m.value;
      receipts.push({ el: el as HTMLInputElement | HTMLTextAreaElement, expected: m.value, label: m.label });
      if (tracker) {
        tracker.setValue(prevVal);
      }

      el.dispatchEvent(new Event("focus", { bubbles: true, composed: true }));
      el.dispatchEvent(new Event("focusin", { bubbles: true, composed: true }));
      el.dispatchEvent(new Event("keydown", { bubbles: true, composed: true }));
      el.dispatchEvent(new Event("keypress", { bubbles: true, composed: true }));
      try {
        el.dispatchEvent(
          new InputEvent("beforeinput", {
            bubbles: true,
            composed: true,
            data: m.value,
            inputType: "insertText",
          }),
        );
        el.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            composed: true,
            data: m.value,
            inputType: "insertText",
          }),
        );
      } catch {
        el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      }
      el.dispatchEvent(new Event("keyup", { bubbles: true, composed: true }));
      el.dispatchEvent(new Event("change", { bubbles: true, composed: true }));

      const lyteInput = el.closest("lyte-input");
      if (lyteInput) {
        lyteInput.setAttribute("lt-prop-value", m.value);
        try {
          (
            lyteInput as unknown as {
              ltProp?: (k: string, v: string) => void;
            }
          ).ltProp?.("value", m.value);
        } catch {
          /* Ignore custom component call error */
        }
        try {
          (
            lyteInput as unknown as {
              component?: { setData?: (k: string, v: string) => void };
            }
          ).component?.setData?.("ltPropValue", m.value);
        } catch {
          /* Ignore custom component call error */
        }
      }

      const cruxComponent = el.closest("[cx-prop-label]");
      if (cruxComponent) {
        try {
          (
            cruxComponent as unknown as {
              ltProp?: (k: string, v: string) => void;
            }
          ).ltProp?.("value", m.value);
        } catch {
          /* Ignore custom component call error */
        }
        try {
          (
            cruxComponent as unknown as {
              component?: { setData?: (k: string, v: string) => void };
            }
          ).component?.setData?.("cxPropValue", m.value);
        } catch {
          /* Ignore custom component call error */
        }
      }


      el.dispatchEvent(new FocusEvent("blur", { bubbles: true, composed: true }));
      el.dispatchEvent(new FocusEvent("focusout", { bubbles: true, composed: true }));
      filled++;
    }
  }
  // Let controlled inputs and blur validation settle, then count only retained,
  // valid values. Later dependent controls may have cleared earlier fills.
  // Bounded window for debounced validation; backend acceptance still needs review.
  if (receipts.length) await new Promise(resolve => setTimeout(resolve, 750));
  for (const { el, expected, label } of receipts) {
    if (!el.isConnected || !expected || controlValue(el) !== expected || ("validity" in el && !(el as HTMLInputElement).validity.valid) || el.getAttribute("aria-invalid") === "true") {
      filled--;
      errors.push(`${label}: website cleared, changed, or rejected the value; review this field`);
    }
  }
  // Consume the preview, including partial fills. Never replay stale values.
  scanId = "";
  registry.clear();
  disclosureApprovals.clear();
  phonePairs.clear();
  snapshots.clear();
  return { filled, errors };
}
declare global {
  interface Window {
    applyEaseListener?: Parameters<
      typeof chrome.runtime.onMessage.addListener
    >[0];
    easyApplyWidgetCleanup?: () => void;
  }
}
// Re-register on injection: a boolean marker can outlive an invalidated
// extension context after an extension reload.
if (typeof window !== "undefined") {
  if (window.applyEaseListener) {
    try {
      chrome.runtime.onMessage.removeListener(window.applyEaseListener);
    } catch {
      /* Old context was invalidated. */
    }
  }
  window.easyApplyWidgetCleanup?.();
  document.getElementById("easyapply-host")?.remove();
}
const fieldMemory = installFieldMemory();
const inpageWidget = new InPageWidget({
  onScan: (profile: Profile) => {
    fieldMemory.selectProfile(profile.id);
    const matches = detect(profile.values, profile.customFieldAnswers, profile.id, [], profile.customFieldAnswerKinds);
    (window as unknown as { easyApplyScanId?: string }).easyApplyScanId =
      scanId;
    return matches;
  },
  onFill: (matches: Match[], token: string) => {
    return fill(matches, false, token);
  },
  onRequestProfiles: async () => {
    const response = await chrome.runtime.sendMessage({ type: "get-profiles" });
    if (response?.error || !Array.isArray(response?.profiles))
      throw Error(response?.error ?? "Unable to load profiles.");
    return response;
  },
  onSelectProfile: async (id) => {
    const response = await chrome.runtime.sendMessage({ type: "select-profile", id });
    if (!response?.saved) throw Error(response?.error ?? "Unable to select profile.");
  },
});
let lastPromptTime = 0;
const stepMonitor = installStepMonitor({
  readFields: (emptyOnly) => getAllControls().filter(el => {
    const input = el as HTMLInputElement;
    const root = el.getRootNode();
    if (root instanceof ShadowRoot && root.host.id.startsWith("easyapply")) return false;
    if (getComputedStyle(el).visibility === "hidden") return false;
    if (!el.isConnected || !el.getClientRects().length || input.disabled || input.readOnly || el.closest('[hidden],[aria-hidden="true"]') || signals(el).some(forbidden)) return false;
    if (["hidden", "submit", "button", "reset", "password"].includes(input.type)) return false;
    if (!emptyOnly) return true;
    if (["checkbox", "radio"].includes(input.type)) return !input.checked;
    return isDropdownControl(el) ? isBlankDropdown(controlValue(el)) : !controlValue(el).trim();
  }).slice(0, 300).map(el => `${(el as HTMLInputElement).type || el.tagName}|${normalize(signals(el).find(Boolean) || "unlabeled").slice(0, 200)}`),
  busy: () => filling || inpageWidget.isBusy(),
  offer: count => inpageWidget.offerNewStep(count),
  onArm: fields => { void chrome.runtime.sendMessage({type:"arm-step-navigation", fields}).catch(() => {}); },
  onDone: () => { void chrome.runtime.sendMessage({type:"clear-step-navigation"}).catch(() => {}); },
});
function handleSubmissionAttempt() {
  if (Date.now() - lastPromptTime < 10000) return;

  const inputs = document.querySelectorAll("input:not([type=hidden]), textarea, select");
  if (inputs.length < 2) return;

  lastPromptTime = Date.now();
  const metadata = extractJobMetadata(document, location.href);
  const applicationUrl = location.href;
  const appliedDate = localDate();

  inpageWidget.showTrackPrompt(metadata, async (confirmed) => {
    const app: Application = {
      id: crypto.randomUUID(),
      company: confirmed.company,
      position: confirmed.position,
      url: applicationUrl,
      appliedDate,
      status: "Applied",
      resume: "",
      notes: "Submission confirmed by the user after a detected submit action.",
    };

    const res = await chrome.runtime.sendMessage({ type: "track-application", application: app });
    if (!res?.success) throw Error(res?.error || "Could not save the application. Please retry.");
    inpageWidget.showToast(
      res.duplicate ? "This application is already in your tracker." : `✓ Added ${confirmed.company} to your tracker!`,
      "success",
      {
        label: "Check in Tracker ↗",
        onClick: () => {
          void chrome.runtime.sendMessage({ type: "open-tracker" });
        },
      }
    );
  });
}

const submitListener = (event: SubmitEvent) => {
  if (!event.isTrusted) return;
  const button = event.submitter;
  if (button && isNextStepLabel(navigationLabel(button))) return;
  handleSubmissionAttempt();
};
const clickListener = (e: MouseEvent) => {
  if (!e.isTrusted) return;
  const target = e.target as Element | null;
  const btn = target?.closest("button, input[type=submit], a, [role=button]");
  if (btn && isSubmitTrigger(btn)) {
    const form = (btn as HTMLButtonElement).form || btn.closest("form");
    if (!form || form.matches(":invalid")) return;
    handleSubmissionAttempt();
  }
};

document.addEventListener("submit", submitListener, true);
document.addEventListener("click", clickListener, true);

window.easyApplyWidgetCleanup = () => {
  document.removeEventListener("submit", submitListener, true);
  document.removeEventListener("click", clickListener, true);
  fieldMemory.destroy();
  stepMonitor.destroy();
  inpageWidget.destroy();
};

try {
  inpageWidget.init();
} catch {
  // Gracefully handle contexts where document is not accessible
}

const requestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("step-navigation"), fields: z.array(z.string().max(250)).max(300) }),
  z.object({ type: z.literal("fill-saved-resume"), profileId: z.string().min(1).max(100) }),
  z.object({ type: z.literal("ai-scan") }),
  aiFillSchema,
  aiReplaceSchema,
  z.object({ type: z.literal("ping") }),
  z.object({
    type: z.literal("detect"),
    values: z.record(z.string().max(100), z.string().max(10000)),
    profileId: z.string().max(100).optional(),
    customFieldAnswers: customFieldAnswersSchema.optional(),
    customFieldAnswerKinds: customFieldAnswerKindsSchema.optional(),
    answerLibrary: z.array(savedAnswerSchema).max(500).optional(),
  }),
  z.object({
    type: z.literal("fill"),
    scanId: z.string().max(100),
    confirmSensitive: z.boolean(),
    matches: z
      .array(
        z.object({
          id: z.string().max(100),
          label: z.string().max(10000),
          field: z.string().nullable(),
          value: z.string().max(10000),
          kind: z.string(),
          sensitive: z.boolean(),
          selected: z.boolean(),
          remembered: z.boolean().optional(),
          answerId: z.string().max(100).optional(),
        }),
      )
      .max(300),
  }),
  z.object({
    type: z.literal("inpage-fill"),
  }),
  z.object({
    type: z.literal("inpage-open"),
  }),
  z.object({
    type: z.literal("inpage-toast"),
    message: z.string(),
    toastType: z.enum(["info", "success", "error"]).optional(),
  }),
]);
window.applyEaseListener = (raw, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  try {
    const message = requestSchema.parse(raw);
    if (message.type === "step-navigation") { stepMonitor.resume(message.fields); respond({ready:true}); }
    if (message.type === "ai-scan") respond(scanAIPage());
    if (message.type === "ai-replace") respond(replaceAIAnswer(message));
    if (message.type === "ai-fill") respond(fillAIPage(message));
    if (message.type === "fill-saved-resume") {
      fillSavedResume(message.profileId).then(respond).catch(e => respond({ error: String(e) }));
      return true;
    }
    if (message.type === "ping") respond({ ready: true });
    if (message.type === "detect") {
      if (message.profileId) fieldMemory.selectProfile(message.profileId);
      respond({ matches: detect(message.values, message.customFieldAnswers, message.profileId, message.answerLibrary, message.customFieldAnswerKinds), scanId, url: scanUrl });
    }
    if (message.type === "fill") {
      fill(
        message.matches as Match[],
        message.confirmSensitive,
        message.scanId,
      )
        .then((res: { filled: number; errors: string[] }) => respond(res))
        .catch((err: unknown) => respond({ error: String(err) }));
      return true;
    }
    if (message.type === "inpage-fill") {
      void inpageWidget.quickFill().then(() => respond({ status: "complete" }));
      return true;
    }
    if (message.type === "inpage-open") {
      inpageWidget.togglePanel(true);
      respond({ status: "opened" });
    }
    if (message.type === "inpage-toast") {
      inpageWidget.showToast(message.message, message.toastType ?? "info");
      respond({ status: "toast-shown" });
    }
  } catch (e) {
    respond({ error: String(e) });
  }
  return false;
};
chrome.runtime.onMessage.addListener(window.applyEaseListener);
