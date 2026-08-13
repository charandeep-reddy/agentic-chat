"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "./page-shell";
import { useChatPages } from "./use-chat-pages";
import { useChatsActions } from "./chats-provider";
import { ConfirmDialog } from "./confirm-dialog";
import { IconArchive, IconPin, IconSearch, IconTrash } from "./icons";

/** Same buckets as the sidebar, so the two lists read as one thing. */
function bucketOf(updatedAt: string, now: number): string {
  const day = 86_400_000;
  const age = now - new Date(updatedAt).getTime();
  if (age < day) return "Today";
  if (age < 2 * day) return "Yesterday";
  if (age < 7 * day) return "Previous 7 days";
  if (age < 30 * day) return "Previous 30 days";
  return "Older";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * `archived` is read straight from the prop, never copied into state.
 *
 * The tabs are links, so switching them is a navigation: the server component
 * re-renders with the new search param and hands down a new value. Holding it
 * in `useState` read that prop exactly once, at mount — the URL and the tab
 * highlight changed, the list did not, and both tabs showed the same chats.
 * There is one source of truth for this and it is the URL.
 */
export function AllChatsPage({ archived }: { archived: boolean }) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [confirming, setConfirming] = useState<{ id: string; title: string } | null>(null);

  // Typing should not fire a query per keystroke — and here each one can be a
  // full-text search across every message body.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(input), 220);
    return () => clearTimeout(timer);
  }, [input]);

  const { chats, loading, loadingMore, hasMore, failed, loadMore, forget } = useChatPages(
    search,
    archived,
  );
  // The sidebar keeps its own copy, so a change made here has to reach it.
  const { patchChat, removeChat, refresh } = useChatsActions();

  const sentinelRef = useRef<HTMLDivElement>(null);

  /**
   * Loads the next page when the end comes into view.
   *
   * `rootMargin` starts the fetch a screen early, so scrolling never stops at
   * a spinner. Rebuilt when `hasMore` flips, because the sentinel unmounts at
   * the end — there is nothing left to watch.
   */
  useEffect(() => {
    const target = sentinelRef.current;
    if (!target || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "600px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  // Headings are inserted between rows rather than nesting the list, so a page
  // arriving mid-bucket continues it instead of starting a second one with the
  // same name.
  // Read once, at mount. "Today" must not quietly become "Yesterday" under a
  // row you are looking at, and the clock is not something render may consult.
  const [now] = useState(() => Date.now());

  const rows = useMemo(() => {
    const labels = chats.map((chat) =>
      chat.pinned ? "Pinned" : bucketOf(chat.updatedAt, now),
    );
    // Compared against the previous label rather than tracked in a running
    // variable, so nothing is reassigned once the list is built.
    return chats.map((chat, i) => ({
      chat,
      heading: labels[i] === labels[i - 1] ? null : labels[i],
    }));
  }, [chats, now]);

  const onArchive = useCallback(
    (id: string, next: boolean) => {
      forget(id);
      void patchChat(id, { archived: next });
    },
    [forget, patchChat],
  );

  return (
    <PageShell
      title="All chats"
      description="Everything you have started, newest first. Scroll to load more."
      tabs={[
        { href: "/chats", label: "Active", active: !archived },
        { href: "/chats?archived=1", label: "Archived", active: archived },
      ]}
    >
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-surface px-3">
        <IconSearch size={14} className="shrink-0 text-text-faint" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search titles and message text…"
          className="h-10 min-w-0 flex-1 bg-transparent text-[13px] text-text placeholder-text-faint focus:outline-none"
        />
      </div>

      {loading ? (
        <div className="space-y-1">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-11 animate-pulse rounded-lg bg-surface/60" />
          ))}
        </div>
      ) : chats.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-text-faint">
          {search
            ? `No chats match "${search}".`
            : archived
              ? "Nothing archived."
              : "No chats yet."}
        </p>
      ) : (
        <div>
          {rows.map(({ chat, heading }) => (
            <div key={chat.id}>
              {heading && (
                <h2 className="px-1 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-text-faint">
                  {heading}
                </h2>
              )}
              <div className="group flex items-center gap-2 rounded-lg pr-1 transition-colors hover:bg-surface">
                <Link
                  href={`/c/${chat.id}`}
                  className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2.5 text-[13px] text-text-secondary"
                >
                  {chat.pinned && <IconPin size={11} className="shrink-0 text-accent" />}
                  <span className="min-w-0 flex-1 truncate">{chat.title}</span>
                  <span className="shrink-0 font-mono text-[11px] text-text-faint">
                    {formatDate(chat.updatedAt)}
                  </span>
                </Link>

                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    type="button"
                    aria-label={chat.pinned ? `Unpin ${chat.title}` : `Pin ${chat.title}`}
                    onClick={() => void patchChat(chat.id, { pinned: !chat.pinned })}
                    className={`rounded-md p-1.5 transition-colors hover:bg-surface-raised ${
                      chat.pinned ? "text-accent" : "text-text-faint hover:text-text"
                    }`}
                  >
                    <IconPin size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={
                      chat.archived ? `Unarchive ${chat.title}` : `Archive ${chat.title}`
                    }
                    onClick={() => onArchive(chat.id, !chat.archived)}
                    className="rounded-md p-1.5 text-text-faint transition-colors hover:bg-surface-raised hover:text-text"
                  >
                    <IconArchive size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${chat.title}`}
                    onClick={() => setConfirming({ id: chat.id, title: chat.title })}
                    className="rounded-md p-1.5 text-text-faint transition-colors hover:bg-danger-soft hover:text-danger"
                  >
                    <IconTrash size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {hasMore && (
            <div ref={sentinelRef} className="py-6 text-center">
              {loadingMore && (
                <span className="font-mono text-[11px] text-text-faint">loading more…</span>
              )}
            </div>
          )}

          {failed && (
            <div className="py-6 text-center">
              <p className="mb-2 text-[13px] text-danger">Could not load more chats.</p>
              <button
                type="button"
                onClick={() => void loadMore()}
                className="rounded-md border border-border-strong px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-raised"
              >
                Try again
              </button>
            </div>
          )}

          {!hasMore && !failed && chats.length > 20 && (
            <p className="py-6 text-center font-mono text-[11px] text-text-faint">
              {chats.length} chats · that&rsquo;s all of them
            </p>
          )}
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title="Delete this chat?"
          description={`"${confirming.title}" and every message in it will be permanently removed. This cannot be undone.`}
          confirmLabel="Delete chat"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const { id } = confirming;
            setConfirming(null);
            // Locally first so the row goes immediately, then through the
            // shared store so the sidebar drops it too.
            forget(id);
            void removeChat(id).then(() => void refresh());
            router.refresh();
          }}
        />
      )}
    </PageShell>
  );
}
