"use client";

import { useSyncExternalStore } from "react";
import { getStorage, removeStorage, setStorage, subscribeStorage } from "@/lib/local-storage";
import { parsePrices, PRICES_STORAGE } from "@/lib/usage";
import type { ModelPrice } from "@/lib/usage";

const EMPTY: Record<string, ModelPrice> = {};

/**
 * Last parse, keyed by the raw string it came from.
 *
 * `parsePrices` returns a fresh object every call, and this hook is used once
 * per assistant message as well as in the header — so on a streaming turn it
 * was running JSON.parse for every message on every token, and handing back a
 * new object identity each time, which broke the `useMemo` in
 * `ConversationCost` that depends on it. Caching on the raw string makes the
 * result referentially stable until the stored prices actually change.
 */
let cache: { raw: string; parsed: Record<string, ModelPrice> } | null = null;

function parseOnce(raw: string): Record<string, ModelPrice> {
  if (!raw) return EMPTY;
  if (cache?.raw !== raw) cache = { raw, parsed: parsePrices(raw) };
  return cache.parsed;
}

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
  return parseOnce(raw);
}

/** Writes one model's price. Passing null removes it. */
export function setPrice(model: string, price: ModelPrice | null): void {
  const current = parsePrices(getStorage(PRICES_STORAGE));
  if (price === null) delete current[model];
  else current[model] = price;
  if (Object.keys(current).length === 0) removeStorage(PRICES_STORAGE);
  else setStorage(PRICES_STORAGE, JSON.stringify(current));
}
