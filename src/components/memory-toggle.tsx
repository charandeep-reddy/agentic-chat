"use client";

import { IconBrain } from "./icons";

/**
 * Memory on/off for one conversation, in the composer.
 *
 * It sits next to the model name because it belongs to the same decision as
 * sending the message, and it carries the same meaning that button does: from
 * here on. Turns already sent keep whatever they ran with, and the transcript
 * marks where it changed.
 *
 * Off writes the scope "none", which drops the saved memories from the prompt
 * *and* leaves the memory tools out of the request — nothing read, nothing
 * written. The per-memory picker ("only these") is not exposed here; the scope
 * column still supports it.
 *
 * Presentational: the value and its persistence live in `useChatMemory`, since
 * the ⌘⇧M shortcut drives the same state.
 */
export function MemoryToggle({
  on,
  saving,
  accountEnabled,
  onToggle,
}: {
  on: boolean;
  saving: boolean;
  /** The account-level switch, which this cannot override. */
  accountEnabled: boolean;
  onToggle: () => void;
}) {
  // Switched off at the account level: this chat's setting is real but has
  // nothing to act on, and a lit "On" would be a lie. Say which switch is the
  // one holding it.
  if (!accountEnabled) {
    return (
      <span
        title="Memory is switched off for your account. Turn it on in Memory & packs."
        className="flex shrink-0 items-center gap-1.5 rounded-md border border-border-subtle px-2 py-1 text-[11px] text-text-faint"
      >
        <IconBrain size={12} />
        Memory · Off for account
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        disabled={saving}
        aria-pressed={on}
        title={
          on
            ? "Memory on — this chat can read and save memories. ⌘⇧M to turn off."
            : "Memory off — nothing is read from or saved to memory. ⌘⇧M to turn on."
        }
        // The loud state is "off", not "on". Every chat is on by default, so
        // lighting that up says nothing; the state worth seeing across the room
        // is the one that changes what the app does.
        className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors disabled:opacity-60 ${
          on
            ? "border-border-subtle text-text-faint hover:border-border hover:text-text-secondary"
            : "border-warn/50 bg-warn-soft text-warn hover:brightness-110"
        }`}
      >
        <IconBrain size={12} />
        Memory · {on ? "On" : "Off"}
      </button>

      {/*
        A colour change and a three-letter label are nothing to a screen reader
        mid-conversation, and this is the one control where not knowing its
        state is the whole problem.
      */}
      <span aria-live="polite" className="sr-only">
        {on ? "Memory on for this chat" : "Memory off for this chat"}
      </span>
    </>
  );
}
