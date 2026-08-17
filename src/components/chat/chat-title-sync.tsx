import { useEffect } from "react";

/**
 * Polls once shortly after the first exchange to pick up the generated title.
 * Cheaper and simpler than streaming it down the message channel, and the
 * window where it matters is a couple of seconds long.
 */
export function TitleSync({
  chatId,
  current,
  onChange,
  active,
}: {
  chatId: string;
  current: string;
  onChange: (title: string) => void;
  active: boolean;
}) {
  useEffect(() => {
    if (!active || current !== "New chat") return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/chats/${chatId}`);
        if (!res.ok) return;
        const data = (await res.json()) as { chat: { title: string } };
        if (!cancelled && data.chat.title !== "New chat") onChange(data.chat.title);
      } catch {
        // A missed title is cosmetic; the sidebar picks it up on next load.
      }
    }, 2500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [chatId, current, onChange, active]);

  return null;
}
