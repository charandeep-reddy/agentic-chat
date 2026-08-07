import type { CSSProperties } from "react";

/**
 * A placeholder block. Skeletons stand in for content whose *shape* is already
 * known — a chat list, a transcript, a settings form. Where the shape isn't
 * known, a spinner is the honest choice; a skeleton that doesn't match what
 * arrives reads as a layout jump.
 */
export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div aria-hidden style={style} className={`animate-pulse rounded bg-surface-raised ${className}`} />
  );
}

/**
 * Static stand-in for the sidebar. Route-level `loading.tsx` replaces the whole
 * page — the sidebar included, since it's rendered inside the page rather than
 * the layout — so the skeleton has to redraw the frame or the app appears to
 * collapse to a blank screen on every navigation.
 */
export function SidebarSkeleton() {
  return (
    <div className="hidden w-[270px] shrink-0 flex-col border-r border-border-subtle bg-bg-elevated lg:flex">
      <div className="flex items-center px-3 py-3">
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="px-3 pb-2">
        <Skeleton className="h-[42px] w-full rounded-xl" />
      </div>
      <div className="px-3 pb-2">
        <Skeleton className="h-[38px] w-full rounded-lg" />
      </div>
      <div className="px-2 pt-2">
        <ChatListSkeleton />
      </div>
    </div>
  );
}

/** Grouped rows with varied widths, matching the real sidebar's chat list. */
export function ChatListSkeleton() {
  return (
    <div className="space-y-4">
      {[
        { label: "w-12", rows: [88, 72, 94] },
        { label: "w-20", rows: [80, 64] },
      ].map((group, groupIndex) => (
        <div key={groupIndex}>
          <Skeleton className={`mb-2 ml-2.5 h-2.5 ${group.label}`} />
          <div className="space-y-1">
            {group.rows.map((width, rowIndex) => (
              <div key={rowIndex} className="px-2.5 py-2">
                <Skeleton className="h-3" style={{ width: `${width}%` }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Header bar used by every page skeleton, so the 48px row never jumps. */
function HeaderSkeleton() {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
      <Skeleton className="h-7 w-7 rounded-md" />
      <Skeleton className="h-3 w-40" />
    </header>
  );
}

/**
 * Full-page fallback for the chat route: frame, transcript, composer.
 * `empty` is the new-chat case — there is no transcript to stand in for, and
 * drawing messages that will never appear is worse than drawing nothing.
 */
export function ChatSkeleton({ empty = false }: { empty?: boolean }) {
  return (
    <div className="flex h-dvh overflow-hidden">
      <SidebarSkeleton />
      <div className="flex h-dvh min-w-0 flex-1 flex-col">
        <HeaderSkeleton />
        <div className="min-h-0 flex-1 overflow-hidden">
          <div
            className={`mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 ${empty ? "hidden" : ""}`}
          >
            {[
              { mine: true, widths: [42] },
              { mine: false, widths: [100, 92, 78] },
              { mine: true, widths: [30] },
              { mine: false, widths: [96, 88, 60] },
            ].map((message, index) =>
              message.mine ? (
                <div key={index} className="flex justify-end">
                  <Skeleton
                    className="h-10 rounded-2xl rounded-br-md"
                    style={{ width: `${message.widths[0]}%` }}
                  />
                </div>
              ) : (
                <div key={index} className="space-y-2.5">
                  {message.widths.map((width, lineIndex) => (
                    <Skeleton key={lineIndex} className="h-3.5" style={{ width: `${width}%` }} />
                  ))}
                </div>
              ),
            )}
          </div>
        </div>
        <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-4 pt-2 sm:pb-6">
          <Skeleton className="h-[52px] w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

/**
 * Fallback for the signed-out routes — a share link or a pack landing page.
 * These render their own header and a centred column instead of the app frame.
 */
export function PublicPageSkeleton({ width = "max-w-3xl" }: { width?: string }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border-subtle px-4">
        <Skeleton className="h-4 w-32" />
      </header>
      <main className={`mx-auto w-full flex-1 px-4 py-10 ${width}`}>
        <Skeleton className="h-6 w-64" />
        <Skeleton className="mt-3 h-3.5 w-full max-w-sm" />
        <div className="mt-8 space-y-3">
          {[100, 94, 88, 72, 96, 64].map((w, index) => (
            <Skeleton key={index} className="h-3.5" style={{ width: `${w}%` }} />
          ))}
        </div>
      </main>
    </div>
  );
}

/**
 * Full-page fallback for the non-chat routes, mirroring `PageShell`.
 * `sections` is how many card outlines to draw.
 */
export function PageSkeleton({ sections = 3 }: { sections?: number }) {
  return (
    <div className="flex h-dvh overflow-hidden">
      <SidebarSkeleton />
      <div className="flex h-dvh min-w-0 flex-1 flex-col">
        <HeaderSkeleton />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-4 py-8">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="mt-3 h-3.5 w-full max-w-md" />

            <div className="mt-8 space-y-8">
              {Array.from({ length: sections }, (_, index) => (
                <div key={index} className="rounded-xl border border-border-subtle bg-surface/40 p-5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="mt-2 h-3 w-64" />
                  <div className="mt-5 space-y-2.5">
                    <Skeleton className="h-3.5 w-full" />
                    <Skeleton className="h-3.5 w-[86%]" />
                    <Skeleton className="h-3.5 w-[64%]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
