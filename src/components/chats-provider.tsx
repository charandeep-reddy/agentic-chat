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
  /** Applies a patch locally and to the server, rolling back on failure. */
  patchChat: (id: string, patch: Partial<ChatSummary>) => Promise<void>;
  removeChat: (id: string) => Promise<void>;
  setSearch: (value: string) => void;
  setShowArchived: (value: boolean) => void;
}

interface ChatsList {
  chats: ChatSummary[];
  loading: boolean;
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

export function ChatsProvider({ children }: { children: ReactNode }) {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
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
      const data = (await res.json()) as { chats: ChatSummary[] };
      setChats(data.chats);
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      console.error("[chats] failed to load:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload whenever the query changes, aborting the in-flight request so a
  // slow earlier response cannot overwrite a newer one.
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await load(controller.signal);
    })();
    return () => controller.abort();
  }, [load, debouncedSearch, showArchived]);

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
    () => ({ refresh: load, patchChat, removeChat, setSearch, setShowArchived }),
    [load, patchChat, removeChat],
  );

  const list = useMemo<ChatsList>(() => ({ chats, loading }), [chats, loading]);
  const filter = useMemo<ChatsFilter>(() => ({ search, showArchived }), [search, showArchived]);

  return (
    <ActionsContext.Provider value={actions}>
      <ListContext.Provider value={list}>
        <FilterContext.Provider value={filter}>{children}</FilterContext.Provider>
      </ListContext.Provider>
    </ActionsContext.Provider>
  );
}
