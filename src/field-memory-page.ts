import { memoryCandidateSchema, questionKey, safeMemoryQuestion, sensitiveMemoryQuestion } from "./field-memory";
import { signals } from "./field-signals";
import { matchField } from "./matching";

export function memoryQuestion(el: Element): string {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return "";
  if (el.disabled || (el instanceof HTMLInputElement && !["text", "search", "url", "number"].includes(el.type)) || ("readOnly" in el && el.readOnly)) return "";
  const hints = signals(el);
  if (matchField(hints)) return "";
  // Any sensitive surrounding hint blocks learning, even if the short label looks innocuous.
  if (hints.some(sensitiveMemoryQuestion)) return "";
  const labelledBy = (el.getAttribute("aria-labelledby") ?? "").split(/\s+/).map(id => document.getElementById(id)?.textContent ?? "").join(" ").trim();
  const label = ((el.labels?.length ? hints[0] : null) ?? el.getAttribute("aria-label") ?? (labelledBy || el.getAttribute("placeholder")) ?? "").trim();
  return safeMemoryQuestion(label) ? label : "";
}
export function installFieldMemory() {
  let profileId = "";
  const edited = new Map<Element, {question: string; answer: string}>();
  const offered = new Set<string>();
  let host: HTMLElement | null = null;
  let active = true;
  let showing = false;
  let staging = false;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let notice: HTMLElement | null = null;
  const notify = (text: string, error = false) => {
    notice?.remove();
    const node = document.createElement("div");
    node.id = "easyapply-learning-status";
    node.setAttribute("role", error ? "alert" : "status");
    node.style.cssText = "position:fixed;bottom:24px;right:20px;z-index:2147483647;background:#fff;color:#134e4a;padding:12px 16px;border:1px solid #99d5d0;border-radius:10px;max-width:340px;font:14px/1.5 system-ui;";
    node.textContent = text; document.documentElement.append(node); notice = node;
    setTimeout(() => { node.remove(); if (notice === node) notice = null; }, 5000);
  };
  const answerOf = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => el instanceof HTMLSelectElement ? el.selectedOptions[0]?.text ?? "" : el.value;
  const processNext = async (allowFocused = false) => {
    if (!active || !profileId || showing || staging) return;
    const selectedProfile = profileId, version = generation;
    for (const [element, manual] of edited) {
      const el = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      if ((!allowFocused && document.activeElement === el) || !el.isConnected || !el.getClientRects().length || !el.validity.valid || el.getAttribute("aria-invalid") === "true" || memoryQuestion(el) !== manual.question || answerOf(el) !== manual.answer) continue;
      if (el instanceof HTMLSelectElement && (!el.value || el.selectedOptions[0]?.disabled)) continue;
      const candidate = memoryCandidateSchema.safeParse(manual);
      const key = questionKey(manual.question) + "\n" + manual.answer;
      if (!candidate.success || offered.has(key)) continue;
      staging = true;
      try {
        const result = await chrome.runtime.sendMessage({type:"memory-stage",profileId:selectedProfile,candidate:candidate.data});
        if (!active || version !== generation) return;
        if (result?.error) throw Error(result.error);
        offered.add(key); if (edited.get(element) === manual) edited.delete(element);
        if (result?.saved) notify(`Learned “${manual.question}” for ${result.title}. It will be offered on matching questions next time.`);
        else show(result);
      } catch (error) {
        if (active && version === generation) notify(error instanceof Error ? error.message : "Answer was not saved. Please retry.", true);
        return;
      } finally { staging = false; }
      if (!showing) schedule();
      return;
    }
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { void processNext(); }, 350); };
  const show = (response: { candidate?: {question: string; answer: string}; profileId?: string; title?: string }) => {
    if (!active || !response.candidate || !response.profileId || showing) return;
    const candidate = response.candidate;
    const targetProfile = response.profileId;
    const shownGeneration = generation;
    showing = true;
    host = document.createElement("div"); host.id = "easyapply-memory-host";
    host.style.cssText = "position:fixed;bottom:80px;right:20px;z-index:2147483647;max-width:calc(100vw - 40px);";
    const root = host.attachShadow({mode:"open"});
    const box = document.createElement("section"); box.setAttribute("role","status");
    box.style.cssText = "font:14px/1.5 system-ui;background:white;color:#172338;padding:16px;border:1px solid #99d5d0;border-radius:12px;box-shadow:0 8px 32px #0003;width:340px;max-width:calc(100vw - 74px);";
    const message = document.createElement("p"); message.textContent = `Save your answer for “${candidate.question}” to ${response.title ?? "your profile"}?`;
    const preview = document.createElement("p"); preview.textContent = candidate.answer; preview.style.cssText = "max-height:90px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:#f0fdfa;padding:8px;";
    box.append(message, preview);
    for (const action of ["Save", "Dismiss"]) {
      const button = document.createElement("button"); button.textContent = action; button.type = "button";
      button.style.cssText = "padding:8px 14px;margin-right:8px;border:1px solid #0f766e;border-radius:6px;background:white;color:#115e59;cursor:pointer;";
      button.onclick = async event => {
        if (!event.isTrusted) return;
        box.querySelectorAll("button").forEach(b => b.disabled = true);
        try {
          const result = await chrome.runtime.sendMessage({type:action === "Save" ? "memory-save" : "memory-dismiss", profileId:targetProfile, ...candidate});
          if (!active || generation !== shownGeneration) return;
          if (result?.error) throw Error(result.error);
          host?.remove(); host = null; showing = false;
          if (action === "Save") notify(`Answer saved for ${response.title ?? "your profile"}.`);
          schedule();
        } catch (error) { message.textContent = error instanceof Error ? error.message : "Please retry."; box.querySelectorAll("button").forEach(b => b.disabled = false); }
      };
      box.append(button);
    }
    root.append(box); document.documentElement.append(host);
  };
  const selectProfile = (id: string) => {
    if (profileId !== id) { generation++; clearTimeout(timer); edited.clear(); offered.clear(); host?.remove(); host = null; showing = false; notice?.remove(); }
    profileId = id;
    if (id) { const version = generation; void chrome.runtime.sendMessage({type:"memory-pending",profileId:id}).then(result => { if (active && version === generation) show(result); }).catch(() => {}); }
  };
  void chrome.runtime.sendMessage({type:"get-profiles"}).then(result => { if (active && !profileId) selectProfile(result.activeProfileId ?? ""); }).catch(() => {});
  const onInput = (event: Event) => {
    if (!event.isTrusted || !profileId) return;
    const el = event.composedPath()[0];
    if (!(el instanceof Element)) return;
    const question = memoryQuestion(el);
    if (question && el.getAttribute("role") !== "combobox" && !(el instanceof HTMLSelectElement && el.multiple)) {
      const control = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      const answer = control instanceof HTMLSelectElement ? control.selectedOptions[0]?.text ?? "" : control.value;
      edited.set(el, {question,answer});
    }
    else edited.delete(el);
    if (edited.size > 30) edited.delete(edited.keys().next().value!);
  };
  const onBlur = (event: FocusEvent) => {
    if (!event.isTrusted) return;
    if (edited.has(event.composedPath()[0] as Element)) schedule();
  };
  const onSubmit = (event: SubmitEvent) => {
    if (event.isTrusted && profileId) { clearTimeout(timer); void processNext(true); }
  };
  document.addEventListener("input", onInput, true);
  document.addEventListener("change", onInput, true);
  document.addEventListener("submit", onSubmit, true);
  document.addEventListener("focusout", onBlur, true);
  return { selectProfile, destroy() {active=false;generation++;clearTimeout(timer);notice?.remove();host?.remove();document.removeEventListener("focusout",onBlur,true);document.removeEventListener("input",onInput,true);document.removeEventListener("change",onInput,true);document.removeEventListener("submit",onSubmit,true);} };
}
