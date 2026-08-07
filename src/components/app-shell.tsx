"use client";

import { useCallback, useEffect, useSyncExternalStore, useState, type ReactNode } from "react";
import { ChatsProvider } from "./chats-provider";
import { CommandPalette } from "./command-palette";
import { Sidebar, type SidebarUser } from "./sidebar";

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
 * Sidebar + content frame shared by every signed-in page. The sidebar is a
 * static column from `lg` up and an overlay drawer below it, so the chat gets
 * the full width on a phone.
 *
 * `children` is a render prop because the content needs the drawer toggle for
 * its own header button; that also means every page using the shell is a
 * client component, which is fine — they all need interactivity anyway.
 */
export function AppShell({
  user,
  children,
}: {
  user: SidebarUser;
  children: (props: { toggleSidebar: () => void }) => ReactNode;
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

  return (
    <ChatsProvider>
      <div className="flex h-dvh overflow-hidden">
        <Sidebar
          user={user}
          open={open}
          collapsed={collapsed}
          onClose={() => setOpen(false)}
        />
        {children({ toggleSidebar })}
      </div>
      <CommandPalette />
    </ChatsProvider>
  );
}
