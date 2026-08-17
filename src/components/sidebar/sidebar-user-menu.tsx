import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { signOut } from "@/lib/auth-client";
import { ConfirmDialog } from "../confirm-dialog";
import { useMenu } from "../use-menu";
import { IconBrain, IconLogout, IconSpark, IconUser } from "../icons";

export interface SidebarUser {
  name: string;
  email: string;
  image: string | null;
}

export function UserMenu({ user }: { user: SidebarUser }) {
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
            className="flex items-center gap-2.5 px-3 py-2 text-dense text-text-secondary hover:bg-surface hover:text-text"
          >
            <IconUser size={14} />
            Profile & settings
          </Link>
          <Link
            href="/memory"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-dense text-text-secondary hover:bg-surface hover:text-text"
          >
            <IconBrain size={14} />
            Memory
          </Link>
          <Link
            href="/skills"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-dense text-text-secondary hover:bg-surface hover:text-text"
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
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-dense text-text-secondary hover:bg-surface hover:text-text"
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
          <span className="block truncate text-dense font-medium text-text-secondary">{user.name}</span>
          <span className="block truncate text-micro text-text-faint">{user.email}</span>
        </span>
      </button>
    </div>
  );
}
