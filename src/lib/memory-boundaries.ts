import type { UIMessage } from "ai";

/**
 * Where memory was switched on or off inside a transcript.
 *
 * Returns a map of message index to the state that starts there, so the list
 * can draw a marker at each change. Every chat starts with memory on, so a
 * transcript that never turns it off produces nothing.
 *
 * The state is read from assistant metadata — what the turn actually ran with,
 * not what the toggle says now. The marker is placed above the question rather
 * than between a question and its answer: the setting applied to the whole
 * exchange, and a rule splitting a pair reads as if something is missing.
 */
/** What the last completed turn ran with. Chats start with memory on. */
export function lastTurnMemoryOff(messages: UIMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== "assistant") continue;
    return Boolean((messages[i].metadata as { memoryOff?: boolean } | undefined)?.memoryOff);
  }
  return false;
}

export function memoryBoundaries(messages: UIMessage[]): Map<number, boolean> {
  const marks = new Map<number, boolean>();
  let previous = false;

  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role !== "assistant") continue;
    const off = Boolean((messages[i].metadata as { memoryOff?: boolean } | undefined)?.memoryOff);
    if (off === previous) continue;
    previous = off;

    let at = i;
    while (at > 0 && messages[at - 1].role === "user") at--;
    marks.set(at, off);
  }

  return marks;
}
