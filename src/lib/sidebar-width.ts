export const SIDEBAR_WIDTH_STORAGE = "agentic-chat.sidebar-width";
export const DEFAULT_SIDEBAR_WIDTH = 270;
export const MIN_SIDEBAR_WIDTH = 220;
export const MAX_SIDEBAR_WIDTH = 420;

/**
 * Clamps a proposed sidebar width between MIN_SIDEBAR_WIDTH and MAX_SIDEBAR_WIDTH.
 */
export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_SIDEBAR_WIDTH;
  return Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, Math.round(width)));
}

/**
 * Parses and sanitizes a stored sidebar width from localStorage.
 */
export function parseSidebarWidth(raw: string | null | undefined): number {
  if (!raw) return DEFAULT_SIDEBAR_WIDTH;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return DEFAULT_SIDEBAR_WIDTH;
  return clampSidebarWidth(parsed);
}
