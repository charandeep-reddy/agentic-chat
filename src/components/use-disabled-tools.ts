"use client";

import { useCallback, useSyncExternalStore } from "react";
import { getStorage, removeStorage, setStorage, subscribeStorage } from "@/lib/local-storage";
import { disabledToolsKey, parseDisabledTools, type ToggleableTool } from "@/lib/tool-visibility";

/**
 * Per-chat, not per-account: unlike the model/provider/key (all global via
 * `useProviderSettings`), which tools are worth having in one particular
 * conversation is a property of that conversation — a data-analysis chat and
 * a "help me write HTML" chat want different defaults. Keyed by chatId in
 * localStorage, same shape as the composer's own draft key.
 */
export function useDisabledTools(chatId: string): [ToggleableTool[], (next: ToggleableTool[]) => void] {
  const key = disabledToolsKey(chatId);
  const raw = useSyncExternalStore(
    (cb) => subscribeStorage(key, cb),
    () => getStorage(key),
    () => "",
  );
  const setDisabled = useCallback(
    (next: ToggleableTool[]) => {
      if (next.length === 0) removeStorage(key);
      else setStorage(key, JSON.stringify(next));
    },
    [key],
  );
  return [parseDisabledTools(raw), setDisabled];
}
