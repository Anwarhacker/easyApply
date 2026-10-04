// src/resume-vault.ts
// Local resume document storage & file injection helper.
// Stores resume PDF/DOCX file in IndexedDB so it stays local and can be used on job forms.

export interface StoredResume {
  name: string;
  size: number;
  type: string;
  dataBase64: string; // Base64 data URL for easy download & drag-and-drop
  updatedAt: string;
}

export const MAX_RESUME_BYTES = 10 * 1024 * 1024;
export function acceptsResumeFile(file: Pick<File, "name" | "type">, accept: string): boolean {
  const options = accept.split(",").map(option => option.trim().toLowerCase()).filter(Boolean);
  return !options.length || options.some(option => option === "*/*" || (option.startsWith(".")
    ? file.name.toLowerCase().endsWith(option)
    : option.endsWith("/*") ? file.type.toLowerCase().startsWith(option.slice(0, -1)) : file.type.toLowerCase() === option));
}
const RESUME_TYPES: Record<string, string> = {
  pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain",
};
export function resumeFileType(file: Pick<File, "name" | "type" | "size">): string {
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  const type = RESUME_TYPES[extension];
  if (!type) throw new Error("Choose a PDF, DOCX, or TXT resume.");
  if (!file.size) throw new Error("This file is empty. Choose a resume with content.");
  if (file.size > MAX_RESUME_BYTES) throw new Error("Resume must be 10 MB or smaller.");
  if (file.type && file.type !== "application/octet-stream" && file.type !== type)
    throw new Error("The file type does not match its extension. Export the document again and retry.");
  return type;
}

const DB_NAME = "easyapply_vault";
const STORE_NAME = "resumes";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not supported in this environment."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function isContentScript(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof chrome !== "undefined" &&
    !!chrome.runtime?.sendMessage &&
    typeof window.location?.protocol === "string" &&
    !window.location.protocol.startsWith("chrome-extension")
  );
}

/**
 * Direct IndexedDB save
 */
export async function saveStoredResumeItemDirect(
  profileId: string,
  item: StoredResume,
): Promise<StoredResume> {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put({ id: profileId || "default", ...item });
      tx.oncomplete = () => resolve(item);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Resume saving was interrupted. Please retry."));
    });
  } finally { db.close(); }
}

/**
 * Direct IndexedDB get
 */
export async function getStoredResumeDirect(
  profileId: string,
): Promise<StoredResume | null> {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(profileId || "default");
      tx.oncomplete = () => resolve(req.result ? (req.result as StoredResume) : null);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Resume loading was interrupted. Please retry."));
    });
  } finally { db.close(); }
}

/**
 * Direct IndexedDB delete
 */
export async function deleteStoredResumeDirect(profileId: string): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(profileId || "default");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Resume deletion was interrupted. Please retry."));
    });
  } finally {
    db.close();
  }
}

/**
 * Save user's resume file into local IndexedDB (routed via runtime message if in content script)
 */
export async function saveStoredResume(
  profileId: string,
  file: File,
): Promise<StoredResume> {
  const type = resumeFileType(file);
  const normalized = new File([file], file.name, {type});
  const base64 = await fileToBase64(normalized);
  const item: StoredResume = {
    name: file.name,
    size: file.size,
    type,
    dataBase64: base64,
    updatedAt: new Date().toISOString(),
  };

  if (isContentScript()) {
    const res = await chrome.runtime.sendMessage({type:"save-stored-resume", profileId: profileId || "default", item});
    if (res?.error || !res?.item) throw new Error(res?.error || "Resume could not be saved. Please retry.");
    return item;
  }

  return saveStoredResumeItemDirect(profileId, item);
}

/**
 * Retrieve user's stored resume from local IndexedDB (routed via runtime message if in content script)
 */
export async function getStoredResume(
  profileId: string,
): Promise<StoredResume | null> {
  if (isContentScript()) {
    const res = await chrome.runtime.sendMessage({type:"get-stored-resume", profileId: profileId || "default"});
    if (!res || res.error) throw new Error(res?.error || "Resume could not be loaded. Please retry.");
    return res.resume ?? null;
  }

  return getStoredResumeDirect(profileId);
}

/**
 * Delete stored resume from local IndexedDB (routed via runtime message if in content script)
 */
export async function deleteStoredResume(profileId: string): Promise<void> {
  if (isContentScript()) {
      const response = await chrome.runtime.sendMessage({
        type: "delete-stored-resume",
        profileId: profileId || "default",
      });
      if (!response?.deleted) throw new Error(response?.error || "Unable to delete the saved resume. Please retry.");
      return;
  }

  return deleteStoredResumeDirect(profileId);
}

/**
 * Format file size in human-readable units (B, KB, MB)
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Convert Base64 Data URL to a real browser File object
 */
export function base64ToFile(
  base64DataUrl: string,
  fileName: string,
  mimeType = "application/pdf",
): File {
  const parts = base64DataUrl.split(";base64,");
  const rawBase64 = parts.length > 1 ? parts[1] : parts[0];
  const byteChars = atob(rawBase64);
  const byteArrays: Uint8Array<ArrayBuffer>[] = [];

  for (let offset = 0; offset < byteChars.length; offset += 512) {
    const slice = byteChars.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(byteNumbers));
  }

  const blob = new Blob(byteArrays as BlobPart[], { type: mimeType });
  return new File([blob], fileName, { type: mimeType, lastModified: Date.now() });
}

/**
 * Helper to convert a File to a base64 data URL
 */
export async function fileToBase64(file: File): Promise<string> {
  if (typeof FileReader !== "undefined") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return `data:${file.type || "application/pdf"};base64,${base64}`;
}

/**
 * Programmatically inject a File object into an <input type="file"> element
 * Dispatches input, change, and blur events so React/Angular/Vue frameworks register it.
 */
export function injectFileIntoInput(input: HTMLInputElement, file: File): boolean {
  try {
    if (typeof DataTransfer !== "undefined") {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;
    } else {
      Object.defineProperty(input, "files", {
        value: [file],
        configurable: true,
      });
    }

    input.dispatchEvent(new Event("focus", { bubbles: true }));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect whether an input/element is intended for resume/CV upload
 */
export function isResumeInput(signals: string[], el?: HTMLElement): boolean {
  const text = [
    ...signals,
    el?.id ?? "",
    (el as HTMLInputElement)?.name ?? "",
    el?.getAttribute?.("aria-label") ?? "",
    el?.title ?? "",
    el?.closest?.("label")?.textContent ?? "",
    el?.parentElement?.textContent ?? "",
  ]
    .join(" ")
    .replace(/[_-]+/g, " ")
    .toLowerCase();

  if (/\b(resume|cv|curriculum\s*vitae|bio\s*data)\b/i.test(text)) {
    return true;
  }
  if (
    typeof HTMLInputElement !== "undefined" &&
    el instanceof HTMLInputElement &&
    el.type === "file" &&
    typeof document !== "undefined"
  ) {
    const fileInputs = document.querySelectorAll('input[type="file"]');
    if (fileInputs.length === 1) return true;
  }
  return false;
}

/**
 * Find resume file input or dropzone target on current document
 */
export function findResumeUploadTarget(
  doc: Document = document,
): { input?: HTMLInputElement; dropzone?: HTMLElement } | null {
  const fileInputs = Array.from(
    doc.querySelectorAll<HTMLInputElement>('input[type="file"]'),
  );

  for (const input of fileInputs) {
    const text = [
      input.id,
      input.name,
      input.getAttribute("aria-label") ?? "",
      input.title,
      input.closest?.("label")?.textContent ?? "",
      input.parentElement?.textContent ?? "",
    ]
      .join(" ")
      .toLowerCase();

    if (/\b(resume|cv|curriculum\s*vitae|bio[\s-]?data)\b/i.test(text)) {
      return {
        input,
        dropzone:
          (input.closest?.(
            '[class*="dropzone"], [class*="upload"], [class*="file"]',
          ) as HTMLElement) || input,
      };
    }
  }

  if (fileInputs.length === 1) {
    const input = fileInputs[0];
    return {
      input,
      dropzone:
        (input.closest?.(
          '[class*="dropzone"], [class*="upload"], [class*="file"]',
        ) as HTMLElement) || input,
    };
  }

  const dropzones = Array.from(
    doc.querySelectorAll<HTMLElement>(
      '[class*="dropzone"], [class*="file-upload"], [class*="upload-area"], [class*="drag-drop"], [id*="dropzone"], [id*="resume"]',
    ),
  );

  for (const dz of dropzones) {
    const text = (dz.textContent ?? "").toLowerCase();
    if (/\b(resume|cv|attach|upload|drag)\b/i.test(text)) {
      const nestedInput = dz.querySelector?.('input[type="file"]') as HTMLInputElement | null;
      return { input: nestedInput || undefined, dropzone: dz };
    }
  }

  return null;
}

/**
 * Dispatch drag-and-drop events directly on a dropzone with a File
 */
export function dispatchFileDrop(target: HTMLElement, file: File): boolean {
  try {
    let dt: DataTransfer | undefined;
    if (typeof DataTransfer !== "undefined") {
      dt = new DataTransfer();
      dt.items.add(file);
    }

    const createEvent = (type: string) => {
      if (typeof DragEvent !== "undefined" && dt) {
        return new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        });
      }
      return new Event(type, { bubbles: true, cancelable: true });
    };

    target.dispatchEvent(createEvent("dragenter"));
    target.dispatchEvent(createEvent("dragover"));
    target.dispatchEvent(createEvent("drop"));

    // Also inject into nested file input if found
    const nestedInput = target.querySelector?.('input[type="file"]') as HTMLInputElement | null;
    if (nestedInput) {
      injectFileIntoInput(nestedInput, file);
    } else if (
      typeof HTMLInputElement !== "undefined" &&
      target instanceof HTMLInputElement &&
      target.type === "file"
    ) {
      injectFileIntoInput(target, file);
    }

    return true;
  } catch {
    return false;
  }
}
