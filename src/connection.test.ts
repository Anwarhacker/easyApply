import { afterEach, it, expect, vi } from "vitest";
import { connectToPage, connectionError, recoveryMessage } from "./connection";
import { withTimeout } from "./connection";
afterEach(() => vi.unstubAllGlobals());
it("times out a stalled page operation without retrying a fill", async () => {
  vi.useFakeTimers();
  const pending = withTimeout(new Promise(() => {}), 100);
  const assertion = expect(pending).rejects.toThrow(
    "may already have happened",
  );
  await vi.advanceTimersByTimeAsync(101);
  await assertion;
  vi.useRealTimers();
});
it("reinjects when the first receiver is missing, then checks readiness", async () => {
  const executeScript = vi.fn().mockResolvedValue([]);
  const sendMessage = vi
    .fn()
    .mockRejectedValueOnce(new Error("Receiving end does not exist"))
    .mockResolvedValue({ ready: true });
  vi.stubGlobal("chrome", {
    scripting: { executeScript },
    tabs: { sendMessage },
  });
  await connectToPage(7, "content.js");
  expect(executeScript).toHaveBeenCalledTimes(1);
  expect(sendMessage).toHaveBeenLastCalledWith(
    7,
    { type: "ping" },
    { frameId: 0 },
  );
});
it("bounds retries and provides a recovery action", async () => {
  const sendMessage = vi
    .fn()
    .mockRejectedValue(new Error("Receiving end does not exist"));
  vi.stubGlobal("chrome", {
    scripting: { executeScript: vi.fn().mockResolvedValue([]) },
    tabs: { sendMessage },
  });
  await expect(connectToPage(7, "content.js")).rejects.toThrow(recoveryMessage);
  expect(sendMessage).toHaveBeenCalledTimes(4);
  expect(
    connectionError(
      new Error(
        "Could not establish connection. Receiving end does not exist.",
      ),
    ),
  ).toBe(recoveryMessage);
});
it("reuses an existing content script without replacing its widget or preview", async () => {
  const executeScript = vi.fn();
  vi.stubGlobal("chrome", {
    scripting: { executeScript },
    tabs: { sendMessage: vi.fn().mockResolvedValue({ ready: true }) },
  });
  await connectToPage(7, "content.js");
  expect(executeScript).not.toHaveBeenCalled();
});
