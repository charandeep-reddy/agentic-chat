"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { getStorage, removeStorage, setStorage, subscribeStorage } from "@/lib/local-storage";
import { PROVIDER_STORAGE } from "@/lib/storage-keys";
import {
  DEFAULT_PROVIDER,
  PROVIDERS,
  allKeyStorageNames,
  keyStorageFor,
  modelStorageFor,
  providersWithStoredKey,
  toProviderId,
  type ProviderId,
} from "@/lib/providers";

export interface ProviderSettings {
  provider: ProviderId;
  /** The selected provider's key. Empty string when it has none yet. */
  apiKey: string;
  /** The selected provider's model, falling back to that provider's default. */
  model: string;
  setProvider: (provider: ProviderId) => void;
  setApiKey: (key: string) => void;
  setModel: (model: string) => void;
  /** Every provider currently holding a key, including ones not selected. */
  providersWithKey: ProviderId[];
  /** Forgets the selected provider's key. */
  clearKey: () => void;
  /** Forgets every provider's key in one go. */
  clearAllKeys: () => void;
}

/**
 * Which providers hold a key, as a comma-joined string.
 *
 * A string rather than an array because `useSyncExternalStore` compares
 * snapshots by identity: returning a fresh array each call would re-render
 * forever. The caller splits it back apart behind a `useMemo`.
 */
function keyedProvidersSnapshot(): string {
  return providersWithStoredKey(getStorage).join(",");
}

function subscribeAllKeys(cb: () => void): () => void {
  const unsubscribes = allKeyStorageNames().map((name) => subscribeStorage(name, cb));
  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}

function useStored(key: string): string {
  return useSyncExternalStore(
    useCallback((cb) => subscribeStorage(key, cb), [key]),
    useCallback(() => getStorage(key), [key]),
    // The server cannot know any of this, so it renders the empty state and
    // the pre-paint script in the root layout covers the flash.
    () => "",
  );
}

/**
 * The active provider and its key and model.
 *
 * Keys are stored per provider and all of them are kept, so switching between
 * Claude and Gemini is one click rather than one click and a re-paste. Only the
 * selected provider's key is ever read here, which is also the only one that
 * gets sent anywhere.
 */
export function useProviderSettings(): ProviderSettings {
  const provider = toProviderId(useStored(PROVIDER_STORAGE) || DEFAULT_PROVIDER);
  const apiKey = useStored(keyStorageFor(provider));
  const storedModel = useStored(modelStorageFor(provider));

  const setProvider = useCallback((next: ProviderId) => {
    if (next === DEFAULT_PROVIDER) removeStorage(PROVIDER_STORAGE);
    else setStorage(PROVIDER_STORAGE, next);
  }, []);

  const setApiKey = useCallback(
    (key: string) => {
      const name = keyStorageFor(provider);
      if (key) setStorage(name, key);
      else removeStorage(name);
    },
    [provider],
  );

  const setModel = useCallback(
    (model: string) => setStorage(modelStorageFor(provider), model),
    [provider],
  );

  const clearKey = useCallback(() => removeStorage(keyStorageFor(provider)), [provider]);

  const clearAllKeys = useCallback(() => {
    for (const name of allKeyStorageNames()) removeStorage(name);
  }, []);

  const keyed = useSyncExternalStore(subscribeAllKeys, keyedProvidersSnapshot, () => "");
  const providersWithKey = useMemo(
    () => (keyed === "" ? [] : (keyed.split(",") as ProviderId[])),
    [keyed],
  );

  return {
    provider,
    apiKey,
    model: storedModel || PROVIDERS[provider].defaultModel,
    setProvider,
    setApiKey,
    setModel,
    providersWithKey,
    clearKey,
    clearAllKeys,
  };
}
