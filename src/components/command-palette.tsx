"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChatSummary } from "./chats-provider";
import { requestLeave } from "./leave-guard";
import {
  IconBrain,
  IconIncognito,
  IconMessage,
  IconPlus,
  IconSearch,
  IconSpark,
  IconUser,
} from "./icons";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: typeof IconPlus;
  href: string;
}

const PAGES: Command[] = [
  { id: "new", label: "New chat", hint: "⌘ ⇧ O", icon: IconPlus, href: "/" },
  { id: "private", label: "New private chat", hint: "⌘ ⇧ P", icon: IconIncognito, href: "/private" },
  { id: "memory", label: "Memory & packs", icon: IconBrain, href: "/memory" },
  { id: "skills", label: "Skills", icon: IconSpark, href: "/skills" },
  { id: "profile", label: "Profile & settings", icon: IconUser, href: "/profile" },
];

/** Stable per-row id, so `aria-activedescendant` has something to point at. */
function optionId(id: string): string {
  return `palette-option-${id}`;
}

/**
 * ⌘K switcher. It runs its own chat query rather than borrowing the sidebar's,
 * so opening the palette never disturbs the filter the user left in the
 * sidebar. The query hits the same endpoint, which matches message bodies as
 * well as titles.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [queryAtLastReset, setQueryAtLastReset] = useState("");
  const [cursor, setCursor] = useState(0);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const listRef = useRef<HTMLUListElement>(null);

  // Moving the highlight back to the top belongs to the same update as the
  // query change, so it happens during render instead of in an effect.
  if (query !== queryAtLastReset) {
    setQueryAtLastReset(query);
    setCursor(0);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
          const res = await fetch(`/api/chats${params}`, { signal: controller.signal });
          if (!res.ok) return;
          const data = (await res.json()) as { chats: ChatSummary[] };
          setChats(data.chats);
        } catch (error) {
          if ((error as Error).name === "AbortError") return;
          console.error("[palette] chat search failed:", error);
        }
      })();
    }, 160);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  const commands: Command[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pages = q ? PAGES.filter((p) => p.label.toLowerCase().includes(q)) : PAGES;
    const chatCommands = chats.slice(0, 20).map((chat) => ({
      id: chat.id,
      label: chat.title,
      icon: IconMessage,
      href: `/c/${chat.id}`,
    }));
    return [...pages, ...chatCommands];
  }, [query, chats]);

  useEffect(() => {
    listRef.current?.children[cursor]?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    // Closed first either way: leaving the palette open behind a confirmation
    // dialog stacks two overlays, and cancelling should return the user to the
    // chat they are protecting rather than to the switcher.
    void requestLeave().then((ok) => {
      if (ok) router.push(href);
    });
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh]"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface-raised shadow-2xl"
      >
        <div className="flex items-center gap-2.5 border-b border-border-subtle px-3.5">
          <IconSearch size={15} className="shrink-0 text-text-faint" />
          <input
            autoFocus
            value={query}
            placeholder="Search chats or jump to a page…"
            // A combobox driving a listbox: the focus never leaves the input,
            // so `aria-activedescendant` is the only thing that tells a screen
            // reader which row is highlighted.
            role="combobox"
            aria-expanded
            aria-controls="palette-listbox"
            aria-activedescendant={commands[cursor] ? optionId(commands[cursor].id) : undefined}
            aria-autocomplete="list"
            aria-label="Search chats or jump to a page"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, commands.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              }
              if (e.key === "Home") {
                e.preventDefault();
                setCursor(0);
              }
              if (e.key === "End") {
                e.preventDefault();
                setCursor(Math.max(0, commands.length - 1));
              }
              if (e.key === "Enter") {
                e.preventDefault();
                const target = commands[cursor];
                if (target) go(target.href);
              }
            }}
            className="w-full bg-transparent py-3.5 text-sm text-text placeholder:text-text-faint focus:outline-none"
          />
          {/* Touch closes this by tapping outside; there is no esc to offer. */}
          <kbd className="hidden shrink-0 rounded border border-border-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-faint pointer-fine:block">
            esc
          </kbd>
        </div>

        {commands.length === 0 ? (
          <p role="status" className="px-4 py-8 text-center text-[13px] text-text-faint">
            Nothing matches &ldquo;{query}&rdquo;.
          </p>
        ) : (
          <ul
            ref={listRef}
            id="palette-listbox"
            role="listbox"
            aria-label="Results"
            className="scroll-thin max-h-[45vh] overflow-y-auto p-1.5"
          >
            {commands.map((command, i) => (
              <li key={command.id} role="presentation">
                <button
                  type="button"
                  id={optionId(command.id)}
                  role="option"
                  aria-selected={i === cursor}
                  // The input keeps focus, so these must not be tab stops of
                  // their own — the arrow keys are the way through the list.
                  tabIndex={-1}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(command.href)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
                    i === cursor ? "bg-surface text-text" : "text-text-muted"
                  }`}
                >
                  <command.icon size={14} className="shrink-0 opacity-60" />
                  <span className="min-w-0 flex-1 truncate">{command.label}</span>
                  {command.hint && (
                    <kbd className="hidden shrink-0 rounded border border-border-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-faint pointer-fine:block">
                      {command.hint}
                    </kbd>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
