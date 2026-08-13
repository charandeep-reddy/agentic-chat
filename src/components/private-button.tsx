"use client";

import Link from "next/link";
import { startNewChat } from "./new-chat";
import { IconIncognito } from "./icons";

/**
 * Enters and leaves private mode, and shows which one you are in.
 *
 * One button carrying both a state and an action normally cannot say which it
 * is doing — "Private" alone leaves you guessing whether it describes where
 * you are or where clicking would take you. The lit state answers that: green
 * means you are in a private chat, the way the key button's green means a key
 * is connected. The border is dotted rather than solid because nothing here is
 * being written down.
 *
 * It switches modes, it does not convert a conversation. Persistence is fixed
 * when a message is written, so messages already on disk cannot be made
 * private afterwards; leaving private mode starts a saved chat rather than
 * saving this one. Both directions are plain links, which is what puts them
 * behind the leave guard in `chat.tsx` with nothing extra wired.
 */
export function PrivateButton({ active }: { active: boolean }) {
  return (
    <Link
      href={active ? "/" : "/private"}
      // Both directions start a conversation, so both need the remount that
      // the href alone cannot force — see `new-chat.ts`.
      onClick={() => startNewChat()}
      aria-label={
        active
          ? "Private chat active. Switch back to a saved chat."
          : "Start a private chat"
      }
      title={
        active
          ? "Private — not saved, no memories read or written. Click to start a saved chat."
          : "Start a private chat (⌘⇧P) — not saved, no memories read or written"
      }
      className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
        active
          ? "border border-accent/40 text-accent hover:bg-accent-soft"
          : "border-border text-text-muted hover:border-border-strong hover:text-text"
      }`}
    >
      <IconIncognito size={12} />
      <span className="hidden sm:inline">Private</span>
    </Link>
  );
}
