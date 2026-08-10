"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { signOut } from "@/lib/auth-client";
import {
  useChatsActions,
  useChatsFilter,
  useChatsList,
  type ChatSummary,
} from "./chats-provider";
import { ConfirmDialog } from "./confirm-dialog";
import { useMenu } from "./use-menu";
import { ChatListSkeleton } from "./skeleton";
import {
  IconArchive,
  IconBrain,
  IconLogout,
  IconMore,
  IconPin,
  IconPlus,
  IconSearch,
  IconSliders,
  IconSpark,
  IconTrash,
  IconUser,
} from "./icons";

export interface SidebarUser {
  name: string;
  email: string;
  image: string | null;
}

/** Buckets chats the way ChatGPT and Claude do — recency, but named. */
function groupChats(chats: ChatSummary[]): Array<{ label: string; items: ChatSummary[] }> {
  const now = Date.now();
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

/**
 * One row in the chat list.
 *
 * Memoized because there can be a couple of hundred of these: without it, any
 * sidebar re-render — a keystroke in the filter, a title arriving for a new
 * chat — re-rendered every row and every one of their menus. `chat` objects are
 * replaced wholesale by the provider rather than mutated, so the default
 * shallow comparison is exactly right here.
 *
 * It reads only the *actions* context, which never changes after mount, so
 * subscribing here costs nothing.
 */
const ChatRow = memo(function ChatRow({
  chat,
  active,
}: {
  chat: ChatSummary;
  active: boolean;
}) {
  const { patchChat, removeChat } = useChatsActions();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(chat.title);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useMenu<HTMLDivElement>({
    open: menuOpen,
    onClose: closeMenu,
    roving: true,
    trigger: triggerRef,
  });

  const commitRename = () => {
    const title = draft.trim();
    setRenaming(false);
    if (title && title !== chat.title) void patchChat(chat.id, { title });
    else setDraft(chat.title);
  };

  if (renaming) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitRename}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitRename();
          if (e.key === "Escape") {
            setDraft(chat.title);
            setRenaming(false);
          }
        }}
        className="w-full rounded-lg border border-accent/50 bg-surface px-2.5 py-2 text-[13px] text-text focus:outline-none"
      />
    );
  }

  return (
    <div className="group relative">
      <Link
        href={`/c/${chat.id}`}
        className={`flex items-center gap-2 rounded-lg px-2.5 py-2 pr-8 text-[13px] transition-colors ${
          active
            ? "bg-surface-raised text-text"
            : "text-text-muted hover:bg-surface hover:text-text-secondary"
        }`}
      >
        {chat.pinned && <IconPin size={11} className="shrink-0 text-accent" />}
        <span className="truncate">{chat.title}</span>
      </Link>

      <button
        ref={triggerRef}
        type="button"
        aria-label={`Actions for ${chat.title}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={(e) => {
          e.preventDefault();
          setMenuOpen((v) => !v);
        }}
        className={`absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1 text-text-faint transition-opacity hover:bg-surface-raised hover:text-text ${
          menuOpen ? "opacity-100" : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
        }`}
      >
        <IconMore size={14} />
      </button>

      {menuOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Actions for ${chat.title}`}
          className="absolute right-1 top-full z-30 mt-1 w-44 overflow-hidden rounded-lg border border-border bg-surface-raised py-1 shadow-xl"
        >
          {[
            {
              label: chat.pinned ? "Unpin" : "Pin to top",
              icon: <IconPin size={13} />,
              run: () => void patchChat(chat.id, { pinned: !chat.pinned }),
            },
            {
              label: "Rename",
              icon: <IconSliders size={13} />,
              run: () => setRenaming(true),
            },
            {
              label: chat.archived ? "Unarchive" : "Archive",
              icon: <IconArchive size={13} />,
              run: () => void patchChat(chat.id, { archived: !chat.archived }),
            },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                item.run();
              }}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-text-secondary hover:bg-surface hover:text-text"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
          <div className="my-1 border-t border-border-subtle" role="separator" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              setConfirming(true);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-danger hover:bg-danger-soft"
          >
            <IconTrash size={13} />
            Delete
          </button>
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title="Delete this chat?"
          description={`"${chat.title}" and every message in it will be permanently removed. This cannot be undone.`}
          confirmLabel="Delete chat"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void removeChat(chat.id);
            if (active) router.push("/");
          }}
        />
      )}
    </div>
  );
});

function UserMenu({ user }: { user: SidebarUser }) {
  const [open, setOpen] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const router = useRouter();
  const close = useCallback(() => setOpen(false), []);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useMenu<HTMLDivElement>({
    open,
    onClose: close,
    roving: true,
    trigger: triggerRef,
  });

  return (
    <div className="relative">
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Account"
          className="absolute bottom-full left-0 z-30 mb-1 w-full overflow-hidden rounded-lg border border-border bg-surface-raised py-1 shadow-xl"
        >
          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-text-secondary hover:bg-surface hover:text-text"
          >
            <IconUser size={14} />
            Profile & settings
          </Link>
          <Link
            href="/memory"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-text-secondary hover:bg-surface hover:text-text"
          >
            <IconBrain size={14} />
            Memory
          </Link>
          <Link
            href="/skills"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-text-secondary hover:bg-surface hover:text-text"
          >
            <IconSpark size={14} />
            Skills
          </Link>
          <div className="my-1 border-t border-border-subtle" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setConfirmingSignOut(true);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-text-secondary hover:bg-surface hover:text-text"
          >
            <IconLogout size={14} />
            Sign out
          </button>
        </div>
      )}

      {confirmingSignOut && (
        <ConfirmDialog
          title="Sign out?"
          description="Your chats and memories stay on your account — you'll just need to sign in again to reach them."
          confirmLabel="Sign out"
          tone="neutral"
          pending={signingOut}
          pendingLabel="Signing out…"
          onCancel={() => setConfirmingSignOut(false)}
          onConfirm={() => {
            setSigningOut(true);
            void signOut({
              fetchOptions: {
                onSuccess: () => router.push("/sign-in"),
                onError: () => {
                  setSigningOut(false);
                  setConfirmingSignOut(false);
                },
              },
            });
          }}
        />
      )}

      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.name}`}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface"
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatar host varies by OAuth provider
          <img src={user.image} alt="" className="h-7 w-7 shrink-0 rounded-full" />
        ) : (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <IconUser size={14} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-text-secondary">
            {user.name}
          </span>
          <span className="block truncate text-[11px] text-text-faint">{user.email}</span>
        </span>
      </button>
    </div>
  );
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
  const { chats, loading } = useChatsList();
  const { search, showArchived } = useChatsFilter();
  const { setSearch, setShowArchived } = useChatsActions();
  const pathname = usePathname();
  const activeId = pathname.startsWith("/c/") ? pathname.slice(3) : null;
  // Grouping walks the whole list and builds a Date per chat; without this it
  // re-ran on every keystroke in the filter box.
  const groups = useMemo(() => groupChats(chats), [chats]);

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
        className={`fixed inset-y-0 left-0 z-40 w-[270px] transform-gpu overflow-hidden border-r border-border-subtle bg-bg-elevated backface-hidden transition-[transform,width] duration-[340ms] ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[transform] motion-reduce:transition-none lg:static lg:translate-x-0 lg:will-change-auto ${
          open ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "lg:w-0 lg:border-r-0" : ""}`}
      >
        <div className="flex h-full w-[270px] flex-col">
          <div className="flex items-center justify-between px-3 py-3">
            <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-text">
              <IconSpark size={15} className="text-accent" />
              Agentic Chat
            </Link>
          </div>

          <div className="px-3 pb-2">
            <Link
              href="/"
              onClick={onClose}
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-[13px] font-medium text-text transition-colors hover:border-border-strong hover:bg-surface-raised"
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
                className="w-full rounded-lg border border-border-subtle bg-surface py-2 pl-8 pr-3 text-[13px] text-text placeholder:text-text-faint focus:border-border-strong focus:outline-none"
              />
            </div>
          </div>

          <nav className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {loading ? (
              <div className="pt-2">
                <ChatListSkeleton />
              </div>
            ) : groups.length === 0 ? (
              <p className="px-2 py-4 text-[13px] leading-relaxed text-text-faint">
                {search
                  ? `No chats match "${search}".`
                  : showArchived
                    ? "Nothing archived."
                    : "No chats yet — start one above."}
              </p>
            ) : (
              groups.map((group) => (
                <div key={group.label} className="mb-3">
                  <h2 className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-text-faint">
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
          </nav>

          <div className="border-t border-border-subtle p-2">
            <button
              type="button"
              onClick={() => setShowArchived(!showArchived)}
              className="mb-1 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12px] text-text-faint transition-colors hover:bg-surface hover:text-text-secondary"
            >
              <IconArchive size={13} />
              {showArchived ? "Back to active chats" : "Archived"}
            </button>
            <UserMenu user={user} />
          </div>
        </div>
      </aside>
    </>
  );
}
