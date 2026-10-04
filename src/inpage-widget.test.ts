import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { InPageWidget } from "./inpage-widget";
import { blankProfile, type Profile, type Match } from "./model";

const mockProfile: Profile = {
  ...blankProfile("Software Engineer"),
  id: "prof-1",
  title: "Software Engineer",
  values: {
    ...blankProfile("Software Engineer").values,
    fullName: "Alex Doe",
    email: "alex@example.com",
    mobile: "9876543210",
  },
};

const mockMatch: Match = {
  id: "m-1",
  label: "Full Name",
  field: "fullName",
  value: "Alex Doe",
  kind: "text",
  sensitive: false,
  selected: true,
};

class MockElement {
  public tagName: string;
  public id: string = "";
  public className: string = "";
  public style: Record<string, string> = {};
  public children: MockElement[] = [];
  public parentNode: MockElement | null = null;
  private _textContent: string = "";
  get textContent(): string {
    if (this.children.length > 0) {
      return this._textContent + this.children.map((c) => c.textContent).join("");
    }
    return this._textContent;
  }
  set textContent(val: string) {
    this._textContent = val;
  }
  private _innerHTML: string = "";
  public attributes: Record<string, string> = {};
  public shadowRoot: MockShadowRoot | null = null;
  public value: string = "";
  public options: { value: string; textContent: string; selected?: boolean }[] = [];
  public onclick: ((e: { stopPropagation: () => void }) => void) | null = null;
  public onchange: (() => void) | null = null;
  public disabled: boolean = false;

  get innerHTML(): string {
    return this._innerHTML;
  }
  set innerHTML(val: string) {
    this._innerHTML = val;
    if (val === "") {
      this.children = [];
    }
  }

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(k: string, v: string) {
    this.attributes[k] = v;
  }
  getAttribute(k: string) {
    return this.attributes[k] ?? null;
  }
  appendChild(child: MockElement) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child: MockElement) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
  }
  remove() {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }
  attachShadow() {
    this.shadowRoot = new MockShadowRoot();
    return this.shadowRoot;
  }
  querySelector(sel: string): MockElement | null {
    for (const child of this.children) {
      if (
        (sel.startsWith(".") && child.className.split(" ").includes(sel.slice(1))) ||
        (sel.startsWith("#") && child.id === sel.slice(1)) ||
        child.tagName.toLowerCase() === sel.toLowerCase() ||
        (sel.includes(".") && child.className.includes(sel.split(".")[1]))
      ) {
        return child;
      }
      const found = child.querySelector(sel);
      if (found) return found;
    }
    return null;
  }
}

class MockShadowRoot {
  public children: MockElement[] = [];
  appendChild(child: MockElement) {
    this.children.push(child);
    return child;
  }
  querySelector(sel: string): MockElement | null {
    for (const child of this.children) {
      if (
        (sel.startsWith(".") && child.className.split(" ").includes(sel.slice(1))) ||
        (sel.startsWith("#") && child.id === sel.slice(1)) ||
        child.tagName.toLowerCase() === sel.toLowerCase() ||
        (sel.includes(".") && child.className.includes(sel.split(".")[1]))
      ) {
        return child;
      }
      const found = child.querySelector(sel);
      if (found) return found;
    }
    return null;
  }
}

describe("InPageWidget", () => {
  let mockBody: MockElement;

  beforeEach(() => {
    mockBody = new MockElement("body");
    const mockDoc = {
      body: mockBody,
      createElement: (tag: string) => {
        const el = new MockElement(tag);
        if (tag === "option") {
          return el;
        }
        return el;
      },
      getElementById: (id: string) => {
        return mockBody.querySelector("#" + id);
      },
      addEventListener: vi.fn(),
    };

    vi.stubGlobal("document", mockDoc);
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      easyApplyScanId: "test-scan-id",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("initializes and mounts shadow root properly", () => {
    const onScan = vi.fn().mockReturnValue([]);
    const onFill = vi.fn().mockReturnValue({ filled: 0, errors: [] });
    const onRequestProfiles = vi.fn().mockResolvedValue({ profiles: [mockProfile], activeProfileId: mockProfile.id });

    const widget = new InPageWidget({ onScan, onFill, onRequestProfiles, onSelectProfile: vi.fn().mockResolvedValue(undefined) });
    widget.init();

    const host = mockBody.querySelector("#easyapply-host");
    expect(host).toBeTruthy();
    expect(host?.shadowRoot).toBeTruthy();

    const fab = host?.shadowRoot?.querySelector(".ea-fab");
    expect(fab).toBeTruthy();

    widget.destroy();
    expect(mockBody.querySelector("#easyapply-host")).toBeNull();
  });

  it("toggles quick panel and loads profiles", async () => {
    const onScan = vi.fn().mockReturnValue([]);
    const onFill = vi.fn().mockReturnValue({ filled: 0, errors: [] });
    const onRequestProfiles = vi.fn().mockResolvedValue({ profiles: [mockProfile], activeProfileId: mockProfile.id });

    const widget = new InPageWidget({ onScan, onFill, onRequestProfiles, onSelectProfile: vi.fn().mockResolvedValue(undefined) });
    widget.init();

    widget.togglePanel(true);
    await widget.loadProfiles();

    const host = mockBody.querySelector("#easyapply-host");
    const panel = host?.shadowRoot?.querySelector(".ea-panel");
    expect(panel).toBeTruthy();

    widget.togglePanel(false);
    expect(host?.shadowRoot?.querySelector(".ea-panel")).toBeNull();

    widget.destroy();
  });

  it.each([
    { errors: [], feedback: "Filled 1 field." },
    { errors: ["Email: website rejected the value"], feedback: "1 need review. Email: website rejected the value" },
  ])("reports fill results without hiding errors: $feedback", async ({ errors, feedback }) => {
    const onScan = vi.fn().mockReturnValue([mockMatch]);
    const onFill = vi.fn().mockReturnValue({ filled: 1, errors });
    const onRequestProfiles = vi.fn().mockResolvedValue({ profiles: [mockProfile], activeProfileId: mockProfile.id });

    const widget = new InPageWidget({ onScan, onFill, onRequestProfiles, onSelectProfile: vi.fn().mockResolvedValue(undefined) });
    widget.init();

    await widget.quickFill(mockProfile);

    expect(onScan).toHaveBeenCalledWith(mockProfile);
    expect(onFill).toHaveBeenCalled();

    const host = mockBody.querySelector("#easyapply-host");
    const toast = host?.shadowRoot?.querySelector(".ea-toast");
    expect(toast).toBeTruthy();
    expect(toast?.textContent).toContain(feedback);
    widget.togglePanel(true);
    const report = host?.shadowRoot?.querySelector(".ea-report");
    expect(report?.textContent).toContain("1 filled");
    expect(report?.textContent).toContain(`${errors.length} to review`);
    for (const error of errors) expect(report?.textContent).toContain(error);

    widget.destroy();
  });

  it("shows message when no fields are matched", async () => {
    const onScan = vi.fn().mockReturnValue([]);
    const onFill = vi.fn().mockReturnValue({ filled: 0, errors: [] });
    const onRequestProfiles = vi.fn().mockResolvedValue({ profiles: [mockProfile], activeProfileId: mockProfile.id });

    const widget = new InPageWidget({ onScan, onFill, onRequestProfiles, onSelectProfile: vi.fn().mockResolvedValue(undefined) });
    widget.init();

    await widget.quickFill(mockProfile);

    const host = mockBody.querySelector("#easyapply-host");
    const toast = host?.shadowRoot?.querySelector(".ea-toast");
    expect(toast).toBeTruthy();
    expect(toast?.textContent).toContain("No eligible empty fields found");

    widget.destroy();
  });
  it("refreshes the chosen profile before each fill instead of using the first or a cached profile", async () => {
    const second = { ...mockProfile, id: "second", title: "Second" };
    const onScan = vi.fn().mockReturnValue([mockMatch]);
    const onRequestProfiles = vi.fn()
      .mockResolvedValueOnce({ profiles: [mockProfile, second], activeProfileId: mockProfile.id })
      .mockResolvedValueOnce({ profiles: [mockProfile, second], activeProfileId: second.id })
      .mockResolvedValueOnce({ profiles: [mockProfile], activeProfileId: "" });
    const onFill = vi.fn().mockReturnValue({ filled: 1, errors: [] });
    const widget = new InPageWidget({ onScan, onFill, onRequestProfiles, onSelectProfile: vi.fn() });
    widget.init();
    await widget.loadProfiles();
    await widget.quickFill();
    expect(onScan).toHaveBeenCalledWith(second);
    await widget.quickFill();
    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onFill).toHaveBeenCalledTimes(1);
    widget.destroy();
  });

  it("clamps dragged position within viewport boundaries and updates host styles", () => {
    const onScan = vi.fn().mockReturnValue([]);
    const onFill = vi.fn().mockReturnValue({ filled: 0, errors: [] });
    const onRequestProfiles = vi.fn().mockResolvedValue({ profiles: [mockProfile], activeProfileId: mockProfile.id });

    const widget = new InPageWidget({ onScan, onFill, onRequestProfiles, onSelectProfile: vi.fn() });
    widget.init();

    // Move to valid coordinate
    widget.applyPosition(200, 150);
    const host = mockBody.querySelector("#easyapply-host");
    expect(host?.style.left).toBe("200px");
    expect(host?.style.top).toBe("150px");

    // Move beyond top/left bounds (should clamp to min 10px)
    widget.applyPosition(-50, -20);
    expect(host?.style.left).toBe("10px");
    expect(host?.style.top).toBe("10px");

    widget.destroy();
  });

  it("applies ea-panel-below and ea-panel-left classes when dragged near top-left edges", async () => {
    const onScan = vi.fn().mockReturnValue([]);
    const onFill = vi.fn().mockReturnValue({ filled: 0, errors: [] });
    const onRequestProfiles = vi.fn().mockResolvedValue({ profiles: [mockProfile], activeProfileId: mockProfile.id });

    const widget = new InPageWidget({ onScan, onFill, onRequestProfiles, onSelectProfile: vi.fn() });
    widget.init();

    // Position near top-left: y = 100 (< 380), x = 100 (< 340)
    widget.applyPosition(100, 100);
    widget.togglePanel(true);
    await widget.loadProfiles();

    const host = mockBody.querySelector("#easyapply-host");
    const panel = host?.shadowRoot?.querySelector(".ea-panel");
    expect(panel).toBeTruthy();
    expect(panel?.className).toContain("ea-panel-below");
    expect(panel?.className).toContain("ea-panel-left");

    widget.destroy();
  });
});

