"use client";

import { useSyncExternalStore } from "react";

/**
 * A counter bumped every time the user asks for a new chat.
 *
 * The new-chat routes (`/` and `/private`) render a *different* conversation
 * on every visit, but that difference lives in a client-minted id rather than
 * in the URL — so React sees the same component in the same position and keeps
 * it mounted, id and all.
 *
 * That is fine until the first message, at which point the chat claims its URL
 * with `history.replaceState`. The address bar then reads `/c/abc` while the
 * router is still rendering the `/` route. Clicking "New chat" navigates back
 * to `/`, which is the page already on screen: nothing remounts, no new id is
 * minted, and the same conversation stays put. Only a reload appeared to work,
 * because a reload is a fresh mount.
 *
 * Bumping this gives the subtree a new `key`, which is the honest way to say
 * "this is a different conversation now" to React.
 */
let nonce = 0;
const listeners = new Set<() => void>();

/** Call alongside any navigation whose intent is "give me a blank chat". */
export function startNewChat(): void {
  nonce += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): number {
  return nonce;
}

export function useNewChatNonce(): number {
  // The server snapshot is the initial client value, so the first render agrees
  // on both sides and nothing re-keys during hydration.
  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}
