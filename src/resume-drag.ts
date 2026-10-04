import { acceptsResumeFile, injectFileIntoInput } from "./resume-vault";

/** Keep the actual file in the page context; native drags may expose only text. */
export function beginResumeDrag(file: File, report: (message: string) => void): () => void {
  let active = true;
  const cleanup = () => {
    active = false;
    document.removeEventListener("dragover", over, true);
    document.removeEventListener("drop", drop, true);
    document.removeEventListener("dragend", cleanup, true);
    window.removeEventListener("pagehide", cleanup);
  };
  const targetOf = (event: DragEvent) => event.composedPath().find(node => node instanceof HTMLElement) as HTMLElement | undefined;
  const outsideWidget = (target?: HTMLElement) => target && !(target.getRootNode() instanceof ShadowRoot && (target.getRootNode() as ShadowRoot).host.id === "easyapply-host");
  const over = (event: DragEvent) => {
    if (!active || !outsideWidget(targetOf(event))) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  };
  const drop = (event: DragEvent) => {
    const target = targetOf(event);
    if (!active || !target || !outsideWidget(target)) return;
    cleanup();
    event.preventDefault();
    event.stopImmediatePropagation();
    let input: HTMLInputElement | null = target instanceof HTMLInputElement && target.type === "file" ? target : null;
    const label = target.closest("label");
    if (!input && label?.control instanceof HTMLInputElement && label.control.type === "file") input = label.control;
    let parent: HTMLElement | null = target;
    for (let depth = 0; !input && parent && depth < 4 && !parent.matches("form,body,html"); depth++, parent = parent.parentElement) {
      const inputs = parent.querySelectorAll<HTMLInputElement>('input[type="file"]');
      if (inputs.length === 1) input = inputs[0];
      if (inputs.length > 1) break;
    }
    if (input) {
      if (input.matches(":disabled") || input.files?.length) { report("This upload field is disabled or already has a file. Your existing attachment was kept."); return; }
      if (!acceptsResumeFile(file, input.accept)) { report("This field does not accept your resume's file format. Download a supported version and choose it manually."); return; }
      const success = injectFileIntoInput(input, file) && input.files?.[0]?.name === file.name && input.files[0].size === file.size;
      report(success ? `Attached ${file.name}. Check the website's upload status.` : "The site rejected the attachment. Download the resume and use Choose file.");
      return;
    }
    const transfer = new DataTransfer();
    transfer.items.add(file);
    for (const type of ["dragenter", "dragover", "drop"]) target.dispatchEvent(new DragEvent(type, { bubbles: true, composed: true, cancelable: true, dataTransfer: transfer }));
    report("Resume delivered to this area. Check the website's upload status; if no file appears, download it and use Choose file.");
  };
  document.addEventListener("dragover", over, true);
  document.addEventListener("drop", drop, true);
  document.addEventListener("dragend", cleanup, true);
  window.addEventListener("pagehide", cleanup);
  return cleanup;
}
