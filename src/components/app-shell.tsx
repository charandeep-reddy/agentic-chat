"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  useState,
  type ReactNode,
} from "react";
import { ChatsProvider, type ChatSummary } from "./chats-provider";
import { CommandPalette } from "./command-palette";
import { ProjectsProvider } from "./projects-provider";
import { Sidebar, type SidebarUser } from "./sidebar";
import type { ProjectSummary } from "@/lib/projects";

const SIDEBAR_STORAGE = "agentic-chat.sidebar";

/**
 * The desktop collapse preference lives in localStorage, which the server can't
 * read — so it's an external store rather than state. The server snapshot is
 * always "expanded"; React swaps in the stored value on hydration, instead of
 * the mismatch a lazy `useState` initializer would produce.
 */
const listeners = new Set<() => void>();
let snapshot: boolean | null = null;

function subscribeCollapsed(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getCollapsed(): boolean {
  if (snapshot === null) snapshot = localStorage.getItem(SIDEBAR_STORAGE) === "collapsed";
  return snapshot;
}

function setCollapsed(next: boolean) {
  snapshot = next;
  localStorage.setItem(SIDEBAR_STORAGE, next ? "collapsed" : "expanded");
  for (const listener of listeners) listener();
}

/**
 * The sidebar toggle, published to whatever page is mounted.
 *
 * Pages own their header — the chat header carries a title and a share button,
 * the settings pages carry tabs — but the button in it belongs to the shell.
 * A context is how it reaches them now that the shell is a layout: passing it
 * down would mean every page taking a prop from a component that no longer
 * renders it.
 *
 * The value is a single stable function, so this context never causes a
 * re-render after mount.
 */
const SidebarToggleContext = createContext<() => void>(() => {});

export function useSidebarToggle(): () => void {
  return useContext(SidebarToggleContext);
}

/**
 * Sidebar + content frame for every signed-in page. The sidebar is a static
 * column from `lg` up and an overlay drawer below it, so the chat gets the full
 * width on a phone.
 *
 * Rendered once, by `app/(app)/layout.tsx`, and deliberately not by the pages
 * themselves. A layout survives navigation: moving between chats, or opening a
 * new one, swaps only the content beside it. When each page mounted its own
 * shell, every navigation tore down the sidebar, the chat list provider and the
 * command palette and rebuilt them — which meant a refetch of `/api/chats`, a
 * skeleton flash, and the sidebar scroll position lost, on every click.
 */
export function AppShell({
  user,
  initialChats,
  initialProjects,
  children,
}: {
  user: SidebarUser;
  initialChats: ChatSummary[];
  initialProjects: ProjectSummary[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const collapsed = useSyncExternalStore(subscribeCollapsed, getCollapsed, () => false);

  // One control, two behaviours: below `lg` the sidebar is an overlay drawer, so
  // the toggle opens and closes it. From `lg` up it's a column in the layout,
  // and the toggle collapses it out of the way to give the chat the full width.
  const toggleSidebar = useCallback(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) setCollapsed(!getCollapsed());
    else setOpen((v) => !v);
  }, []);

  const closeDrawer = useCallback(() => setOpen(false), []);

  // Close the drawer on resize into desktop, so it can't be stuck open.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mq.matches) setOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "b" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      toggleSidebar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  /**
   * The page subtree is held still while the shell's own state changes.
   *
   * Opening the drawer re-renders AppShell, and without this the entire chat —
   * every message, every chart, every sandboxed frame — would re-render on the
   * main thread during the slide. That is what made the mobile drawer drop
   * frames. `children` comes from a server component, so its identity is stable
   * across these renders and the memo actually holds.
   */
  const content = useMemo(() => children, [children]);

  return (
    <SidebarToggleContext.Provider value={toggleSidebar}>
      <ChatsProvider initialChats={initialChats}>
        <ProjectsProvider initialProjects={initialProjects}>
          <div className="flex h-dvh overflow-hidden">
            <Sidebar user={user} open={open} collapsed={collapsed} onClose={closeDrawer} />
            {content}
          </div>
          <CommandPalette />
        </ProjectsProvider>
      </ChatsProvider>
    </SidebarToggleContext.Provider>
  );
}
