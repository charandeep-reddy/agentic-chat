"use client";

import { useCallback, useState } from "react";
import type { MemoryScope } from "@/lib/memory-scope";

/**
 * Whether this conversation reads and writes memories, and the persistence
 * behind it.
 *
 * Lives here rather than in the toggle because two things drive it — the
 * control in the composer and the ⌘⇧M shortcut — and because the value has to
 * be readable by `Chat` itself: a chat with no database row yet sends the
 * choice along with its first message.
 */
export function useChatMemory(chatId: string, initialOn: boolean) {
  const [on, setOn] = useState(initialOn);
  const [saving, setSaving] = useState(false);

  const toggle = useCallback(async () => {
    const next = !on;
    const scope: MemoryScope = next ? "all" : "none";
    setOn(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/chats/${chatId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memoryScope: scope }),
      });
      // A chat has no row until its first message, so toggling before then is
      // a 404 and not a failure: the scope rides along with that first request
      // and is applied when the row is created.
      if (res.status === 404) return;
      if (!res.ok) throw new Error(String(res.status));
    } catch (error) {
      console.error("[memory] failed to save scope:", error);
      // The next message would otherwise be sent under a setting the server
      // never accepted, which is the one mistake this control cannot make.
      setOn(!next);
    } finally {
      setSaving(false);
    }
  }, [chatId, on]);

  return { on, saving, toggle };
}
