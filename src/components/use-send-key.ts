"use client";

import { useSyncExternalStore } from "react";
import { getStorage, setStorage, subscribeStorage } from "@/lib/local-storage";
import { isSendKeyPreference, SEND_KEY_STORAGE, type SendKeyPreference } from "@/lib/send-key";

/**
 * A keyboard preference, not a chat fact — same reasoning as prices/theme:
 * lives in this browser only, applies to every chat, and has no reason to
 * touch the server.
 */
export function useSendKeyPreference(): SendKeyPreference {
  const raw = useSyncExternalStore(
    (cb) => subscribeStorage(SEND_KEY_STORAGE, cb),
    () => getStorage(SEND_KEY_STORAGE),
    () => "",
  );
  return isSendKeyPreference(raw) ? raw : "enter";
}

export function setSendKeyPreference(next: SendKeyPreference): void {
  setStorage(SEND_KEY_STORAGE, next);
}
