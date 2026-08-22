"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requestLeave, setLeaveGuard } from "../sidebar/leave-guard";

/**
 * Messages a private chat must hold before leaving it asks for confirmation.
 *
 * Two is one exchange: a question and the answer to it. The threshold was
 * higher when leaving meant deliberately navigating elsewhere, but the mode
 * toggle now sits in the header a few pixels from the rest of the controls,
 * and a single stray click there discards work that exists nowhere else. Still
 * not zero — an empty or half-typed chat should not argue with you.
 */
const LEAVE_GUARD_AFTER = 2;

/**
 * A private transcript exists only in this tab, so anything that leaves the
 * page destroys it. Three exits have to be covered and they are all
 * different: reload and tab close (`beforeunload`), a link click anywhere in
 * the shell (the capture listener below), and a programmatic `router.push`
 * from the palette or a shortcut (`requestLeave`).
 */
export function usePrivateLeaveGuard(ephemeral: boolean, messageCount: number) {
  const router = useRouter();
  const guardActive = ephemeral && messageCount >= LEAVE_GUARD_AFTER;
  const [leaveDecision, setLeaveDecision] = useState<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    if (!guardActive) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [guardActive]);

  // Publishes the veto to the sidebar, the palette and this component's own
  // shortcuts. Storing the resolver is what turns a promise into a dialog:
  // whoever wanted to navigate waits until a button is pressed.
  useEffect(() => {
    if (!guardActive) return;
    setLeaveGuard(() => new Promise<boolean>((resolve) => setLeaveDecision(() => resolve)));
    return () => setLeaveGuard(null);
  }, [guardActive]);

  /**
   * Catches link clicks before React Router sees them, which is what makes
   * this work without every `<Link>` in the app knowing about private chats.
   *
   * Modifier-clicks are left alone deliberately: ⌘-click opens a new tab and
   * this one survives, so there is nothing to confirm.
   */
  useEffect(() => {
    if (!guardActive) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      // Internal navigations only. An external link opens elsewhere, and a
      // fragment stays on the page.
      if (!href?.startsWith("/")) return;
      const target = anchor.getAttribute("target");
      if (target && target !== "_self") return;
      e.preventDefault();
      e.stopPropagation();
      void requestLeave().then((ok) => {
        if (ok) router.push(href);
      });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [guardActive, router]);

  return { leaveDecision, setLeaveDecision };
}
