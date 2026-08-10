import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { memoryBoundaries } from "@/lib/memory-boundaries";

function user(id: string): UIMessage {
  return { id, role: "user", parts: [{ type: "text", text: "q" }] };
}

function assistant(id: string, memoryOff?: boolean): UIMessage {
  return {
    id,
    role: "assistant",
    parts: [{ type: "text", text: "a" }],
    ...(memoryOff === undefined ? {} : { metadata: { memoryOff } }),
  };
}

describe("memoryBoundaries", () => {
  it("marks nothing when memory was on throughout", () => {
    const messages = [user("u1"), assistant("a1"), user("u2"), assistant("a2")];
    expect(memoryBoundaries(messages).size).toBe(0);
  });

  it("marks the question that starts an off run, not the answer", () => {
    const messages = [user("u1"), assistant("a1"), user("u2"), assistant("a2", true)];
    expect([...memoryBoundaries(messages)]).toEqual([[2, true]]);
  });

  it("marks both edges when memory goes off and back on", () => {
    const messages = [
      user("u1"),
      assistant("a1"),
      user("u2"),
      assistant("a2", true),
      user("u3"),
      assistant("a3"),
    ];
    expect([...memoryBoundaries(messages)]).toEqual([
      [2, true],
      [4, false],
    ]);
  });

  it("marks the very first turn when a chat starts with memory off", () => {
    const messages = [user("u1"), assistant("a1", true)];
    expect([...memoryBoundaries(messages)]).toEqual([[0, true]]);
  });

  it("does not mark a run that only continues", () => {
    const messages = [
      user("u1"),
      assistant("a1", true),
      user("u2"),
      assistant("a2", true),
    ];
    expect([...memoryBoundaries(messages)]).toEqual([[0, true]]);
  });

  // A tool answer arrives as a user message too, so a boundary can sit above
  // several of them in a row.
  it("walks back over every user message before the answer", () => {
    const messages = [user("u1"), user("u2"), assistant("a1", true)];
    expect([...memoryBoundaries(messages)]).toEqual([[0, true]]);
  });
});
