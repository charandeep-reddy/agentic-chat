import { afterEach, describe, expect, it } from "vitest";
import { requestLeave, setLeaveGuard } from "@/components/leave-guard";

afterEach(() => setLeaveGuard(null));

describe("leave guard", () => {
  it("lets navigation through when nothing is installed", async () => {
    // The default, and the one that matters most: every ordinary chat is on
    // disk, so callers can await this unconditionally without a dialog.
    await expect(requestLeave()).resolves.toBe(true);
  });

  it("asks the installed guard and passes on its answer", async () => {
    setLeaveGuard(() => Promise.resolve(false));
    await expect(requestLeave()).resolves.toBe(false);

    setLeaveGuard(() => Promise.resolve(true));
    await expect(requestLeave()).resolves.toBe(true);
  });

  it("stops asking once the guard is removed", async () => {
    setLeaveGuard(() => Promise.resolve(false));
    setLeaveGuard(null);
    await expect(requestLeave()).resolves.toBe(true);
  });

  it("waits for a guard that resolves later", async () => {
    // The real one resolves on a button press, so a guard that has not
    // answered yet must leave the caller pending rather than defaulting.
    let decide: ((ok: boolean) => void) | null = null;
    setLeaveGuard(() => new Promise<boolean>((resolve) => (decide = resolve)));

    const pending = requestLeave();
    let settled = false;
    void pending.then(() => (settled = true));

    await Promise.resolve();
    expect(settled).toBe(false);

    (decide as unknown as (ok: boolean) => void)(true);
    await expect(pending).resolves.toBe(true);
  });
});
