"use client";

import { useSyncExternalStore } from "react";
import { getStorage, removeStorage, setStorage, subscribeStorage } from "@/lib/local-storage";
import { parsePrices, PRICES_STORAGE } from "@/lib/usage";
import type { ModelPrice } from "@/lib/usage";

const EMPTY: Record<string, ModelPrice> = {};

/**
 * Per-model prices, kept in localStorage next to the API key.
 *
 * They live in the browser for the same reason the key does: the provider is
 * whatever OpenAI-compatible endpoint the user pointed at, there is no price
 * list to look them up in, and the server has no business knowing what someone
 * pays for tokens.
 */
export function usePrices(): Record<string, ModelPrice> {
  const raw = useSyncExternalStore(
    (cb) => subscribeStorage(PRICES_STORAGE, cb),
    () => getStorage(PRICES_STORAGE),
    () => "",
  );
  return raw ? parsePrices(raw) : EMPTY;
}

/** Writes one model's price. Passing null removes it. */
export function setPrice(model: string, price: ModelPrice | null): void {
  const current = parsePrices(getStorage(PRICES_STORAGE));
  if (price === null) delete current[model];
  else current[model] = price;
  if (Object.keys(current).length === 0) removeStorage(PRICES_STORAGE);
  else setStorage(PRICES_STORAGE, JSON.stringify(current));
}
