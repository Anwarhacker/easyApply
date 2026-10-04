import {
  getStoredResume,
  base64ToFile,
  injectFileIntoInput,
  acceptsResumeFile,
} from "./resume-vault";
import { signals } from "./field-signals";

function normalizeUploadLabel(text: string): string {
  return text.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
}
function uploadLabel(input: HTMLInputElement): string {
  const direct =
    [...(input.labels ?? [])].map((el) => el.textContent ?? "").join(" ") +
    " " +
    [input.getAttribute("aria-label"), input.name, input.id]
      .filter(Boolean)
      .join(" ");
  if (
    /resume|curriculum|\bcv\b|photo|cover.?letter|certificate|passport/i.test(
      direct,
    )
  )
    return normalizeUploadLabel(direct);
  // Custom upload widgets commonly place their heading several wrappers above
  // a hidden input. Stop before unrelated upload fields or the entire form.
  let parent = input.parentElement;
  for (
    let depth = 0;
    parent && depth < 5;
    depth++, parent = parent.parentElement
  ) {
    if (
      parent.matches("body,html,form") ||
      parent.querySelectorAll('input[type="file"]').length !== 1
    )
      break;
    const copy = parent.cloneNode(true) as Element;
    copy
      .querySelectorAll("script,style,input,textarea,select")
      .forEach((el) => el.remove());
    const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
    const parts: string[] = [];
    while (walker.nextNode()) parts.push(walker.currentNode.textContent ?? "");
    const text = parts.join(" ").replace(/\s+/g, " ").trim();
    if (
      text.length < 1200 &&
      /resume|curriculum|\bcv\b|photo|cover.?letter|certificate|passport/i.test(
        text,
      )
    )
      return text;
  }
  return normalizeUploadLabel(signals(input).join(" "));
}
function uploadInputs(root: Document | ShadowRoot): HTMLInputElement[] {
  const inputs = [
    ...root.querySelectorAll<HTMLInputElement>('input[type="file"]'),
  ];
  for (const element of root.querySelectorAll("*"))
    if (element.shadowRoot) inputs.push(...uploadInputs(element.shadowRoot));
  return inputs;
}
export async function fillSavedResume(profileId: string) {
  const inputs = uploadInputs(document).filter((el) => {
    const text = uploadLabel(el);
    return (
      /\b(r[eé]sum[eé]|cv|curriculum\s*vitae)\b/i.test(text) &&
      !/\b(photo|cover\s*letter|certificate|marksheet|passport)\b/i.test(
        text,
      ) &&
      !el.disabled &&
      !el.matches(":disabled") &&
      !el.files?.length
    );
  });
  if (!inputs.length)
    return {
      filled: 0,
      message:
        "No empty supported Resume/CV upload input found. If the site creates it after clicking Upload File, open that upload section and scan again.",
    };
  const url = location.href;
  const stored = await getStoredResume(profileId);
  if (!stored)
    return {
      filled: 0,
      message:
        "Resume field found. Save a resume in Resume document for this profile first.",
    };
  const file = base64ToFile(stored.dataBase64, stored.name, stored.type);
  let filled = 0;
  const errors: string[] = [];
  for (const input of inputs) {
    if (
      url !== location.href ||
      !input.isConnected ||
      input.disabled ||
      input.matches(":disabled") ||
      input.files?.length
    )
      continue;
    if (!acceptsResumeFile(file, input.accept)) {
      errors.push("Saved resume format is not accepted by this field.");
      continue;
    }
    if (
      injectFileIntoInput(input, file) &&
      input.files?.[0]?.name === file.name &&
      input.files[0].size === file.size
    )
      filled++;
    else
      errors.push(
        "The website did not accept the saved resume; attach it manually.",
      );
  }
  return {
    filled,
    message:
      `${filled ? `Attached saved resume: ${stored.name}. Check the website's upload status.` : ""} ${errors.join(" ")}`.trim(),
  };
}
