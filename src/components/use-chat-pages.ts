"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatSummary } from "./chats-provider";

interface Page {
  chats: ChatSummary[];
  nextCursor: string | null;
}

export interface ChatPages {
  chats: ChatSummary[];
  /** The first page is on its way — nothing to show yet. */
  loading: boolean;
  /** A further page is on its way. Rows are already on screen. */
  loadingMore: boolean;
  hasMore: boolean;
  failed: boolean;
  /** Appends the next page. A no-op while one is in flight or at the end. */
  loadMore: () => Promise<void>;
  /** Drops a chat locally, so a delete does not need a full reload. */
  forget: (id: string) => void;
}

/**
 * Cursor-paged chats, for the browse-everything page.
 *
 * Kept out of `ChatsProvider` on purpose. That provider is mounted app-wide and
 * its list *is* the sidebar's list — paging into it would grow the sidebar to
 * hundreds of rows as a side effect of scrolling a different page. This owns
 * its own state and shares only the endpoint.
 */
export function useChatPages(search: string, archived: boolean): ChatPages {
  /**
   * Which query the state belongs to.
   *
   * State is stamped with it rather than reset when the query changes, so
   * `loading` and `failed` are *derived* — no effect has to fire a setState to
   * blank the list first. That reset was both an extra render and a window in
   * which the old list was still on screen labelled as current.
   */
  const queryKey = `${archived ? "1" : "0"}:${search.trim()}`;

  const [page, setPage] = useState({ key: "", chats: [] as ChatSummary[], hasMore: false });
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const settled = page.key === queryKey;
  const chats = settled ? page.chats : [];
  const loading = !settled && errorKey !== queryKey;
  const hasMore = settled && page.hasMore;
  const failed = errorKey === queryKey;

  /**
   * The next cursor, and the guard against fetching it twice.
   *
   * Refs, not state: a scroll sentinel can fire several times before React
   * commits, and a `loadingMore` flag read from state would still be `false`
   * on the second call. A ref is written and read in the same tick, so the
   * second call sees the first.
   */
  const cursor = useRef<string | null>(null);
  const fetching = useRef(false);
  /** Identity of the current query, for spotting a reply that arrives late. */
  const token = useRef({});

  const params = useCallback(
    (after?: string) => {
      const p = new URLSearchParams();
      if (after) p.set("cursor", after);
      if (search.trim()) p.set("q", search.trim());
      if (archived) p.set("archived", "1");
      return p;
    },
    [search, archived],
  );

  // First page, and a fresh one whenever the query changes.
  useEffect(() => {
    const mine = {};
    token.current = mine;
    cursor.current = null;
    fetching.current = false;

    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/chats?${params()}`, { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as Page;
        if (token.current !== mine) return;
        cursor.current = data.nextCursor;
        setPage({ key: queryKey, chats: data.chats, hasMore: data.nextCursor !== null });
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        console.error("[chats] failed to load:", error);
        if (token.current === mine) setErrorKey(queryKey);
      }
    })();
    return () => controller.abort();
  }, [params, queryKey]);

  const loadMore = useCallback(async () => {
    if (fetching.current || cursor.current === null) return;
    fetching.current = true;
    setLoadingMore(true);
    // Captured now: a page that lands after the query changed belongs to a
    // list that no longer exists, and appending it would mix two searches.
    const mine = token.current;

    try {
      const res = await fetch(`/api/chats?${params(cursor.current)}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as Page;
      if (token.current !== mine) return;

      cursor.current = data.nextCursor;
      setPage((prev) => {
        // A chat touched between two pages can arrive on both. Appending it
        // twice would give React duplicate keys and show the row twice.
        const seen = new Set(prev.chats.map((c) => c.id));
        return {
          key: prev.key,
          chats: [...prev.chats, ...data.chats.filter((c) => !seen.has(c.id))],
          hasMore: data.nextCursor !== null,
        };
      });
    } catch (error) {
      console.error("[chats] failed to load more:", error);
      setErrorKey(queryKey);
    } finally {
      if (token.current === mine) {
        fetching.current = false;
        setLoadingMore(false);
      }
    }
  }, [params, queryKey]);

  const forget = useCallback(
    (id: string) =>
      setPage((prev) => ({ ...prev, chats: prev.chats.filter((c) => c.id !== id) })),
    [],
  );

  return { chats, loading, loadingMore, hasMore, failed, loadMore, forget };
}
