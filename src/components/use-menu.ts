"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";

/** Focusable children of a container, in tab order. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusable(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

export interface MenuOptions {
  open: boolean;
  onClose: () => void;
  /**
   * True for a list of commands (arrow keys move between items, Enter and
   * Space activate). False for a popover that contains fields, where arrows
   * belong to the field the user is typing in.
   */
  roving?: boolean;
  /** Trap Tab inside. For a modal overlay, not a dropdown anchored in the page. */
  trap?: boolean;
  /**
   * The trigger. Clicks on it are not "outside": without this, mousedown would
   * close the surface and the click that follows would reopen it, so the button
   * would never appear to close anything.
   */
  trigger?: RefObject<HTMLElement | null>;
}

/**
 * Keyboard and focus behaviour for a dropdown, popover or modal overlay.
 *
 * These surfaces all closed on an outside click and nothing else: no Escape,
 * no way in or out with a keyboard, and focus left stranded on a trigger that
 * had just been unmounted. This centralises the parts every one of them needs:
 *
 * - Escape closes.
 * - Focus moves to the first thing inside when it opens, and back to whatever
 *   opened it when it closes — otherwise the tab order restarts at the top of
 *   the document.
 * - `roving` gives a menu its arrow keys, plus Home and End.
 * - `trap` keeps Tab inside a modal overlay, which is what `aria-modal` claims
 *   is already happening.
 *
 * Returns the ref to put on the surface itself.
 */
export function useMenu<T extends HTMLElement>({
  open,
  onClose,
  roving = false,
  trap = false,
  trigger,
}: MenuOptions): RefObject<T | null> {
  const ref = useRef<T>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const node = ref.current;
    opener.current = document.activeElement as HTMLElement | null;
    focusable(node)[0]?.focus();

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (trigger?.current?.contains(target)) return;
      onClose();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }

      const current = focusable(ref.current);
      if (current.length === 0) return;
      const index = current.indexOf(document.activeElement as HTMLElement);

      if (trap && e.key === "Tab") {
        // Wrap by hand: the browser would otherwise walk straight out of an
        // overlay that is only visually on top of the page.
        e.preventDefault();
        const next = e.shiftKey
          ? (index <= 0 ? current.length : index) - 1
          : (index + 1) % current.length;
        current[next]?.focus();
        return;
      }

      if (!roving) return;

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        const next = (index + step + current.length) % current.length;
        current[next]?.focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        current[0]?.focus();
      } else if (e.key === "End") {
        e.preventDefault();
        current[current.length - 1]?.focus();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    // Capture, so Escape closes this surface before a parent handler sees it.
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);

      // Take focus back in two cases, and only those: it is still inside the
      // surface, or the surface was unmounted out from under it and the
      // browser dropped focus onto <body> — the case that leaves a keyboard
      // user starting again from the top of the document. A click somewhere
      // else on the page has already put focus somewhere better than the
      // trigger, so leave it alone.
      const active = document.activeElement;
      const orphaned = !active || active === document.body;
      if (orphaned || node?.contains(active)) opener.current?.focus();
    };
  }, [open, onClose, roving, trap, trigger]);

  return ref;
}
