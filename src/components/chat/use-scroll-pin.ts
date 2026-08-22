"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Keeps the viewport pinned to the newest content unless the user scrolled up
 * to read something older.
 */
export function useScrollPin(
  scrollRef: RefObject<HTMLDivElement | null>,
  messages: unknown[],
  busy: boolean,
) {
  const [pinned, setPinned] = useState(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Rate-limited to one read per animation frame. `scroll` can fire far
    // faster than that, and each read forces a synchronous layout — doing
    // that unthrottled while the transcript is also mutating from incoming
    // tokens is its own source of jank, on top of the one below.
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
        setPinned(distance < 120);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [scrollRef]);

  useEffect(() => {
    if (!pinned) return;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      // Instant while streaming, not smooth: `messages` gets a new reference
      // on every token, so this effect reruns every token too. A *smooth*
      // scroll queues an animation that owns the scroll position while it
      // runs — restarting one every token means an almost continuous
      // animation fighting any manual scroll attempt for the whole reply,
      // which is what reads as "scrolling up lags while it's generating".
      // Outside a stream there's one jump, not a chain, so smooth is fine.
      behavior: busy || messages.length <= 1 ? "auto" : "smooth",
    });
  }, [scrollRef, messages, busy, pinned]);

  return [pinned, setPinned] as const;
}
