import { beginResumeDrag } from "./resume-drag";
import { fillSavedResume } from "./resume-page";
import type { Profile, Match } from "./model";
import {
  getStoredResume,
  saveStoredResume,
  base64ToFile,
  formatFileSize,
  type StoredResume,
} from "./resume-vault";

import { matchStatus } from "./fill-insights";
import { readJobContext, suggestProfiles, type ProfileSuggestion } from "./job-suggestions";

export interface InPageWidgetOptions {
  onScan: (profile: Profile) => Match[];
  onFill: (
    matches: Match[],
    scanId: string,
  ) => Promise<{ filled: number; errors: string[] }> | { filled: number; errors: string[] };
  onRequestProfiles: () => Promise<{ profiles: Profile[]; activeProfileId: string }>;
  onSelectProfile: (id: string) => Promise<void>;
}

export class InPageWidget {
  private stopResumeDrag?: () => void;
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private container: HTMLDivElement | null = null;
  private panelContainer: HTMLDivElement | null = null;
  private toastContainer: HTMLDivElement | null = null;
  private options: InPageWidgetOptions;
  private profiles: Profile[] = [];
  private selectedProfileId: string = "";
  private currentResume: StoredResume | null = null;
  private isOpen: boolean = false;
  private isScanning: boolean = false;
  private lastReport: { filled: number | null; preserved: number; items: string[] } | null = null;
  private isSelecting: boolean = false;
  private newStepCount = 0;
  public isBusy() { return this.isScanning || this.isSelecting; }
  public offerNewStep(count: number) {
    this.newStepCount = count;
    this.lastReport = null;
    this.togglePanel(true);
  }
  private suggestionsOpen = false;
  private suggesting = false;
  private jobTitle = "";
  private jobDescription = "";
  private suggestions: ProfileSuggestion[] = [];
  private suggestionResumes = new Map<string, string | null>();
  private suggestionMessage = "";
  private posX: number | null = null;
  private posY: number | null = null;
  private hasDragged: boolean = false;

  constructor(options: InPageWidgetOptions) {
    this.options = options;
  }

  public init() {
    if (typeof document === "undefined") return;
    if (document.getElementById("easyapply-host")) return;

    this.host = document.createElement("div");
    this.host.id = "easyapply-host";
    this.host.style.position = "fixed";
    this.host.style.zIndex = "2147483647";
    this.host.style.bottom = "24px";
    this.host.style.right = "24px";
    this.host.style.pointerEvents = "none";

    this.loadSavedPosition();

    this.shadow = this.host.attachShadow({ mode: "open" });

    // Injected styles inside Shadow DOM for complete CSS isolation
    const style = document.createElement("style");
    style.textContent = `
      .ea-job-suggestions { padding: 12px; border: 1px solid #838ba8; border-radius: 8px; background: #f8fafc; font-size: 12px; color: #334155; line-height: 1.5; }
      .ea-job-suggestions label { display: block; margin: 8px 0; font-weight: 600; }
      .ea-job-suggestions input, .ea-job-suggestions textarea { display: block; width: 100%; border: 1px solid #868d94; border-radius: 8px; padding: 7px; margin-top: 4px; background: white; color: #0f172a; font: inherit; }
      .ea-job-suggestions textarea { min-height: 85px; resize: vertical; }
      .ea-job-candidate { padding-top: 10px; margin-top: 10px; border-top: 1px solid #868d94; overflow-wrap: anywhere; }
      .ea-job-candidate p { margin: 5px 0; }
      .ea-report { margin-top: 14px; padding: 14px; background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px; color: #134e4a; font-size: 12px; line-height: 1.6; }
      .ea-report h3 { font-size: 14px; margin-bottom: 4px; }
      .ea-report ul { padding-left: 18px; max-height: 145px; overflow-y: auto; margin-top: 8px; }
      .ea-report li { margin: 6px 0; overflow-wrap: anywhere; }
      .ea-progress { padding: 12px; color: #115e59; font-size: 12px; line-height: 1.6; background: #f0fdfa; border-radius: 8px; margin-top: 12px; }
      *, *::before, *::after {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      .ea-wrapper {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 13px;
        line-height: 1.4;
        color: #1e293b;
        pointer-events: auto;
        user-select: none;
        position: relative;
      }
      .ea-fab {
        display: flex;
        align-items: center;
        gap: 8px;
        background: linear-gradient(135deg, #4f46e5, #7c3aed);
        color: #ffffff;
        border: none;
        border-radius: 8px;
        padding: 10px 18px;
        font-size: 13px;
        font-weight: 600;
        cursor: grab;
        touch-action: none;
        user-select: none;
        box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35), 0 2px 6px rgba(0, 0, 0, 0.1);
        transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.15s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .ea-fab:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(79, 70, 229, 0.45), 0 2px 8px rgba(0, 0, 0, 0.15);
      }
      .ea-fab:active {
        transform: translateY(0);
      }
      .ea-fab.ea-dragging {
        cursor: grabbing;
        transform: scale(1.03);
        box-shadow: 0 8px 24px rgba(79, 70, 229, 0.55), 0 4px 12px rgba(0, 0, 0, 0.2);
      }
      .ea-drag-grip {
        display: inline-flex;
        align-items: center;
        opacity: 0.65;
        margin-right: -2px;
        cursor: grab;
      }
      .ea-badge {
        background: #ffffff;
        color: #4f46e5;
        border-radius: 8px;
        padding: 2px 7px;
        font-size: 11px;
        font-weight: 700;
      }
      .ea-panel {
        position: absolute;
        bottom: calc(100% + 12px);
        right: 0;
        width: 320px;
        max-width: calc(100vw - 32px);
        max-height: calc(100vh - 110px);
        overflow-y: auto;
        background: #ffffff;
        border-radius: 8px;
        box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18), 0 2px 8px rgba(0, 0, 0, 0.06);
        border: 1px solid #95999e;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        animation: eaFadeUp 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .ea-panel.ea-panel-below {
        bottom: auto;
        top: calc(100% + 12px);
      }
      .ea-panel.ea-panel-left {
        right: auto;
        left: 0;
      }
      @keyframes eaFadeUp {
        from {
          opacity: 0;
          transform: translateY(8px) scale(0.98);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      .ea-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid #9fa2a4;
        padding-bottom: 10px;
      }
      .ea-title {
        font-size: 14px;
        font-weight: 700;
        color: #0f172a;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .ea-title span {
        color: #4f46e5;
      }
      .ea-close-btn {
        background: none;
        border: none;
        color: #64748b;
        cursor: pointer;
        padding: 4px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .ea-close-btn:hover {
        background: #f1f5f9;
        color: #0f172a;
      }
      .ea-select-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .ea-label {
        font-size: 11px;
        font-weight: 600;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .ea-select {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #868d94;
        border-radius: 8px;
        background: #f8fafc;
        color: #0f172a;
        font-size: 13px;
        outline: none;
      }
      .ea-select:focus {
        border-color: #6366f1;
        background: #ffffff;
      }
      .ea-status {
        font-size: 12px;
        color: #475569;
        background: #f8fafc;
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid #9fa2a4;
      }
      .ea-resume-section {
        display: flex;
        flex-direction: column;
        gap: 6px;
        background: #f8fafc;
        border: 1px solid #95999e;
        border-radius: 8px;
        padding: 10px;
      }
      .ea-resume-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .ea-resume-badge {
        font-size: 10px;
        font-weight: 700;
        color: #059669;
        background: #ecfdf5;
        border: 1px solid #6ea089;
        padding: 2px 6px;
        border-radius: 8px;
      }
      .ea-resume-box {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        background: #ffffff;
        border: 1px solid #95999e;
        border-radius: 8px;
        padding: 8px 10px;
      }
      .ea-resume-left {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        flex: 1;
      }
      .ea-resume-icon {
        font-size: 18px;
        flex-shrink: 0;
      }
      .ea-resume-text {
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .ea-resume-name {
        font-size: 12px;
        font-weight: 600;
        color: #0f172a;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .ea-resume-size {
        font-size: 10px;
        color: #64748b;
      }
      .ea-resume-btns {
        display: flex;
        align-items: center;
        gap: 5px;
        flex-shrink: 0;
      }
      .ea-drag-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        background: #eef2ff;
        color: #4f46e5;
        border: 1px dashed #6366f1;
        border-radius: 8px;
        font-size: 11px;
        font-weight: 700;
        cursor: grab;
        user-select: none;
        touch-action: none;
      }
      .ea-drag-chip:hover {
        background: #e0e7ff;
      }
      .ea-drag-chip:active {
        cursor: grabbing;
      }
      .ea-attach-btn {
        background: #f1f5f9;
        border: 1px solid #868d94;
        color: #334155;
        border-radius: 8px;
        padding: 4px 8px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s;
      }
      .ea-attach-btn:hover {
        background: #e2e8f0;
        color: #0f172a;
      }
      .ea-resume-empty {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
        color: #64748b;
        padding: 8px;
      }
      .ea-resume-upload-label {
        color: #4f46e5;
        font-weight: 600;
        font-size: 11px;
        cursor: pointer;
        padding: 3px 8px;
        background: #eef2ff;
        border-radius: 8px;
        border: 1px solid #838ba8;
      }
      .ea-resume-upload-label:hover {
        background: #e0e7ff;
      }
      .ea-actions {
        display: flex;
        gap: 8px;
      }
      .ea-btn {
        flex: 1;
        padding: 9px 12px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        border: none;
        text-align: center;
        transition: background 0.15s;
      }
      .ea-btn-primary {
        background: #4f46e5;
        color: #ffffff;
      }
      .ea-btn-primary:hover:not(:disabled) {
        background: #4338ca;
      }
      .ea-btn-secondary {
        background: #f1f5f9;
        color: #334155;
      }
      .ea-btn-secondary:hover:not(:disabled) {
        background: #e2e8f0;
      }
      .ea-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .ea-toast {
        position: absolute;
        bottom: calc(100% + 12px);
        right: 0;
        background: #1e293b;
        color: #ffffff;
        padding: 10px 16px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 500;
        box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        white-space: nowrap;
        animation: eaFadeUp 0.2s ease;
      }
      .ea-toast.ea-toast-success {
        background: #065f46;
      }
      .ea-toast.ea-toast-error {
        background: #991b1b;
      }
      .ea-toast.ea-panel-below {
        bottom: auto;
        top: calc(100% + 12px);
      }
      .ea-toast.ea-panel-left {
        right: auto;
        left: 0;
      }
      .ea-toast-action {
        margin-left: 10px;
        background: #ffffff;
        color: #065f46;
        border: none;
        border-radius: 8px;
        padding: 3px 8px;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        transition: opacity 0.15s, transform 0.1s;
      }
      .ea-toast-action:hover {
        opacity: 0.92;
        transform: scale(1.02);
      }
      .ea-shortcut {
        font-size: 10px;
        color: #94a3b8;
        text-align: center;
      }
      .ea-prompt-card {
        position: absolute;
        bottom: calc(100% + 14px);
        right: 0;
        width: 330px;
        background: #ffffff;
        border-radius: 8px;
        box-shadow: 0 16px 36px rgba(15, 23, 42, 0.22), 0 2px 10px rgba(0, 0, 0, 0.08);
        border: 1px solid #868d94;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        animation: eaFadeUp 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 100;
      }
      .ea-prompt-card.ea-panel-below {
        bottom: auto;
        top: calc(100% + 14px);
      }
      .ea-prompt-card.ea-panel-left {
        right: auto;
        left: 0;
      }
      .ea-prompt-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .ea-prompt-badge {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: 700;
        color: #0f766e;
        background: #f0fdfa;
        padding: 3px 8px;
        border-radius: 8px;
        border: 1px solid #87a69f;
      }
      .ea-prompt-body {
        font-size: 13px;
        color: #1e293b;
        line-height: 1.45;
      }
      .ea-prompt-inputs {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .ea-prompt-input {
        width: 100%;
        padding: 6px 10px;
        font-size: 12px;
        border: 1px solid #868d94;
        border-radius: 8px;
        background: #f8fafc;
        color: #0f172a;
        outline: none;
      }
      .ea-prompt-input:focus {
        border-color: #0f766e;
        background: #ffffff;
      }
      .ea-prompt-actions {
        display: flex;
        gap: 8px;
        margin-top: 4px;
      }
    `;

    style.textContent += `
      .ea-panel { padding: 16px; gap: 16px; }
      .ea-header { padding-bottom: 12px; gap: 12px; }
      .ea-resume-box { padding: 12px; gap: 12px; flex-wrap: wrap; }
      .ea-resume-btns { gap: 8px; flex-wrap: wrap; }
      .ea-actions, .ea-prompt-actions { gap: 8px; }
      .ea-btn { padding: 9px 12px; min-height: 36px; }
      .ea-prompt-inputs { gap: 10px; }
      .ea-prompt-input { padding: 9px 10px; min-height: 36px; }
    `;
    style.textContent += `
      .ea-panel, .ea-prompt-card { border: 1px solid #475569; }
      .ea-resume-box, .ea-job-suggestions { border: 1px solid #64748b; }
      .ea-header { border-bottom-color: #94a3b8; }
      .ea-prompt-input, .ea-select, .ea-btn-secondary { border: 1px solid #52657c; }
      .ea-prompt-input:focus, .ea-select:focus-visible { border-color: #0f766e; outline: 2px solid #0f766e; outline-offset: 2px; }
      .ea-btn:focus-visible, .ea-attach-btn:focus-visible, .ea-drag-chip:focus-visible { outline: 2px solid #0f766e; outline-offset: 2px; }
    `;
    style.textContent += `
      .ea-panel, .ea-prompt-card { border-radius: 16px; }
      .ea-resume-box, .ea-job-suggestions { border-radius: 12px; }
      .ea-fab, .ea-badge, .ea-resume-badge { border-radius: 999px; }
    `;
    this.shadow.appendChild(style);

    this.container = document.createElement("div");
    this.container.className = "ea-wrapper";

    this.panelContainer = document.createElement("div");
    this.toastContainer = document.createElement("div");

    this.container.appendChild(this.panelContainer);
    this.container.appendChild(this.toastContainer);
    this.shadow.appendChild(this.container);

    if (document.body) {
      document.body.appendChild(this.host);
    } else {
      document.addEventListener("DOMContentLoaded", () => {
        document.body.appendChild(this.host!);
      });
    }

    this.render();
    this.bindKeyboardShortcuts();
  }

  private bindKeyboardShortcuts() {
    window.addEventListener("keydown", this.onKeyDown);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    // Quick Fill is a Chrome command, so it also works before injection.
    if (e.key === "Escape" && this.isOpen) {
      this.isOpen = false;
      this.render();
    }
  };

  public async loadProfiles() {
    const data = await this.options.onRequestProfiles();
    this.profiles = data.profiles;
    this.selectedProfileId = data.activeProfileId;
    try {
      this.currentResume = await getStoredResume(this.selectedProfileId);
    } catch {
      this.currentResume = null;
    }
    this.render();
  }

  public togglePanel(open?: boolean) {
    this.isOpen = open !== undefined ? open : !this.isOpen;
    if (this.isOpen) {
      void this.loadProfiles().catch(() => {
        this.profiles = [];
        this.selectedProfileId = "";
        this.render();
        this.showToast("Unable to load profiles. Open easyApply Settings and try again.", "error");
      });
    }
    this.render();
  }

  private async selectProfile(id: string) {
    if (this.isSelecting || this.isScanning) return;
    this.isSelecting = true;
    this.render();
    try {
      await this.options.onSelectProfile(id);
      this.selectedProfileId = id;
      this.lastReport = null;
      try { this.currentResume = await getStoredResume(id); }
      catch { this.currentResume = null; }
    } catch {
      this.showToast("Unable to save profile selection. Try again.", "error");
    } finally {
      this.isSelecting = false;
      this.render();
    }
  }

  private async compareProfiles() {
    if (this.suggesting) return;
    this.suggesting = true;
    this.suggestions = [];
    this.suggestionMessage = "Comparing saved roles and skills…";
    this.render();
    try {
      const data = await this.options.onRequestProfiles();
      this.profiles = data.profiles;
      this.suggestions = suggestProfiles({title:this.jobTitle, description:this.jobDescription}, this.profiles);
      const resumes = await Promise.all(this.suggestions.map(async s => {
        try { return [s.profileId, (await getStoredResume(s.profileId))?.name ?? null] as const; }
        catch { return [s.profileId, null] as const; }
      }));
      this.suggestionResumes = new Map(resumes);
      this.suggestionMessage = this.suggestions.length
        ? "Matched saved roles and skills. Resume suggestions use each profile’s attached file; file contents are not analyzed."
        : "No clear match. Paste the job description, or add role and skill details to your saved profiles.";
    } catch {
      this.suggestions = [];
      this.suggestionMessage = "Could not load saved profiles. Try comparing again.";
    } finally {
      this.suggesting = false;
      this.render();
    }
  }

  private loadSavedPosition() {
    try {
      const raw =
        typeof window !== "undefined" && window.localStorage
          ? window.localStorage.getItem("easyapply_widget_pos")
          : null;
      if (raw) {
        const parsed = JSON.parse(raw) as { x?: number; y?: number };
        if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
          this.applyPosition(parsed.x, parsed.y, false);
        }
      }
    } catch {
      // Storage unavailable or disabled
    }
  }

  public applyPosition(x: number, y: number, save = true) {
    const vw =
      typeof window !== "undefined" && window.innerWidth
        ? window.innerWidth
        : 1024;
    const vh =
      typeof window !== "undefined" && window.innerHeight
        ? window.innerHeight
        : 768;
    const w = this.host?.offsetWidth || 130;
    const h = this.host?.offsetHeight || 44;
    const clampedX = Math.max(10, Math.min(vw - w - 10, x));
    const clampedY = Math.max(10, Math.min(vh - h - 10, y));

    this.posX = clampedX;
    this.posY = clampedY;

    if (this.host) {
      this.host.style.bottom = "auto";
      this.host.style.right = "auto";
      this.host.style.left = `${clampedX}px`;
      this.host.style.top = `${clampedY}px`;
    }

    if (save) {
      this.savePosition();
    }
  }

  private savePosition() {
    if (this.posX === null || this.posY === null) return;
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(
          "easyapply_widget_pos",
          JSON.stringify({ x: this.posX, y: this.posY }),
        );
      }
    } catch {
      // Ignore storage write issues
    }
  }

  public showToast(
    message: string,
    type: "info" | "success" | "error" = "info",
    action?: { label: string; onClick: () => void },
  ) {
    if (!this.toastContainer) return;
    const existing = this.toastContainer.querySelector(".ea-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className =
      `ea-toast ea-toast-${type}` +
      (this.posY !== null && this.posY < 380 ? " ea-panel-below" : "") +
      (this.posX !== null && this.posX < 340 ? " ea-panel-left" : "");
    toast.textContent = message;

    if (action) {
      const actionBtn = document.createElement("button");
      actionBtn.type = "button";
      actionBtn.className = "ea-toast-action";
      actionBtn.textContent = action.label;
      actionBtn.onclick = (e) => {
        e.stopPropagation();
        toast.remove();
        action.onClick();
      };
      toast.appendChild(actionBtn);
    }

    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, action ? 6500 : 3200);
  }

  public showTrackPrompt(
    details: { company: string; position: string },
    onConfirm: (data: { company: string; position: string }) => void | Promise<void>
  ) {
    if (!this.container) return;
    const existing = this.container.querySelector(".ea-prompt-card");
    if (existing) existing.remove();

    const company = details.company;
    const position = details.position;

    const promptCard = document.createElement("div");
    promptCard.className =
      "ea-prompt-card" +
      (this.posY !== null && this.posY < 380 ? " ea-panel-below" : "") +
      (this.posX !== null && this.posX < 340 ? " ea-panel-left" : "");

    const header = document.createElement("div");
    header.className = "ea-prompt-header";

    const badge = document.createElement("div");
    badge.className = "ea-prompt-badge";
    badge.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> easyApply Tracker`;

    const closeBtn = document.createElement("button");
    closeBtn.className = "ea-close-btn";
    closeBtn.setAttribute("type", "button");
    closeBtn.setAttribute("aria-label", "Dismiss");
    closeBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    const dismissBtn = document.createElement("button");
    dismissBtn.className = "ea-btn ea-btn-secondary";
    dismissBtn.setAttribute("type", "button");
    dismissBtn.textContent = "Dismiss";

    const confirmBtn = document.createElement("button");
    confirmBtn.className = "ea-btn ea-btn-primary";
    confirmBtn.setAttribute("type", "button");
    confirmBtn.textContent = "Save to Tracker";

    header.appendChild(badge);
    header.appendChild(closeBtn);
    promptCard.appendChild(header);

    const body = document.createElement("div");
    body.className = "ea-prompt-body";
    body.textContent = "A submit action was detected. Check that the website accepted your application before saving it as Applied.";
    promptCard.appendChild(body);

    const inputs = document.createElement("div");
    inputs.className = "ea-prompt-inputs";

    const companyInput = document.createElement("input");
    companyInput.className = "ea-prompt-input";
    companyInput.value = company;
    companyInput.placeholder = "Company name";
    companyInput.setAttribute("aria-label", "Company name"); companyInput.maxLength = 200;

    const positionInput = document.createElement("input");
    positionInput.className = "ea-prompt-input";
    positionInput.value = position;
    positionInput.placeholder = "Position / Role";
    positionInput.setAttribute("aria-label", "Position / Role"); positionInput.maxLength = 200;

    inputs.appendChild(companyInput);
    inputs.appendChild(positionInput);
    promptCard.appendChild(inputs);
    const confirmation = document.createElement("label");
    confirmation.style.cssText = "display:flex;align-items:flex-start;gap:8px;margin:12px 0;font-size:12px;line-height:1.5;";
    const accepted = document.createElement("input"); accepted.type = "checkbox";
    confirmation.append(accepted, document.createTextNode("I confirmed that the website accepted my application."));
    promptCard.append(confirmation);
    const failure = document.createElement("p"); failure.setAttribute("role", "alert");
    failure.style.cssText = "font-size:12px;color:#b42318;"; promptCard.append(failure);
    let saving = false;
    const validate = () => { confirmBtn.disabled = saving || !accepted.checked || !companyInput.value.trim() || !positionInput.value.trim(); };
    accepted.onchange = validate; companyInput.oninput = validate; positionInput.oninput = validate; validate();

    const actions = document.createElement("div");
    actions.className = "ea-prompt-actions";
    actions.appendChild(dismissBtn);
    actions.appendChild(confirmBtn);
    promptCard.appendChild(actions);

    const dismiss = () => {
      promptCard.remove();
    };

    closeBtn.onclick = (e) => {
      e.stopPropagation();
      dismiss();
    };
    dismissBtn.onclick = (e) => {
      e.stopPropagation();
      dismiss();
    };
    confirmBtn.onclick = async (e) => {
      e.stopPropagation();
      if (saving || !accepted.checked || !companyInput.value.trim() || !positionInput.value.trim()) return;
      saving = true; validate(); failure.textContent = "";
      closeBtn.disabled = dismissBtn.disabled = companyInput.disabled = positionInput.disabled = accepted.disabled = true;
      try { await onConfirm({ company: companyInput.value.trim(), position: positionInput.value.trim() }); dismiss(); }
      catch (error) { failure.textContent = error instanceof Error ? error.message : "Could not save. Please retry."; }
      finally { saving = false; closeBtn.disabled = dismissBtn.disabled = companyInput.disabled = positionInput.disabled = accepted.disabled = false; validate(); }
    };

    this.container.appendChild(promptCard);

  }

  public async quickFill(profileOverride?: Profile) {
    if (this.isScanning || this.isSelecting) return;
    this.isScanning = true;
    this.newStepCount = 0;
    this.lastReport = null;
    this.render();

    try {
      let targetProfile = profileOverride;
      if (!targetProfile) {
        // Read on every fill so other tabs, edits, and deleted profiles are respected.
        await this.loadProfiles();
        targetProfile = this.profiles.find((p) => p.id === this.selectedProfileId);
      }

      if (!targetProfile) {
        this.showToast("Choose a saved profile in easyApply Settings or the Quick Fill panel first.", "error");
        return;
      }

      const matches = this.options.onScan(targetProfile);
      const fillable = matches.filter((m) => m.selected);
      const remaining = matches.filter(m => !m.selected && matchStatus(m) !== "preserved").map(m => `${m.label}: ${m.reason || (m.kind === "file" ? "Attach this document manually" : "Add an answer to your profile or complete this field on the page")}`);
      this.lastReport = { filled: 0, preserved: matches.filter(m => matchStatus(m) === "preserved").length, items: remaining };

      if (!fillable.length) {
        const reasons = [...new Set(matches.map(m => m.reason).filter(Boolean))].slice(0, 3);
        this.showToast(reasons.join(". ") || "No eligible empty fields found to fill.", "info");
        return;
      }

      const scanToken = (window as unknown as { easyApplyScanId?: string }).easyApplyScanId || "";
      const result = await this.options.onFill(matches, scanToken);
      this.lastReport = { ...this.lastReport, filled: result.filled, items: [...result.errors, ...remaining] };

      if (result.errors.length) {
        this.showToast(`Filled ${result.filled} fields; ${result.errors.length} need review. ${result.errors[0]}`, "error");
      } else if (result.filled > 0) {
        const skipped = matches.filter(m => !m.selected && m.kind !== "file").length;
        this.showToast(`Filled ${result.filled} field${result.filled === 1 ? "" : "s"}.${skipped ? ` ${skipped} skipped; open Quick Fill for details.` : " Review before submitting."}`, "success");
      } else {
        this.showToast("No fields updated.", "info");
      }
    } catch (e) {
      this.lastReport = { filled: null, preserved: 0, items: [`Fill interrupted: ${e instanceof Error ? e.message : String(e)}. Review the page before retrying.`] };
      this.showToast(`Error: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      this.isScanning = false;
      this.isOpen = false;
      this.render();
    }
  }

  public render() {
    if (!this.panelContainer) return;
    this.panelContainer.innerHTML = "";

    // FAB Button
    const fab = document.createElement("button");
    fab.className = "ea-fab";
    fab.setAttribute("aria-label", "easyApply Quick Fill");
    fab.setAttribute("type", "button");

    const dragGrip = document.createElement("span");
    dragGrip.className = "ea-drag-grip";
    dragGrip.setAttribute("title", "Drag to move widget");
    dragGrip.innerHTML = `<svg width="10" height="14" viewBox="0 0 10 16" fill="currentColor"><circle cx="2.5" cy="3" r="1.5"/><circle cx="7.5" cy="3" r="1.5"/><circle cx="2.5" cy="8" r="1.5"/><circle cx="7.5" cy="8" r="1.5"/><circle cx="2.5" cy="13" r="1.5"/><circle cx="7.5" cy="13" r="1.5"/></svg>`;

    const icon = document.createElement("span");
    icon.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;

    const label = document.createElement("span");
    label.textContent = this.isScanning ? "Filling…" : "easyApply";
    fab.setAttribute("aria-busy", String(this.isScanning));

    fab.appendChild(dragGrip);
    fab.appendChild(icon);
    fab.appendChild(label);

    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    let moved = false;

    fab.onpointerdown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      startX = e.clientX;
      startY = e.clientY;
      moved = false;

      const rect = this.host?.getBoundingClientRect?.() ?? {
        left: this.posX ?? 0,
        top: this.posY ?? 0,
      };
      initialLeft = rect.left;
      initialTop = rect.top;

      try {
        fab.setPointerCapture?.(e.pointerId);
      } catch {
        // Safe fallback in test environments
      }

      const onPointerMove = (moveEv: PointerEvent) => {
        const dx = moveEv.clientX - startX;
        const dy = moveEv.clientY - startY;
        if (!moved && Math.hypot(dx, dy) > 4) {
          moved = true;
          this.hasDragged = true;
          fab.classList.add("ea-dragging");
        }
        if (moved) {
          this.applyPosition(initialLeft + dx, initialTop + dy);
        }
      };

      const onPointerUp = (upEv: PointerEvent) => {
        fab.removeEventListener?.("pointermove", onPointerMove as EventListener);
        fab.removeEventListener?.("pointerup", onPointerUp as EventListener);
        fab.removeEventListener?.("pointercancel", onPointerUp as EventListener);
        window.removeEventListener?.("pointermove", onPointerMove as EventListener);
        window.removeEventListener?.("pointerup", onPointerUp as EventListener);
        try {
          fab.releasePointerCapture?.(upEv.pointerId);
        } catch {
          // Safe fallback
        }
        if (moved) {
          fab.classList.remove("ea-dragging");
          this.savePosition();
          setTimeout(() => {
            this.hasDragged = false;
          }, 60);
        }
      };

      fab.addEventListener?.("pointermove", onPointerMove as EventListener);
      fab.addEventListener?.("pointerup", onPointerUp as EventListener);
      fab.addEventListener?.("pointercancel", onPointerUp as EventListener);
      window.addEventListener?.("pointermove", onPointerMove as EventListener);
      window.addEventListener?.("pointerup", onPointerUp as EventListener);
    };

    fab.onclick = (e) => {
      e.stopPropagation();
      if (this.hasDragged || moved) return;
      this.togglePanel();
    };

    this.panelContainer.appendChild(fab);

    // Panel
    if (this.isOpen) {
      const panel = document.createElement("div");
      panel.className =
        "ea-panel" +
        (this.posY !== null && this.posY < 380 ? " ea-panel-below" : "") +
        (this.posX !== null && this.posX < 340 ? " ea-panel-left" : "");

      // Header
      const header = document.createElement("div");
      header.className = "ea-header";

      const title = document.createElement("div");
      title.className = "ea-title";
      title.innerHTML = `easy<span>Apply</span> Quick Fill`;

      const closeBtn = document.createElement("button");
      closeBtn.className = "ea-close-btn";
      closeBtn.setAttribute("type", "button");
      closeBtn.setAttribute("aria-label", "Close");
      closeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        this.togglePanel(false);
      };

      header.appendChild(title);
      header.appendChild(closeBtn);
      panel.appendChild(header);

      // Profile Selector
      if (this.newStepCount) {
        const offer = document.createElement("section");
        offer.className = "ea-report";
        offer.setAttribute("aria-label", "New application step");
        const text = document.createElement("p");
        text.setAttribute("role", "status");
        text.textContent = `${this.newStepCount} new empty field${this.newStepCount === 1 ? "" : "s"} detected. Fill matching fields using your selected profile?`;
        offer.appendChild(text);
        const fillStep = document.createElement("button");
        fillStep.className = "ea-btn ea-btn-primary";
        fillStep.type = "button";
        fillStep.textContent = "Fill this step";
        fillStep.disabled = this.isBusy() || !this.selectedProfileId;
        fillStep.onclick = () => { void this.quickFill(); };
        offer.appendChild(fillStep);
        const dismiss = document.createElement("button");
        dismiss.className = "ea-btn";
        dismiss.type = "button";
        dismiss.textContent = "Not now";
        dismiss.onclick = () => { this.newStepCount = 0; this.render(); };
        offer.appendChild(dismiss);
        panel.appendChild(offer);
      }
      if (this.profiles.length > 0) {
        const selectGroup = document.createElement("div");
        selectGroup.className = "ea-select-group";

        const lbl = document.createElement("label");
        lbl.className = "ea-label";
        lbl.textContent = "Select Profile";

        const select = document.createElement("select");
        select.className = "ea-select";
        select.setAttribute("aria-label", "Quick Fill profile");
        select.disabled = this.isSelecting || this.isScanning;
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Select a profile";
        placeholder.selected = !this.selectedProfileId;
        select.appendChild(placeholder);
        this.profiles.forEach((p) => {
          const opt = document.createElement("option");
          opt.value = p.id;
          opt.textContent = p.title || "Untitled Profile";
          if (p.id === this.selectedProfileId) opt.selected = true;
          select.appendChild(opt);
        });

        select.onchange = () => { void this.selectProfile(select.value); };

        selectGroup.appendChild(lbl);
        selectGroup.appendChild(select);
        panel.appendChild(selectGroup);
      } else {
        const status = document.createElement("div");
        status.className = "ea-status";
        status.textContent = "No profiles found. Create a profile in easyApply Settings.";
        panel.appendChild(status);
      }

      const suggestButton = document.createElement("button");
      suggestButton.className = "ea-btn";
      suggestButton.type = "button";
      suggestButton.textContent = this.suggestionsOpen ? "Hide job suggestions" : "Suggest profile for this job";
      suggestButton.disabled = this.suggesting || this.isScanning || this.isSelecting;
      suggestButton.onclick = () => {
        this.suggestionsOpen = !this.suggestionsOpen;
        if (this.suggestionsOpen) {
          const context = readJobContext(document);
          this.jobTitle = context.title;
          this.jobDescription = context.description;
          void this.compareProfiles();
        } else this.render();
      };
      panel.appendChild(suggestButton);
      if (this.suggestionsOpen) {
        const section = document.createElement("section");
        section.className = "ea-job-suggestions";
        section.setAttribute("aria-label", "Job-specific profile suggestions");
        const invalidate = () => {
          this.suggestions = [];
          this.suggestionMessage = "Job text changed. Compare again to update suggestions.";
          section.querySelectorAll(".ea-job-candidate").forEach(el => el.remove());
          status.textContent = this.suggestionMessage;
        };
        const titleLabel = document.createElement("label");
        titleLabel.textContent = "Job title";
        const titleInput = document.createElement("input");
        titleInput.value = this.jobTitle;
        titleInput.maxLength = 300;
        titleInput.disabled = this.suggesting;
        titleInput.oninput = () => { this.jobTitle = titleInput.value; invalidate(); };
        titleLabel.appendChild(titleInput);
        section.appendChild(titleLabel);
        const descriptionLabel = document.createElement("label");
        descriptionLabel.textContent = "Job description";
        const descriptionInput = document.createElement("textarea");
        descriptionInput.value = this.jobDescription;
        descriptionInput.maxLength = 16000;
        descriptionInput.disabled = this.suggesting;
        descriptionInput.oninput = () => { this.jobDescription = descriptionInput.value; invalidate(); };
        descriptionLabel.appendChild(descriptionInput);
        section.appendChild(descriptionLabel);
        const compare = document.createElement("button");
        compare.className = "ea-btn";
        compare.type = "button";
        compare.textContent = this.suggesting ? "Comparing…" : "Compare saved profiles";
        compare.disabled = this.suggesting;
        compare.onclick = () => { void this.compareProfiles(); };
        section.appendChild(compare);
        const status = document.createElement("p");
        status.setAttribute("role", "status");
        status.textContent = this.suggestionMessage;
        section.appendChild(status);
        for (const suggestion of this.suggestions) {
          const card = document.createElement("div");
          card.className = "ea-job-candidate";
          const heading = document.createElement("strong");
          heading.textContent = suggestion.title;
          card.appendChild(heading);
          const reasons = document.createElement("p");
          reasons.textContent = [suggestion.roleTerms.length ? `Role: ${suggestion.roleTerms.join(", ")}` : "", suggestion.skillTerms.length ? `Skills: ${suggestion.skillTerms.join(", ")}` : ""].filter(Boolean).join(" · ");
          card.appendChild(reasons);
          const resume = document.createElement("p");
          resume.textContent = this.suggestionResumes.get(suggestion.profileId) ? `Attached resume: ${this.suggestionResumes.get(suggestion.profileId)}` : "No resume attached — upload one after choosing this profile.";
          card.appendChild(resume);
          const use = document.createElement("button");
          use.className = "ea-btn";
          use.type = "button";
          use.textContent = this.selectedProfileId === suggestion.profileId ? "Current profile" : `Use ${suggestion.title}`;
          use.disabled = this.selectedProfileId === suggestion.profileId || this.isScanning || this.isSelecting || this.suggesting;
          use.onclick = () => { void this.selectProfile(suggestion.profileId); };
          card.appendChild(use);
          section.appendChild(card);
        }
        const privacy = document.createElement("p");
        privacy.textContent = "Compared on this device. Choosing a profile does not fill or submit the application.";
        section.appendChild(privacy);
        panel.appendChild(section);
      }

      // Resume Vault Section
      const resumeSection = document.createElement("div");
      resumeSection.className = "ea-resume-section";

      const resumeHeader = document.createElement("div");
      resumeHeader.className = "ea-resume-header";

      const resumeLabel = document.createElement("span");
      resumeLabel.className = "ea-label";
      resumeLabel.textContent = "Resume Document (Vault)";

      resumeHeader.appendChild(resumeLabel);

      if (this.currentResume) {
        const badge = document.createElement("span");
        badge.className = "ea-resume-badge";
        badge.textContent = "Saved resume";
        resumeHeader.appendChild(badge);
        resumeSection.appendChild(resumeHeader);

        const box = document.createElement("div");
        box.className = "ea-resume-box";

        const left = document.createElement("div");
        left.className = "ea-resume-left";

        const icon = document.createElement("span");
        icon.className = "ea-resume-icon";
        icon.textContent = "📄";

        const text = document.createElement("div");
        text.className = "ea-resume-text";

        const name = document.createElement("div");
        name.className = "ea-resume-name";
        name.title = this.currentResume.name;
        name.textContent = this.currentResume.name;

        const size = document.createElement("div");
        size.className = "ea-resume-size";
        size.textContent = formatFileSize(this.currentResume.size);

        text.appendChild(name);
        text.appendChild(size);
        left.appendChild(icon);
        left.appendChild(text);

        const btns = document.createElement("div");
        btns.className = "ea-resume-btns";

        const dragChip = document.createElement("div");
        dragChip.className = "ea-drag-chip";
        dragChip.setAttribute("draggable", "true");
        dragChip.title = "Drag onto an upload area on this page. For other apps, use Download.";
        dragChip.innerHTML = `<span>⠿</span> Drag`;

        dragChip.ondragstart = (e: DragEvent) => {
          if (!this.currentResume || !e.dataTransfer) { e.preventDefault(); return; }
          try {
            const file = base64ToFile(this.currentResume.dataBase64, this.currentResume.name, this.currentResume.type);
            e.dataTransfer.items.add(file);
            e.dataTransfer.setData("text/plain", file.name);
            e.dataTransfer.effectAllowed = "copy";
            this.stopResumeDrag?.();
            this.stopResumeDrag = beginResumeDrag(file, message => this.showToast(message, "info"));
          } catch {
            e.preventDefault();
            this.showToast("Drag unavailable. Use Attach or Download instead.", "error");
          }
        };

        const attachBtn = document.createElement("button");
        attachBtn.type = "button";
        attachBtn.className = "ea-attach-btn";
        attachBtn.title = "Auto-detect upload field and attach saved resume";
        attachBtn.textContent = "Attach ↗";

        attachBtn.onclick = async (e) => {
          e.stopPropagation();
          if (!this.currentResume || !this.selectedProfileId) return;
          attachBtn.disabled = true;
          try {
            const result = await fillSavedResume(this.selectedProfileId);
            this.showToast(result.message || "No supported empty resume field found. Use Download and Choose file.", result.filled ? "success" : "info");
          } catch { this.showToast("Could not attach. Download the resume and use Choose file.", "error"); }
          finally { attachBtn.disabled = false; }
        };
        const download = document.createElement("a");
        download.className = "ea-attach-btn";
        download.href = this.currentResume.dataBase64;
        download.download = this.currentResume.name;
        download.textContent = "Download";
        btns.appendChild(download);

        btns.appendChild(dragChip);
        btns.appendChild(attachBtn);

        box.appendChild(left);
        box.appendChild(btns);
        resumeSection.appendChild(box);
      } else {
        resumeSection.appendChild(resumeHeader);

        const emptyBox = document.createElement("div");
        emptyBox.className = "ea-resume-empty";

        const emptyText = document.createElement("span");
        emptyText.textContent = "No resume saved for profile";

        const uploadLabel = document.createElement("label");
        uploadLabel.className = "ea-resume-upload-label";

        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = ".pdf,.docx,.txt";
        fileInput.style.display = "none";

        fileInput.onchange = async () => {
          const file = fileInput.files?.[0];
          if (!file) return;
          this.showToast(`Saving "${file.name}" to vault…`, "info");
          try {
            this.currentResume = await saveStoredResume(
              this.selectedProfileId || "default",
              file,
            );
            this.showToast(`✓ Saved "${file.name}" locally in vault!`, "success");
            this.render();
          } catch {
            this.showToast("Failed to save resume.", "error");
          }
        };

        const labelSpan = document.createElement("span");
        labelSpan.textContent = "+ Upload";

        uploadLabel.appendChild(fileInput);
        uploadLabel.appendChild(labelSpan);

        emptyBox.appendChild(emptyText);
        emptyBox.appendChild(uploadLabel);
        resumeSection.appendChild(emptyBox);
      }

      panel.appendChild(resumeSection);

      // Actions
      const actions = document.createElement("div");
      actions.className = "ea-actions";

      const fillBtn = document.createElement("button");
      fillBtn.className = "ea-btn ea-btn-primary";
      fillBtn.setAttribute("type", "button");
      fillBtn.textContent = this.isScanning ? "Filling…" : "Fill Application";
      fillBtn.disabled = this.isScanning || this.isSelecting || !this.selectedProfileId;
      fillBtn.onclick = (e) => {
        e.stopPropagation();
        void this.quickFill();
      };

      actions.appendChild(fillBtn);
      panel.appendChild(actions);

      if (this.isScanning) {
        const progress = document.createElement("div");
        progress.className = "ea-progress";
        progress.setAttribute("role", "status");
        progress.textContent = "Filling matching fields and checking that the page accepts them. Keep this tab open.";
        panel.appendChild(progress);
      } else if (this.lastReport) {
        const report = document.createElement("section");
        report.className = "ea-report";
        report.setAttribute("aria-label", "Last fill report");
        const heading = document.createElement("h3");
        heading.textContent = "Last fill report";
        report.appendChild(heading);
        const summary = document.createElement("p");
        summary.textContent = this.lastReport.filled === null ? "Fill interrupted — results could not be confirmed" : `${this.lastReport.filled} filled · ${this.lastReport.preserved} already filled · ${this.lastReport.items.length} to review`;
        report.appendChild(summary);
        if (this.lastReport.items.length) {
          const list = document.createElement("ul");
          for (const item of this.lastReport.items) {
            const row = document.createElement("li");
            row.textContent = item;
            list.appendChild(row);
          }
          report.appendChild(list);
        }
        const hint = document.createElement("p");
        hint.textContent = "Review your application on the page before submitting. Update missing profile answers, then fill again.";
        report.appendChild(hint);
        panel.appendChild(report);
      }

      // Shortcut info
      const shortcut = document.createElement("div");
      shortcut.className = "ea-shortcut";
      shortcut.textContent = "Default shortcut: Alt + Shift + F. Change it in Chrome’s extension shortcuts.";
      panel.appendChild(shortcut);

      this.panelContainer.appendChild(panel);
    }
  }

  public destroy() {
    this.stopResumeDrag?.();
    window.removeEventListener("keydown", this.onKeyDown);
    if (this.host && this.host.parentNode) {
      this.host.parentNode.removeChild(this.host);
    }
    this.host = null;
    this.shadow = null;
    this.container = null;
  }
}
