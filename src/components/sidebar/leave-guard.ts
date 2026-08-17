/**
 * A veto on leaving the current page, for a chat whose contents exist nowhere
 * else.
 *
 * `beforeunload` covers reload and tab close, but an App Router navigation is
 * neither — clicking a chat in the sidebar would swap the page out and take an
 * unsaved private transcript with it, silently. This is the in-app half.
 *
 * A module singleton rather than a context: the callers that need to ask are
 * the sidebar, the command palette and the chat's own shortcuts, and threading
 * a provider through all three to serve one screen is more plumbing than the
 * problem is worth. Only one chat is mounted at a time, so only one guard can
 * ever be installed.
 */

type Guard = () => Promise<boolean>;

let guard: Guard | null = null;

/** Installed by a chat with something to lose; pass null to remove it. */
export function setLeaveGuard(next: Guard | null): void {
  guard = next;
}

/**
 * Resolves true when it is safe to navigate. With no guard installed — every
 * ordinary chat, since those are on disk — it resolves true immediately, so
 * callers can await it unconditionally.
 */
export function requestLeave(): Promise<boolean> {
  return guard ? guard() : Promise.resolve(true);
}
