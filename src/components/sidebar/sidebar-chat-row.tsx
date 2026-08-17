import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useCallback, useRef, useState } from "react";
import { useChatsActions, type ChatSummary } from "../chat/chats-provider";
import { useProjects } from "../projects/projects-provider";
import { ConfirmDialog } from "../confirm-dialog";
import { MoveToProject } from "./sidebar-move-to-project";
import { useMenu } from "../use-menu";
import { IconFolder, IconMore, IconPin, IconSliders, IconTrash } from "../icons";

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
export const ChatRow = memo(function ChatRow({
  chat,
  active,
}: {
  chat: ChatSummary;
  active: boolean;
}) {
  const { patchChat, removeChat } = useChatsActions();
  const projects = useProjects();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [movingToProject, setMovingToProject] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(chat.title);
  // The second panel is reset on the way out, so reopening the menu always
  // starts at the top rather than wherever it was abandoned.
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setMovingToProject(false);
  }, []);
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
        className="w-full rounded-lg border border-accent/50 bg-surface px-2.5 py-2 text-dense text-text focus:outline-none"
      />
    );
  }

  return (
    <div className="group relative">
      <Link
        href={`/c/${chat.id}`}
        className={`flex items-center gap-2 rounded-lg px-2.5 py-2 pr-8 text-dense transition-colors ${
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
          className="absolute right-1 top-full z-30 mt-1 w-48 overflow-hidden rounded-lg border border-border bg-surface-raised py-1 shadow-xl"
        >
          {/*
            One menu, two panels, rather than a hover-open submenu. A submenu
            that opens sideways has nowhere to go against the right edge of a
            270px sidebar, and it is the hardest menu pattern to operate with a
            finger or a keyboard.
          */}
          {movingToProject ? (
            <MoveToProject
              current={chat.projectId}
              onBack={() => setMovingToProject(false)}
              onPick={(projectId) => {
                setMenuOpen(false);
                setMovingToProject(false);
                void patchChat(chat.id, { projectId });
              }}
            />
          ) : (
            <>
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
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    item.run();
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-dense text-text-secondary hover:bg-surface hover:text-text"
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}

              {/* Only when there is somewhere to move it to. An item that opens
                  an empty list is a promise the menu cannot keep. */}
              {(projects.length > 0 || chat.projectId) && (
                <button
                  type="button"
                  role="menuitem"
                  // Keeps the menu open — this one leads somewhere rather than
                  // doing something.
                  onClick={() => setMovingToProject(true)}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-dense text-text-secondary hover:bg-surface hover:text-text"
                >
                  <IconFolder size={13} />
                  <span className="flex-1">Move to project</span>
                  <span aria-hidden className="text-text-faint">
                    &rsaquo;
                  </span>
                </button>
              )}

              <div className="my-1 border-t border-border-subtle" role="separator" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirming(true);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-dense text-danger hover:bg-danger-soft"
              >
                <IconTrash size={13} />
                Delete
              </button>
            </>
          )}
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
