"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
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

interface ChatsValue {
  chats: ChatSummary[];
  loading: boolean;
  search: string;
  setSearch: (value: string) => void;
  showArchived: boolean;
  setShowArchived: (value: boolean) => void;
  refresh: () => Promise<void>;
  /** Applies a patch locally and to the server, rolling back on failure. */
  patchChat: (id: string, patch: Partial<ChatSummary>) => Promise<void>;
  removeChat: (id: string) => Promise<void>;
}

const ChatsContext = createContext<ChatsValue | null>(null);

export function useChats(): ChatsValue {
  const value = useContext(ChatsContext);
  if (!value) throw new Error("useChats must be used inside <ChatsProvider>");
  return value;
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

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
      if (showArchived) params.set("archived", "1");
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
    },
    [debouncedSearch, showArchived],
  );

  // Reload whenever the query changes, aborting the in-flight request so a
  // slow earlier response cannot overwrite a newer one. The state updates all
  // happen after the fetch resolves, not synchronously during the effect.
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await load(controller.signal);
    })();
    return () => controller.abort();
  }, [load]);

  const patchChat = useCallback(
    async (id: string, patch: Partial<ChatSummary>) => {
      const previous = chats;
      setChats((current) => current.map((c) => (c.id === id ? { ...c, ...patch } : c)));
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
    [chats, load],
  );

  const removeChat = useCallback(
    async (id: string) => {
      const previous = chats;
      setChats((current) => current.filter((c) => c.id !== id));
      try {
        const res = await fetch(`/api/chats/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(String(res.status));
      } catch (error) {
        console.error("[chats] delete failed:", error);
        setChats(previous);
      }
    },
    [chats],
  );

  const value = useMemo(
    () => ({
      chats,
      loading,
      search,
      setSearch,
      showArchived,
      setShowArchived,
      refresh: load,
      patchChat,
      removeChat,
    }),
    [chats, loading, search, showArchived, load, patchChat, removeChat],
  );

  return <ChatsContext.Provider value={value}>{children}</ChatsContext.Provider>;
}
