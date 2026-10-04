export const recoveryMessage =
  "easyApply could not connect to this page. Refresh the application page, reopen easyApply, and scan again. If you just updated easyApply, reload it in chrome://extensions first.";
export async function withTimeout<T>(
  promise: Promise<T>,
  ms = 10000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              Error(
                "The page took too long to respond. Review the page before retrying; a fill may already have happened.",
              ),
            ),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export async function connectToPage(tabId: number, script: string) {
  // Reuse the live widget and listener; reinjection would invalidate its state.
  try {
    const response = await withTimeout(
      chrome.tabs.sendMessage(tabId, { type: "ping" }, { frameId: 0 }),
    );
    if (response?.ready) return;
  } catch { /* A fresh page has no receiver yet. */ }
  for (let attempt = 0; attempt < 3; attempt++) {
    await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId, frameIds: [0] },
        files: [script],
      }),
    );
    try {
      const response = await withTimeout(
        chrome.tabs.sendMessage(tabId, { type: "ping" }, { frameId: 0 }),
      );
      if (response?.ready) return;
    } catch {
      /* A navigation or delayed script startup can temporarily remove the receiver. */
    }
    if (attempt < 2)
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
  }
  throw new Error(recoveryMessage);
}
export function connectionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return /receiving end does not exist|could not establish connection|message port closed|extension context invalidated/i.test(
    message,
  )
    ? recoveryMessage
    : message;
}
