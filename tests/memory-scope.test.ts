import { describe, expect, it } from "vitest";
import { selectPromptMemories } from "@/lib/memory-store";
import { isMemoryScope } from "@/lib/memory-scope";
import type { Memory } from "@/lib/db/schema";

function memory(id: string, content: string, useCount = 0): Memory {
  return {
    id,
    userId: "u1",
    content,
    category: "fact",
    source: "agent",
    importedFromPackId: null,
    enabled: true,
    useCount,
    lastUsedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const WORK = memory("m1", "Deploys the billing service to Vercel.");
const PERSONAL = memory("m2", "Has a dog named Biscuit.");
const STACK = memory("m3", "Prefers Postgres over MySQL.");
const ALL = [WORK, PERSONAL, STACK];

describe("selectPromptMemories", () => {
  it("passes everything through by default", () => {
    expect(selectPromptMemories(ALL, "anything")).toEqual(ALL);
  });

  it("injects nothing when the chat is scoped to none", () => {
    expect(selectPromptMemories(ALL, "billing", { scope: "none", ids: [] })).toEqual([]);
  });

  it("keeps work and personal apart when the chat names its own shortlist", () => {
    const picked = selectPromptMemories(ALL, "what did I deploy", {
      scope: "selected",
      ids: ["m1", "m3"],
    });

    expect(picked.map((m) => m.id)).toEqual(["m1", "m3"]);
  });

  it("ignores ids that no longer exist rather than failing the turn", () => {
    const picked = selectPromptMemories(ALL, "x", { scope: "selected", ids: ["m1", "deleted"] });
    expect(picked.map((m) => m.id)).toEqual(["m1"]);
  });

  it("uses an explicit selection whole, past the relevance budget", () => {
    // 60 memories is over the budget that normally triggers ranking. A
    // shortlist is the user's own decision and must not be second-guessed.
    const many = Array.from({ length: 60 }, (_, i) => memory(`m${i}`, `Fact number ${i}.`));
    const wanted = ["m0", "m41", "m59"];

    const picked = selectPromptMemories(many, "nothing matches this text", {
      scope: "selected",
      ids: wanted,
    });

    expect(picked.map((m) => m.id).sort()).toEqual([...wanted].sort());
  });

  it("still ranks by relevance when the library is large and the scope is all", () => {
    const many = Array.from({ length: 60 }, (_, i) => memory(`m${i}`, `Fact number ${i}.`));
    many.push(memory("target", "Runs a Postgres replica in Frankfurt."));

    const picked = selectPromptMemories(many, "postgres replica");

    expect(picked.length).toBeLessThanOrEqual(40);
    expect(picked.map((m) => m.id)).toContain("target");
  });
});

describe("isMemoryScope", () => {
  it("accepts the three scopes and nothing else", () => {
    expect(isMemoryScope("all")).toBe(true);
    expect(isMemoryScope("none")).toBe(true);
    expect(isMemoryScope("selected")).toBe(true);
    expect(isMemoryScope("everything")).toBe(false);
    expect(isMemoryScope(null)).toBe(false);
  });
});
