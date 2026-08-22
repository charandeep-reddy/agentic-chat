export function maskKey(key: string): string {
  if (key.length <= 10) return "•".repeat(Math.min(key.length, 8));
  return `…${key.slice(-4)}`;
}

/**
 * A context window as its provider would describe it.
 *
 * Dividing by 1024 is the obvious thing and the wrong one: Gemini reports
 * 1048576 tokens, which came out as "1024k ctx" where the whole industry —
 * Google included — says 1M. Providers quote these in decimal, so we do too.
 */
export function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  return `${Math.round(tokens / 1000)}k`;
}
