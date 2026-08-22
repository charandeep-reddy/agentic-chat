"use client";

import { useEffect, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { requestLeave } from "../sidebar/leave-guard";
import { startNewChat } from "../sidebar/new-chat";

/** Keyboard shortcuts, matching what the big three settled on. */
export function useChatShortcuts(
  composerRef: RefObject<HTMLTextAreaElement | null>,
  busy: boolean,
  stop: () => void,
) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void requestLeave().then((ok) => {
          if (!ok) return;
          startNewChat();
          router.push("/");
        });
      } else if (meta && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        void requestLeave().then((ok) => {
          if (!ok) return;
          startNewChat();
          router.push("/private");
        });
      } else if (meta && e.key === "/") {
        e.preventDefault();
        composerRef.current?.focus();
      } else if (e.key === "Escape" && busy) {
        stop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [composerRef, router, busy, stop]);
}
