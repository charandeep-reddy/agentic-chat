"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Context,
  type ReactNode,
} from "react";

/**
 * Mirrors `CHATS_PAGE_SIZE` on the server.
 *
 * Duplicated rather than imported: that module is `server-only`, and pulling it
 * in here would drag the database client into the browser bundle. It is used
 * for one thing — deciding whether a seeded page was full, and so whether
 * there is more behind the "All chats" link.
 */
const PAGE_SIZE = 30;

/** How long a focus-triggered refetch stays suppressed. Alt-tabbing is not a data event. */
const FOCUS_REVALIDATE_MS = 30_000;

export interface ChatSummary {
  id: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  shareId: string | null;
  updatedAt: string;
}

/**
 * The context is split in three, by how often each part changes.
 *
 * A single context re-renders every consumer whenever any part of its value
 * changes — so with one context, typing a letter in the sidebar filter
 * re-rendered the chat transcript, and a streaming title update re-rendered
 * every row in the list. Splitting means each component subscribes only to what
 * it actually reads:
 *
 * - **Actions** never change after mount. `Chat` needs `refresh` and nothing
 *   else, so the provider can no longer re-render it at all.
 * - **List** changes when chats load or are patched.
 * - **Filter** changes on every keystroke, and only the sidebar's own controls
 *   read it.
 */
interface ChatsActions {
  refresh: () => Promise<void>;
  /**
   * Puts a newly started chat in the list, without asking the server.
   *
   * The client minted the id and knows every field, so there is nothing to go
   * and fetch. This replaced a full list reload fired 1.5s after the first
   * message — which is how long the chat used to take to appear in a sidebar
   * that already had everything it needed to draw it.
   */
  addChat: (chat: ChatSummary) => void;
  /** Local-only title update, for the title the server generates in the background. */
  setChatTitle: (id: string, title: string) => void;
  /** Applies a patch locally and to the server, rolling back on failure. */
  patchChat: (id: string, patch: Partial<ChatSummary>) => Promise<void>;
  removeChat: (id: string) => Promise<void>;
  setSearch: (value: string) => void;
  setShowArchived: (value: boolean) => void;
}

/**
 * The sidebar's list: the first page, and nothing else.
 *
 * Deliberately not paginated. The sidebar is a jump list for recent work, not
 * an archive — an infinite scroll there grows the DOM behind a navigation
 * surface nobody is reading to the end. Browsing everything is what `/chats`
 * is for, and `hasMore` is only here so the link to it can be honest.
 */
interface ChatsList {
  chats: ChatSummary[];
  hasMore: boolean;
}

interface ChatsFilter {
  search: string;
  showArchived: boolean;
}

const ActionsContext = createContext<ChatsActions | null>(null);
const ListContext = createContext<ChatsList | null>(null);
const FilterContext = createContext<ChatsFilter | null>(null);

function useRequired<T>(context: Context<T | null>, hook: string): T {
  const value = useContext(context);
  if (!value) throw new Error(`${hook} must be used inside <ChatsProvider>`);
  return value;
}

/** Mutations and reloads. Stable for the life of the provider. */
export function useChatsActions(): ChatsActions {
  return useRequired(ActionsContext, "useChatsActions");
}

/** The chat list itself. */
export function useChatsList(): ChatsList {
  return useRequired(ListContext, "useChatsList");
}

/** The sidebar's search text and archive toggle. */
export function useChatsFilter(): ChatsFilter {
  return useRequired(FilterContext, "useChatsFilter");
}

export function ChatsProvider({
  initialChats,
  children,
}: {
  /**
   * The first page, rendered by the server.
   *
   * The layout already awaits a session, so this rides along with a query that
   * was happening anyway. It means the sidebar is populated in the first
   * paint: no mount fetch, no skeleton. Only the default view can be seeded —
   * a search or the archived list still has to be asked for.
   */
  initialChats: ChatSummary[];
  children: ReactNode;
}) {
  const [chats, setChats] = useState<ChatSummary[]>(initialChats);
  const [hasMore, setHasMore] = useState(initialChats.length >= PAGE_SIZE);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce so typing in the sidebar filter doesn't fire a query per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 220);
    return () => clearTimeout(timer);
  }, [search]);

  /**
   * The current query, read through a ref so `load` never has to be rebuilt.
   *
   * `load` is handed out as `refresh`, and anything depending on its identity
   * would re-render on every keystroke if the query were a dependency.
   *
   * Synced in an effect declared *above* the one that fetches, so that within a
   * commit the query is current before any request reads it — effects run in
   * declaration order.
   */
  const query = useRef({ search: debouncedSearch, showArchived });
  useEffect(() => {
    query.current = { search: debouncedSearch, showArchived };
  }, [debouncedSearch, showArchived]);

  const load = useCallback(async (signal?: AbortSignal) => {
    const params = new URLSearchParams();
    const { search: q, showArchived: archived } = query.current;
    if (q.trim()) params.set("q", q.trim());
    if (archived) params.set("archived", "1");
    try {
      const res = await fetch(`/api/chats?${params}`, { signal });
      if (!res.ok) return;
      const data = (await res.json()) as { chats: ChatSummary[]; nextCursor: string | null };
      // Only to tell the "All chats" link whether there is anything behind it.
      setHasMore(data.nextCursor !== null);
      setChats(data.chats);
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      console.error("[chats] failed to load:", error);
    }
  }, []);

  /**
   * True until the seeded first page has been superseded by a real query.
   *
   * The server already rendered the default view, so fetching it again on
   * mount would be the same rows twice — and a skeleton over data that was
   * already on screen. Any *other* query (a search, the archived list) is not
   * seeded and must still be fetched, which is why this is spent rather than
   * checked against the filter: it is consumed by the first effect run, and
   * every run after that fetches normally.
   */
  const seeded = useRef(true);

  // Reload whenever the query changes, aborting the in-flight request so a
  // slow earlier response cannot overwrite a newer one.
  useEffect(() => {
    if (seeded.current) {
      seeded.current = false;
      return;
    }
    const controller = new AbortController();
    void (async () => {
      await load(controller.signal);
    })();
    return () => controller.abort();
  }, [load, debouncedSearch, showArchived]);

  /**
   * Catch up on changes made somewhere else when the tab comes back.
   *
   * The list no longer reconciles with the server as you use the app, which
   * means another tab, another device, or a chat deleted on `/chats` in a
   * second window would go unnoticed until reload. One refetch on focus covers
   * that without putting the per-navigation fetches back — and it is throttled,
   * because alt-tabbing is not a data event.
   */
  // Starts at 0 rather than `Date.now()`: reading the clock during render is
  // impure, and the seeded list is fresh anyway, so the first focus after mount
  // is free to revalidate.
  const lastFocusLoad = useRef(0);
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFocusLoad.current < FOCUS_REVALIDATE_MS) return;
      lastFocusLoad.current = Date.now();
      void load();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  /**
   * Optimistic patch with rollback.
   *
   * The previous list is captured inside the functional update rather than read
   * from `chats` in scope — that closure was the reason this callback changed
   * identity on every list change, which changed the context value, which
   * re-rendered every row in the sidebar.
   */
  const patchChat = useCallback(
    async (id: string, patch: Partial<ChatSummary>) => {
      let previous: ChatSummary[] = [];
      setChats((current) => {
        previous = current;
        return current.map((c) => (c.id === id ? { ...c, ...patch } : c));
      });
      try {
        const res = await fetch(`/api/chats/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error(String(res.status));
        // Archiving moves the chat out of the current list; pinning reorders it.
        if ("archived" in patch || "pinned" in patch) await load();
      } catch (error) {
        console.error("[chats] patch failed:", error);
        setChats(previous);
      }
    },
    [load],
  );

  /**
   * Inserts a chat in the position the server would have given it.
   *
   * Not simply unshifted: the ordering is pinned first, then most recent, so a
   * brand-new chat belongs above every unpinned row but below the pinned ones.
   * Getting that wrong is invisible until the next reload moves the row.
   */
  const addChat = useCallback((chat: ChatSummary) => {
    setChats((current) => {
      if (current.some((c) => c.id === chat.id)) return current;
      const firstUnpinned = current.findIndex((c) => !c.pinned);
      const at = firstUnpinned === -1 ? current.length : firstUnpinned;
      return [...current.slice(0, at), chat, ...current.slice(at)];
    });
  }, []);

  const setChatTitle = useCallback((id: string, title: string) => {
    setChats((current) =>
      current.map((c) => (c.id === id && c.title !== title ? { ...c, title } : c)),
    );
  }, []);

  const removeChat = useCallback(async (id: string) => {
    let previous: ChatSummary[] = [];
    setChats((current) => {
      previous = current;
      return current.filter((c) => c.id !== id);
    });
    try {
      const res = await fetch(`/api/chats/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
    } catch (error) {
      console.error("[chats] delete failed:", error);
      setChats(previous);
    }
  }, []);

  const actions = useMemo<ChatsActions>(
    () => ({ refresh: load, addChat, setChatTitle, patchChat, removeChat, setSearch, setShowArchived }),
    [load, addChat, setChatTitle, patchChat, removeChat],
  );

  const list = useMemo<ChatsList>(
    () => ({ chats, hasMore }),
    [chats, hasMore],
  );
  const filter = useMemo<ChatsFilter>(() => ({ search, showArchived }), [search, showArchived]);

  return (
    <ActionsContext.Provider value={actions}>
      <ListContext.Provider value={list}>
        <FilterContext.Provider value={filter}>{children}</FilterContext.Provider>
      </ListContext.Provider>
    </ActionsContext.Provider>
  );
}
