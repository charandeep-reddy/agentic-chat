"use client";

import { useSyncExternalStore } from "react";
import { getStorage, setStorage, subscribeStorage } from "@/lib/local-storage";
import {
  DEFAULT_SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_STORAGE,
  parseSidebarWidth,
} from "@/lib/sidebar-width";

export function useStoredSidebarWidth(): number {
  const raw = useSyncExternalStore(
    (cb) => subscribeStorage(SIDEBAR_WIDTH_STORAGE, cb),
    () => getStorage(SIDEBAR_WIDTH_STORAGE),
    () => "",
  );
  return raw ? parseSidebarWidth(raw) : DEFAULT_SIDEBAR_WIDTH;
}

export function setStoredSidebarWidth(width: number): void {
  setStorage(SIDEBAR_WIDTH_STORAGE, String(width));
}
