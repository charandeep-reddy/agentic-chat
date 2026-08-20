"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useChatsActions, useChatsFilter, useChatsList, type ChatSummary } from "../chat/chats-provider";
import { clampSidebarWidth } from "../../lib/sidebar-width";
import { setStoredSidebarWidth, useStoredSidebarWidth } from "./use-sidebar-width";
import { startNewChat } from "./new-chat";
import { ChatRow } from "./sidebar-chat-row";
import { ProjectsSection } from "./sidebar-projects-section";
import { UserMenu, type SidebarUser } from "./sidebar-user-menu";
import { IconLogo, IconPlus, IconSearch } from "../icons";

export type { SidebarUser };

/**
 * Buckets chats the way ChatGPT and Claude do — recency, but named.
 *
 * `now` is a parameter rather than read with `Date.now()` in here: this runs
 * inside a `useMemo` in the component below, and a clock read during render
 * is what `react-hooks/purity` exists to forbid — the lint rule just can't
 * see it because the call is one function away. Same pattern as `now` in
 * `all-chats-page.tsx`.
 */
function groupChats(chats: ChatSummary[], now: number): Array<{ label: string; items: ChatSummary[] }> {
  const day = 86_400_000;
  const groups: Record<string, ChatSummary[]> = {
    Pinned: [],
    Today: [],
    Yesterday: [],
    "Previous 7 days": [],
    "Previous 30 days": [],
    Older: [],
  };

  for (const chat of chats) {
    if (chat.pinned) {
      groups.Pinned.push(chat);
      continue;
    }
    const age = now - new Date(chat.updatedAt).getTime();
    if (age < day) groups.Today.push(chat);
    else if (age < 2 * day) groups.Yesterday.push(chat);
    else if (age < 7 * day) groups["Previous 7 days"].push(chat);
    else if (age < 30 * day) groups["Previous 30 days"].push(chat);
    else groups.Older.push(chat);
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}

export function Sidebar({
  user,
  open,
  collapsed,
  onClose,
}: {
  user: SidebarUser;
  open: boolean;
  /** Desktop only — the drawer below `lg` is driven by `open`. */
  collapsed: boolean;
  onClose: () => void;
}) {
  const { chats, hasMore } = useChatsList();
  const { search } = useChatsFilter();
  const { setSearch } = useChatsActions();
  const pathname = usePathname();
  const activeId = pathname.startsWith("/c/") ? pathname.slice(3) : null;
  // Only the first segment after `/projects/` — the settings route lives one
  // level deeper and must still light the same row.
  const activeProjectId = pathname.startsWith("/projects/")
    ? (pathname.slice(10).split("/")[0] ?? null)
    : null;
  const [now] = useState(() => Date.now());
  // Grouping walks the whole list and builds a Date per chat; without this it
  // re-ran on every keystroke in the filter box.
  const groups = useMemo(() => groupChats(chats, now), [chats, now]);

  const storedWidth = useStoredSidebarWidth();
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const width = dragWidth ?? storedWidth;
  const isDragging = dragWidth !== null;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    // Read at drag-end, whichever path ends it — a plain closure over the
    // latest `clientX` would need its own ref, this is simpler.
    let lastX = e.clientX;

    const end = (finalX: number) => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("blur", onBlur);
      setDragWidth(null);
      setStoredSidebarWidth(clampSidebarWidth(finalX));
    };

    const onMouseMove = (moveEvent: MouseEvent) => {
      lastX = moveEvent.clientX;
      setDragWidth(clampSidebarWidth(lastX));
    };

    const onMouseUp = (upEvent: MouseEvent) => end(upEvent.clientX);

    // The OS can steal the mouseup (alt-tab, a system dialog) — without this
    // the drag never formally ends and the sidebar snaps to wherever the next
    // unrelated click in the window happens to land.
    const onBlur = () => end(lastX);

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("blur", onBlur);
  }, []);

  return (
    <>
      {/*
        Always mounted so it can fade both ways — unmounting on close would cut
        the exit transition off mid-flight and snap the scrim away while the
        drawer is still sliding out. `pointer-events-none` is what actually makes
        it inert when closed.

        The scrim is deliberately faster than the drawer: it reaches full
        opacity before the panel finishes sliding, so the eye reads one motion
        rather than two.
      */}
      <div
        className={`fixed inset-0 z-30 bg-black/60 transition-opacity duration-[220ms] ease-[cubic-bezier(0.32,0.72,0,1)] will-change-[opacity] motion-reduce:transition-none lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden
      />

      {/*
        Two axes, one element: below `lg` it slides in as an overlay drawer, and
        from `lg` up it animates its own width down to nothing. The inner column
        keeps a fixed width so the contents slide out of view rather than
        squashing as the container closes.

        `transform-gpu` + `will-change` put the drawer on its own compositor
        layer, so the slide is a layer offset rather than a repaint of the whole
        chat list on every frame — that repaint is why the phone felt heavier
        than the desktop collapse. Nothing here animates box-shadow: a 270px-tall
        blurred shadow is re-rasterised each frame and is the single most
        expensive thing you can put in a drawer transition.

        The easing is an ease-out-expo style curve (0.16, 1, 0.3, 1): fast to
        leave the edge, long gentle deceleration into rest. The steeper
        `(0.32, 0.72, 0, 1)` curve used previously reached rest so early the
        tail looked like a snap on low-refresh-rate phones. The scrim gets a
        shorter duration than the panel (see above) so the fade completes first.
      */}
      <aside
        style={{
          width: collapsed ? 0 : `${width}px`,
          transitionDuration: isDragging ? "0ms" : undefined,
        }}
        className={`fixed inset-y-0 left-0 z-40 transform-gpu overflow-hidden border-r border-border-subtle bg-bg-elevated backface-hidden transition-[transform,width] duration-[340ms] ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[transform] motion-reduce:transition-none lg:static lg:translate-x-0 lg:will-change-auto ${
          open ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "lg:border-r-0" : ""}`}
      >
        <div
          style={{ width: `${width}px` }}
          className="relative flex h-full flex-col"
        >
          <div className="flex items-center justify-between px-3 py-3">
            <Link href="/" className="flex items-center gap-2 text-ui font-semibold text-text">
              <IconLogo size={15} className="text-accent" />
              Agentic Chat
            </Link>
          </div>

          <div className="px-3 pb-2">
            <Link
              href="/"
              onClick={() => {
                // The href alone is not enough once a chat has claimed its URL
                // — see `new-chat.ts`.
                startNewChat();
                onClose();
              }}
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-dense font-medium text-text transition-colors hover:border-border-strong hover:bg-surface-raised"
            >
              <IconPlus size={14} />
              New chat
            </Link>
          </div>

          <div className="px-3 pb-2">
            <div className="relative">
              <IconSearch
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search chats"
                className="w-full rounded-lg border border-border-subtle bg-surface py-2 pl-8 pr-3 text-dense text-text placeholder:text-text-faint focus:border-border-strong focus:outline-none"
              />
            </div>
          </div>

          <nav className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {/* Hidden while filtering: the search is a query over chats, and a
                projects list that ignores it reads as a result that matched. */}
            {!search && <ProjectsSection activeProjectId={activeProjectId} onNavigate={onClose} />}

            {groups.length === 0 ? (
              <p className="px-2 py-4 text-dense leading-relaxed text-text-faint">
                {search ? `No chats match "${search}".` : "No chats yet — start one above."}
              </p>
            ) : (
              groups.map((group) => (
                <div key={group.label} className="mb-3">
                  <h2 className="px-2.5 pb-1 text-micro font-medium uppercase tracking-wider text-text-faint">
                    {group.label}
                  </h2>
                  <div className="space-y-0.5">
                    {group.items.map((chat) => (
                      <ChatRow key={chat.id} chat={chat} active={chat.id === activeId} />
                    ))}
                  </div>
                </div>
              ))
            )}

            {/* The way out of a deliberately short list. Shown only when
                there is something behind it, so it never promises a page of
                nothing. */}
            {hasMore && (
              <Link
                href="/chats"
                className="mt-1 flex items-center justify-between rounded-lg px-2.5 py-2 text-dense text-text-muted transition-colors hover:bg-surface hover:text-text"
              >
                All chats
                <span aria-hidden className="text-text-faint">
                  &rsaquo;
                </span>
              </Link>
            )}
          </nav>

          <div className="border-t border-border-subtle p-2">
            <UserMenu user={user} />
          </div>

          {/* Desktop resize handle. The hit target runs the full height for an
              easy grab, but stays invisible — a rail colored top-to-bottom
              read as a second border, not a control. Only the small centered
              grip is ever painted. */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            onMouseDown={handleMouseDown}
            className="group hidden lg:block absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize select-none z-50"
          >
            <div
              className={`absolute right-0 top-1/2 h-10 w-1 -translate-y-1/2 rounded-full transition-colors ${
                isDragging ? "bg-accent" : "bg-transparent group-hover:bg-accent/50"
              }`}
            />
          </div>
        </div>
      </aside>
    </>
  );
}
