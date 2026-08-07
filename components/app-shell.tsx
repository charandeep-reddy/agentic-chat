"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChatsProvider } from "./chats-provider";
import { Sidebar, type SidebarUser } from "./sidebar";

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

  // Close the drawer on resize into desktop, so it can't be stuck open.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mq.matches) setOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <ChatsProvider>
      <div className="flex h-dvh overflow-hidden">
        <Sidebar user={user} open={open} onClose={() => setOpen(false)} />
        {children({ toggleSidebar: () => setOpen((v) => !v) })}
      </div>
    </ChatsProvider>
  );
}
