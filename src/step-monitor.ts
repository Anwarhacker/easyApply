export const STEP_WINDOW_MS = 30000;
export function navigationLabel(button: Element): string {
  return button.getAttribute("aria-label")?.trim() ||
    (button.tagName.toLowerCase() === "input" ? button.getAttribute("value")?.trim() : button.textContent?.trim()) ||
    button.getAttribute("value")?.trim() || "";
}
export function isNextStepLabel(text: string): boolean {
  const label = text.toLowerCase().replace(/[→›»]/g, "").replace(/\s+/g, " ").trim();
  return /^(?:next(?: step| section| page)?|continue(?: application| to (?:next step|next section|next page|education|experience|review))?|save (?:and|&) continue)$/.test(label);
}
export function countNewFields(before: string[], after: string[]): number {
  const counts = new Map<string, number>();
  for (const key of before) counts.set(key, (counts.get(key) ?? 0) + 1);
  return after.filter(key => {
    const remaining = counts.get(key) ?? 0;
    if (remaining) { counts.set(key, remaining - 1); return false; }
    return true;
  }).length;
}

/** Watches only after a user's Next/Continue action, without scanning profile data. */
export function installStepMonitor(options: {
  readFields: (emptyOnly: boolean) => string[];
  busy: () => boolean;
  offer: (count: number) => void;
  onArm: (before: string[]) => void;
  onDone: () => void;
}) {
  let before: string[] | null = null;
  let deadline = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let stable = "", stableAt = 0;
  function stop() {
    if (timer) clearInterval(timer);
    timer = undefined;
    before = null;
  }
  function check() {
    if (!before) return;
    if (Date.now() > deadline) { stop(); options.onDone(); return; }
    if (options.busy()) return;
    const after = options.readFields(true);
    const signature = JSON.stringify([...after].sort());
    if (signature !== stable) { stable = signature; stableAt = Date.now(); return; }
    if (Date.now() - stableAt < 600) return;
    const count = countNewFields(before, after);
    if (count) { stop(); options.onDone(); options.offer(count); }
  }
  function arm(fields: string[]) {
    stop(); before = fields; deadline = Date.now() + STEP_WINDOW_MS;
    stable = ""; stableAt = 0;
    timer = setInterval(check, 300);
  }
  const click = (event: MouseEvent) => {
    if (!event.isTrusted || options.busy()) return;
    const button = event.composedPath().find(node => node instanceof Element && node.matches('button,a,[role="button"],input[type="submit"],input[type="button"]')) as HTMLElement | undefined;
    if (!button || button.closest("#easyapply-host") || button.getRootNode() instanceof ShadowRoot && (button.getRootNode() as ShadowRoot).host.id === "easyapply-host") return;
    const text = navigationLabel(button);
    if (/^(?:back|previous(?: step| section| page)?|cancel)$/i.test(text.trim())) {
      stop(); options.onDone(); return;
    }
    if (!isNextStepLabel(text) || button.getAttribute("aria-disabled") === "true" || (button as HTMLButtonElement).disabled) return;
    const fields = options.readFields(false);
    if (!fields.length) return;
    arm(fields);
    options.onArm(fields);
  };
  document.addEventListener("click", click, true);
  return { resume: arm, destroy() { stop(); document.removeEventListener("click", click, true); } };
}
