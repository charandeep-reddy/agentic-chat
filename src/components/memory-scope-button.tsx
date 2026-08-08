"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MEMORY_SCOPES } from "@/lib/memory-scope";
import type { MemoryScope } from "@/lib/memory-scope";
import { useMenu } from "./use-menu";
import { IconBrain } from "./icons";

interface MemoryItem {
  id: string;
  content: string;
  category: string;
  enabled: boolean;
}

const LABELS: Record<MemoryScope, { label: string; hint: string }> = {
  all: { label: "All memories", hint: "Everything you have saved, as usual." },
  none: { label: "No memories", hint: "This chat starts with nothing about you." },
  selected: { label: "Only these", hint: "Pick exactly what this chat can see." },
};

/**
 * Per-conversation memory scope.
 *
 * The account-level toggle in settings is all-or-nothing, which leaves anyone
 * with work and personal memories in one account no way to keep them apart. It
 * still wins: this can only narrow what a chat sees, never widen it.
 */
export function MemoryScopeButton({
  chatId,
  initialScope,
  initialIds,
}: {
  chatId: string;
  initialScope: MemoryScope;
  initialIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<MemoryScope>(initialScope);
  const [ids, setIds] = useState<string[]>(initialIds);
  const [memories, setMemories] = useState<MemoryItem[] | null>(null);

  const close = useCallback(() => setOpen(false), []);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useMenu<HTMLDivElement>({ open, onClose: close, trigger: triggerRef });

  // Only load the list once the panel is opened: most conversations never
  // touch this, and it is one more request in front of a chat that does not
  // need it.
  useEffect(() => {
    if (!open || memories !== null) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/memories");
        if (!res.ok) return;
        const data = (await res.json()) as { memories: MemoryItem[] };
        if (!cancelled) setMemories(data.memories.filter((m) => m.enabled));
      } catch (error) {
        console.error("[memory-scope] failed to load memories:", error);
        if (!cancelled) setMemories([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, memories]);

  const save = (nextScope: MemoryScope, nextIds: string[]) => {
    setScope(nextScope);
    setIds(nextIds);
    void fetch(`/api/chats/${chatId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ memoryScope: nextScope, memoryIds: nextIds }),
    }).catch((error: unknown) => {
      console.error("[memory-scope] failed to save:", error);
    });
  };

  const toggle = (id: string) => {
    const next = ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id];
    save("selected", next);
  };

  // Default scope gets no chip: a control that is always lit stops meaning
  // anything, and "all" is what every chat does unless told otherwise.
  const summary = scope === "all" ? null : scope === "none" ? "off" : `${ids.length}`;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Memory for this chat: ${LABELS[scope].label}`}
        title={`Memory for this chat: ${LABELS[scope].label}`}
        className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors ${
          summary
            ? "border-accent/40 text-accent hover:bg-accent-soft"
            : "border-border text-text-muted hover:border-border-strong hover:text-text"
        }`}
      >
        <IconBrain size={12} />
        {summary}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Memory for this chat"
          className="absolute right-0 top-full z-30 mt-1.5 w-80 rounded-xl border border-border bg-surface-raised p-3 shadow-xl"
        >
          <h3 className="text-[13px] font-medium text-text">Memory in this chat</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-text-faint">
            Applies to this conversation only. Nothing is deleted either way.
          </p>

          <div className="mt-3 space-y-1" role="radiogroup" aria-label="Memory scope">
            {MEMORY_SCOPES.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={scope === option}
                onClick={() => save(option, ids)}
                className={`flex w-full flex-col items-start rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                  scope === option ? "bg-surface text-text" : "text-text-muted hover:bg-surface/60"
                }`}
              >
                <span className="text-[13px]">{LABELS[option].label}</span>
                <span className="text-[11px] text-text-faint">{LABELS[option].hint}</span>
              </button>
            ))}
          </div>

          {scope === "selected" && (
            <div className="mt-3 border-t border-border-subtle pt-3">
              {memories === null ? (
                <p className="text-[12px] text-text-faint">Loading…</p>
              ) : memories.length === 0 ? (
                <p className="text-[12px] text-text-faint">
                  You have no saved memories yet, so this behaves like &ldquo;none&rdquo;.
                </p>
              ) : (
                <ul className="scroll-thin max-h-48 space-y-1 overflow-y-auto">
                  {memories.map((memory) => (
                    <li key={memory.id}>
                      <label className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 hover:bg-surface/60">
                        <input
                          type="checkbox"
                          checked={ids.includes(memory.id)}
                          onChange={() => toggle(memory.id)}
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
                        />
                        <span className="text-[12px] leading-relaxed text-text-secondary">
                          {memory.content}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
