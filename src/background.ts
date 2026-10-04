import { z } from "zod";
import { memoryCandidateSchema, questionKey, rememberedAnswer } from "./field-memory";
import { saveProfiles } from "./storage";
import { setPageDate } from "./date-picker";
import { handleAIMessage, isTrustedAIClient } from "./ai-provider";
import { readData, restrictStorage, saveActiveProfile, recordApplication } from "./storage";
import { connectToPage, connectionError, withTimeout } from "./connection";
import {
  getStoredResumeDirect,
  saveStoredResumeItemDirect,
  deleteStoredResumeDirect,
} from "./resume-vault";
import contentPath from "./content?script";
import { STEP_WINDOW_MS } from "./step-monitor";
const stepKey = (tabId: number) => `easyapply-step:${tabId}`;
const pendingStepSchema = z.object({ fields: z.array(z.string().max(250)).max(300), origin: z.string(), expires: z.number() });
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status !== "complete") return;
  void (async () => {
    const key = stepKey(tabId);
    const pending = pendingStepSchema.safeParse((await chrome.storage.session.get(key))[key]);
    if (!pending.success) return;
    await chrome.storage.session.remove(key);
    if (pending.data.expires < Date.now() || !tab.url || new URL(tab.url).origin !== pending.data.origin) return;
    // activeTab permission may continue on the same origin. Never request
    // broader access or follow a user onto another site automatically.
    await connectToPage(tabId, contentPath);
    await chrome.tabs.sendMessage(tabId, {type:"step-navigation", fields:pending.data.fields}, {frameId:0});
  })().catch(() => {});
});
chrome.tabs.onRemoved.addListener(tabId => { void chrome.storage.session.remove(stepKey(tabId)).catch(() => {}); });

function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    for (const [id, title] of [
      ["easyapply-quick-fill", "easyApply: Quick Fill Form"],
      ["easyapply-scan", "easyApply: Open Quick Fill Panel"],
    ]) chrome.contextMenus.create({
      id, title, contexts: ["page", "editable"],
      documentUrlPatterns: ["http://*/*", "https://*/*"],
    });
  });
}
chrome.runtime.onInstalled.addListener(() => {
  void restrictStorage();
  setupContextMenus();
});
chrome.runtime.onStartup.addListener(() => {
  void restrictStorage();
  setupContextMenus();
});

const runningTabs = new Set<number>();
export async function activatePage(action: "fill" | "open", tab?: chrome.tabs.Tab) {
  const tabId = tab?.id;
  if (tabId === undefined || runningTabs.has(tabId)) return;
  runningTabs.add(tabId);
  try {
    if (!/^https?:\/\//.test(tab?.url ?? ""))
      throw Error("Open a regular http/https application page to use Quick Fill.");
    await connectToPage(tabId, contentPath);
    await chrome.action.setBadgeText({ tabId, text: "" });
    await chrome.action.setTitle({ tabId, title: "easyApply — Review & autofill" });
    const response = await withTimeout(chrome.tabs.sendMessage(tabId,
      { type: action === "fill" ? "inpage-fill" : "inpage-open" },
      { frameId: 0 },
    ), action === "fill" ? 60000 : 10000);
    if (response?.error) throw Error(response.error);
  } catch (error) {
    const message = connectionError(error);
    // A restricted page cannot display a toast. Keep feedback on the toolbar too.
    await Promise.allSettled([
      chrome.action.setBadgeText({ tabId, text: "!" }),
      chrome.action.setTitle({ tabId, title: `easyApply: ${message}` }),
      chrome.tabs.sendMessage(tabId, {
        type: "inpage-toast", message, toastType: "error",
      }, { frameId: 0 }),
    ]);
  } finally {
    runningTabs.delete(tabId);
  }
}
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "easyapply-quick-fill") void activatePage("fill", tab);
  if (info.menuItemId === "easyapply-scan") void activatePage("open", tab);
});
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "quick-fill") void activatePage("fill", tab);
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (["arm-step-navigation", "clear-step-navigation"].includes(message?.type) && sender.id === chrome.runtime.id && sender.tab?.id !== undefined && sender.frameId === 0) {
    const key = stepKey(sender.tab.id);
    if (message.type === "clear-step-navigation") {
      void chrome.storage.session.remove(key).then(() => sendResponse({saved:true}));
      return true;
    }
    const fields = z.array(z.string().max(250)).max(300).safeParse(message.fields);
    if (!fields.success || !sender.url || !/^https?:\/\//.test(sender.url)) return false;
    void chrome.storage.session.set({[key]: { fields:fields.data, origin:new URL(sender.url).origin, expires:Date.now() + STEP_WINDOW_MS }})
      .then(() => sendResponse({saved:true})).catch(() => sendResponse({saved:false}));
    return true;
  }
  if (sender.id !== chrome.runtime.id || (sender.tab && sender.frameId !== 0))
    return false;
  if (message?.type === "set-page-date" && sender.tab?.id !== undefined && sender.frameId === 0 && typeof message.token === "string" && /^[a-f0-9-]{36}$/.test(message.token) && typeof message.iso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(message.iso)) {
    chrome.scripting.executeScript({ target: { tabId: sender.tab.id, frameIds: [0] }, world: "MAIN", func: setPageDate, args: [message.token, message.iso] })
      .then(results => sendResponse({ filled: results[0]?.result === true }))
      .catch(() => sendResponse({ filled: false }));
    return true;
  }
  if (typeof message?.type === "string" && message.type.startsWith("ai-")) {
    if (!isTrustedAIClient(sender)) return false;
    handleAIMessage(message).then(sendResponse).catch(error => sendResponse({ error: error instanceof Error ? error.message : "AI request failed." }));
    return true;
  }
  if (["memory-stage", "memory-pending", "memory-save", "memory-dismiss"].includes(message?.type)) {
    void (async () => {
      const { profiles, activeProfileId } = await readData();
      const profileId = typeof message.profileId === "string" ? message.profileId : activeProfileId;
      const profile = profiles.find(p => p.id === profileId);
      if (!profile) throw Error("Select a saved profile first.");
      const key = `easyapply.memory.pending:${profileId}`;
      if (message.type === "memory-stage") {
        const candidate = memoryCandidateSchema.parse(message.candidate);
        if (rememberedAnswer(candidate.question, profile.customFieldAnswers ?? {}) === candidate.answer) return {candidate:null};
        const automaticallySaved = await navigator.locks.request("easyapply-field-memory", async () => {
          const modeKey = `easyapply.learning:${profileId}`;
          if ((await chrome.storage.local.get(modeKey))[modeKey] !== true) return false;
          const current = await readData();
          const target = current.profiles.find(p => p.id === profileId);
          if (!target || current.activeProfileId !== profileId) throw Error("The selected profile changed. Scan again before learning answers.");
          const answers = {...target.customFieldAnswers};
          // New facts can be learned automatically; changed facts require review.
          if (Object.keys(answers).some(label => questionKey(label) === questionKey(candidate.question))) return false;
          if (Object.keys(answers).length >= 100) throw Error("Your answer memory is full. Remove an answer in Settings first.");
          answers[candidate.question] = candidate.answer;
          target.customFieldAnswers = answers;
          await saveProfiles(current.profiles);
          return true;
        });
        if (automaticallySaved) return {saved:true, question:candidate.question, profileId, title:profile.title};
        await chrome.storage.session.set({ [key]: { ...candidate, expires: Date.now() + 15 * 60 * 1000 } });
        return { candidate, profileId, title: profile.title };
      }
      const storedPending = memoryCandidateSchema.extend({expires:z.number()}).safeParse((await chrome.storage.session.get(key))[key]);
      if (!storedPending.success || storedPending.data.expires < Date.now()) {
        await chrome.storage.session.remove(key);
        return { candidate: null };
      }
      const candidate = memoryCandidateSchema.parse(storedPending.data);
      if (message.type === "memory-pending") return { candidate, profileId, title: profile.title };
      if (message.question !== candidate.question || message.answer !== candidate.answer) throw Error("This suggestion changed. Reopen the page to review it.");
      if (message.type === "memory-save") {
        await navigator.locks.request("easyapply-field-memory", async () => {
          const current = await readData();
          const target = current.profiles.find(p => p.id === profileId);
          if (!target) throw Error("This profile was deleted.");
          const answers = { ...target.customFieldAnswers };
          for (const label of Object.keys(answers)) if (questionKey(label) === questionKey(candidate.question)) delete answers[label];
          answers[candidate.question] = candidate.answer;
          target.customFieldAnswers = answers;
          await saveProfiles(current.profiles);
        });
      }
      await chrome.storage.session.remove(key);
      return { saved: message.type === "memory-save", dismissed: message.type === "memory-dismiss" };
    })().then(sendResponse).catch(error => sendResponse({error: error instanceof Error ? error.message : "Unable to save answer."}));
    return true;
  }
  if (message?.type === "get-profiles") {
    readData()
      .then(({ profiles, activeProfileId }) => sendResponse({ profiles, activeProfileId }))
      .catch(() => sendResponse({ error: "Unable to load profiles. Open Settings to recover saved data." }));
    return true;
  }
  if (message?.type === "select-profile" && typeof message.id === "string" && message.id.length <= 100) {
    saveActiveProfile(message.id)
      .then(() => sendResponse({ saved: true }))
      .catch(() => sendResponse({ error: "Unable to select this profile. Open Settings and try again." }));
    return true;
  }
  if (message?.type === "track-application" && message.application) {
    recordApplication(message.application)
      .then(sendResponse)
      .catch((err) => {
        sendResponse({ error: String(err) });
      });
    return true;
  }
  if (message?.type === "open-tracker") {
    const url = chrome.runtime.getURL("settings.html#tracker");
    chrome.tabs.create({ url }).then(() => {
      sendResponse({ opened: true });
    }).catch((err) => {
      sendResponse({ error: String(err) });
    });
    return true;
  }
  if (message?.type === "get-stored-resume") {
    getStoredResumeDirect(message.profileId)
      .then((resume) => sendResponse({ resume }))
      .catch((err) => sendResponse({ error: String(err) }));
    return true;
  }
  if (message?.type === "save-stored-resume" && message.item) {
    saveStoredResumeItemDirect(message.profileId, message.item)
      .then((item) => sendResponse({ item }))
      .catch((err) => sendResponse({ error: String(err) }));
    return true;
  }
  if (message?.type === "delete-stored-resume") {
    deleteStoredResumeDirect(message.profileId)
      .then(() => sendResponse({ deleted: true }))
      .catch((err) => sendResponse({ error: String(err) }));
    return true;
  }
  return false;
});
