import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatFileSize,
  resumeFileType,
  MAX_RESUME_BYTES,
  base64ToFile,
  isResumeInput,
  injectFileIntoInput,
  findResumeUploadTarget,
  dispatchFileDrop,
  saveStoredResume,
  getStoredResume,
  deleteStoredResume,
} from "./resume-vault";

describe("resume-vault", () => {
  describe("formatFileSize", () => {
    it("formats bytes accurately", () => {
      expect(formatFileSize(0)).toBe("0 B");
      expect(formatFileSize(500)).toBe("500 B");
      expect(formatFileSize(1024)).toBe("1 KB");
      expect(formatFileSize(1024 * 1024)).toBe("1 MB");
      expect(formatFileSize(2.5 * 1024 * 1024)).toBe("2.5 MB");
    });
  });

  describe("base64ToFile", () => {
    it("converts base64 data to a valid File object", () => {
      // Base64 for "Hello Resume"
      const base64 = "data:application/pdf;base64,SGVsbG8gUmVzdW1l";
      const file = base64ToFile(base64, "My_Resume.pdf", "application/pdf");

      expect(file).toBeInstanceOf(File);
      expect(file.name).toBe("My_Resume.pdf");
      expect(file.type).toBe("application/pdf");
      expect(file.size).toBe(12);
    });
  });

  describe("isResumeInput", () => {
    it("detects signals matching resume, cv, curriculum vitae, and biodata", () => {
      expect(isResumeInput(["upload resume"])).toBe(true);
      expect(isResumeInput(["attach your cv"])).toBe(true);
      expect(isResumeInput(["curriculum vitae"])).toBe(true);
      expect(isResumeInput(["biodata"])).toBe(true);
      expect(isResumeInput(["candidate_resume_file"])).toBe(true);
    });

    it("returns false for non-resume inputs", () => {
      expect(isResumeInput(["first name"])).toBe(false);
      expect(isResumeInput(["email address"])).toBe(false);
      expect(isResumeInput(["phone number"])).toBe(false);
    });

    it("detects resume keyword from element attributes", () => {
      const mockInput = {
        id: "applicant_cv_upload",
        name: "cv_file",
        getAttribute: (k: string) => (k === "aria-label" ? "Upload CV" : null),
        title: "",
        closest: () => null,
        parentElement: null,
      } as unknown as HTMLInputElement;

      expect(isResumeInput([], mockInput)).toBe(true);
    });
  });

  describe("injectFileIntoInput", () => {
    it("assigns files and triggers events on input", () => {
      const events: string[] = [];
      const mockInput = {
        files: null as unknown as FileList,
        dispatchEvent: (e: Event) => {
          events.push(e.type);
          return true;
        },
      } as unknown as HTMLInputElement;

      const dummyFile = new File(["test"], "resume.pdf", { type: "application/pdf" });
      const success = injectFileIntoInput(mockInput, dummyFile);

      expect(success).toBe(true);
      expect(mockInput.files).not.toBeNull();
      expect(events).toContain("focus");
      expect(events).toContain("input");
      expect(events).toContain("change");
      expect(events).toContain("blur");
    });
  });

  describe("findResumeUploadTarget", () => {
    it("finds file input with resume keyword", () => {
      const resumeInput = {
        id: "resume-file",
        name: "resume",
        getAttribute: () => null,
        title: "",
        closest: () => null,
        parentElement: null,
      } as unknown as HTMLInputElement;

      const mockDoc = {
        querySelectorAll: (selector: string) => {
          if (selector === 'input[type="file"]') {
            return [resumeInput];
          }
          return [];
        },
      } as unknown as Document;

      const target = findResumeUploadTarget(mockDoc);
      expect(target).not.toBeNull();
      expect(target?.input).toBe(resumeInput);
    });
  });

  describe("dispatchFileDrop", () => {
    it("dispatches dragenter, dragover, drop events", () => {
      const dispatched: string[] = [];
      const dummyInput = {
        files: null,
        dispatchEvent: () => true,
        type: "file",
      } as unknown as HTMLInputElement;

      const mockTarget = {
        dispatchEvent: (e: Event) => {
          dispatched.push(e.type);
          return true;
        },
        querySelector: () => dummyInput,
      } as unknown as HTMLElement;

      const file = new File(["content"], "resume.pdf", { type: "application/pdf" });
      const ok = dispatchFileDrop(mockTarget, file);

      expect(ok).toBe(true);
      expect(dispatched).toEqual(["dragenter", "dragover", "drop"]);
    });
  });

  describe("save, get, delete stored resume via runtime messaging", () => {
    beforeEach(() => {
      vi.stubGlobal("window", {
        location: { protocol: "https:" },
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("routes through chrome.runtime.sendMessage when in content script", async () => {
      const mockSendMessage = vi.fn().mockImplementation((msg: { type: string; item?: unknown }) => {
        if (msg.type === "get-stored-resume") {
          return Promise.resolve({
            resume: {
              name: "Anwar_Resume.pdf",
              size: 1024,
              type: "application/pdf",
              dataBase64: "data:application/pdf;base64,dGVzdA==",
              updatedAt: "2026-09-18T00:00:00Z",
            },
          });
        }
        if (msg.type === "save-stored-resume") {
          return Promise.resolve({ item: msg.item });
        }
        if (msg.type === "delete-stored-resume") {
          return Promise.resolve({ deleted: true });
        }
        return Promise.resolve({});
      });

      vi.stubGlobal("chrome", {
        runtime: {
          sendMessage: mockSendMessage,
        },
      });

      const res = await getStoredResume("prof-1");
      expect(mockSendMessage).toHaveBeenCalledWith({
        type: "get-stored-resume",
        profileId: "prof-1",
      });
      expect(res?.name).toBe("Anwar_Resume.pdf");

      await deleteStoredResume("prof-1");
      expect(mockSendMessage).toHaveBeenCalledWith({
        type: "delete-stored-resume",
        profileId: "prof-1",
      });

      const file = new File(["hello"], "sample.pdf", { type: "application/pdf" });
      const saved = await saveStoredResume("prof-1", file);
      expect(saved.name).toBe("sample.pdf");
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "save-stored-resume",
          profileId: "prof-1",
        }),
      );
    });
  });
});

describe("resume document validation", () => {
  it("accepts supported extensions and normalizes missing or generic MIME types", () => {
    expect(resumeFileType({name:"Resume.PDF",size:10,type:""})).toBe("application/pdf");
    expect(resumeFileType({name:"resume.docx",size:10,type:"application/octet-stream"})).toContain("wordprocessingml");
    expect(resumeFileType({name:"resume.txt",size:10,type:""})).toBe("text/plain");
  });
  it("rejects empty, oversized, unsupported and mismatched files before storage", () => {
    expect(() => resumeFileType({name:"resume.pdf",size:0,type:"application/pdf"})).toThrow("empty");
    expect(() => resumeFileType({name:"resume.pdf",size:MAX_RESUME_BYTES+1,type:"application/pdf"})).toThrow("10 MB");
    expect(() => resumeFileType({name:"resume.html",size:10,type:"text/html"})).toThrow("PDF, DOCX, or TXT");
    expect(() => resumeFileType({name:"resume.pdf",size:10,type:"text/html"})).toThrow("does not match");
    expect(resumeFileType({name:"resume.pdf",size:MAX_RESUME_BYTES,type:"application/pdf"})).toBe("application/pdf");
  });
  it("surfaces remote storage failures without writing into the website's IndexedDB", async () => {
    const open = vi.fn();
    vi.stubGlobal("window", {location:{protocol:"https:"}});
    vi.stubGlobal("indexedDB", {open});
    vi.stubGlobal("chrome", {runtime:{sendMessage:vi.fn().mockResolvedValue({error:"Storage unavailable"})}});
    try {
      await expect(saveStoredResume("profile", new File(["resume"],"resume.txt",{type:"text/plain"}))).rejects.toThrow("Storage unavailable");
      await expect(getStoredResume("profile")).rejects.toThrow("Storage unavailable");
      expect(open).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});
