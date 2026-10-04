import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("./content?script", () => ({ default: "content.js" }));
vi.mock("./connection", () => ({
  connectToPage: vi.fn().mockResolvedValue(undefined),
  connectionError: (error: Error) => error.message,
  withTimeout: (promise: Promise<unknown>) => promise,
}));
import { connectToPage } from "./connection";

const sendMessage = vi.fn();
const badge = vi.fn();
const title = vi.fn();
const sessionGet = vi.fn();
const sessionRemove = vi.fn().mockResolvedValue(undefined);
let updatedListener: (id: number, change: {status?: string}, tab: chrome.tabs.Tab) => void;
let menuListener: (info: { menuItemId: string }, tab: chrome.tabs.Tab) => void;
let commandListener: (name: string, tab: chrome.tabs.Tab) => void;
const tab = { id: 42, url: "https://jobs.example/application" } as chrome.tabs.Tab;
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  sendMessage.mockResolvedValue({ status: "complete" });
  badge.mockResolvedValue(undefined);
  title.mockResolvedValue(undefined);
  vi.mocked(connectToPage).mockResolvedValue(undefined);
  vi.stubGlobal("chrome", {
    runtime: { id: "test", onInstalled: { addListener: vi.fn() }, onStartup: { addListener: vi.fn() }, onMessage: { addListener: vi.fn() } },
    contextMenus: { onClicked: { addListener: (fn: typeof menuListener) => { menuListener = fn; } } },
    commands: { onCommand: { addListener: (fn: typeof commandListener) => { commandListener = fn; } } },
    tabs: { sendMessage, onUpdated: {addListener: (fn: typeof updatedListener) => {updatedListener = fn;}}, onRemoved: {addListener: vi.fn()} },
    storage: {session: {get: sessionGet, remove: sessionRemove}},
    action: { setBadgeText: badge, setTitle: title },
  });
});
afterEach(() => vi.unstubAllGlobals());
it.each([
  ["https://jobs.example/step2", 30000, true],
  ["https://other.example/step2", 30000, false],
  ["https://jobs.example/step2", -1, false],
])("resumes only a recent same-site step: %s / %s", async (url, lifetime, expected) => {
  sessionGet.mockResolvedValue({"easyapply-step:42": {fields:["text|first name"], origin:"https://jobs.example", expires:Date.now() + Number(lifetime)}});
  await import("./background");
  updatedListener(42, {status:"complete"}, {...tab, url:String(url)});
  await vi.waitFor(() => expect(sessionRemove).toHaveBeenCalled());
  if (expected) {
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith(42, {type:"step-navigation", fields:["text|first name"]}, {frameId:0}));
  } else expect(connectToPage).not.toHaveBeenCalled();
});
it.each(["easyapply-quick-fill", "easyapply-scan"])("connects a fresh page before context action %s", async (menuItemId) => {
  await import("./background");
  menuListener({ menuItemId }, tab);
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalled());
  expect(connectToPage).toHaveBeenCalledWith(42, "content.js");
  expect(vi.mocked(connectToPage).mock.invocationCallOrder[0]).toBeLessThan(sendMessage.mock.invocationCallOrder[0]);
  expect(sendMessage).toHaveBeenCalledWith(42, { type: menuItemId.endsWith("scan") ? "inpage-open" : "inpage-fill" }, { frameId: 0 });
});
it("runs the registered command without any existing page keyboard listener", async () => {
  await import("./background");
  commandListener("quick-fill", tab);
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith(42, { type: "inpage-fill" }, { frameId: 0 }));
  expect(connectToPage).toHaveBeenCalledTimes(1);
});
it("reports restricted-page failures on the toolbar without attempting injection", async () => {
  const { activatePage } = await import("./background");
  await activatePage("fill", { ...tab, url: "chrome://extensions" });
  expect(connectToPage).not.toHaveBeenCalled();
  expect(badge).toHaveBeenCalledWith({ tabId: 42, text: "!" });
});
it("does not replay a timed-out fill", async () => {
  const { activatePage } = await import("./background");
  sendMessage.mockRejectedValueOnce(Error("Page took too long; review before retrying"));
  await activatePage("fill", tab);
  expect(sendMessage.mock.calls.filter((call) => call[1].type === "inpage-fill")).toHaveLength(1);
  expect(badge).toHaveBeenLastCalledWith({ tabId: 42, text: "!" });
});
it("blocks duplicate activations while a fill is pending", async () => {
  const { activatePage } = await import("./background");
  let finish!: (value: unknown) => void;
  sendMessage.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const first = activatePage("fill", tab);
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
  await activatePage("fill", tab);
  expect(connectToPage).toHaveBeenCalledTimes(1);
  finish({ status: "complete" });
  await first;
});
