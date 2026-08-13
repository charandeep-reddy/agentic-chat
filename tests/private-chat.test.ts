import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/prompts";
import { baseTools, buildTools } from "@/lib/tools";
import type { MemoryStore } from "@/lib/tools/memory";
import type { SkillStore } from "@/lib/tools/skills";

/**
 * A private chat's guarantee is not that the model is asked to behave — it is
 * that the capability is absent and the context was never assembled. These
 * assert both halves of what `api/chat/route.ts` builds when `private` is set.
 */

const PRIVATE_PROMPT = buildSystemPrompt({ memoryTools: false });

describe("private chat prompt", () => {
  it("names none of the memory tools", () => {
    for (const name of ["save_memory", "search_memory", "forget_memory"]) {
      expect(PRIVATE_PROMPT).not.toContain(name);
    }
  });

  it("drops the memory instructions along with the tools", () => {
    expect(PRIVATE_PROMPT).not.toContain("## Memory");
  });

  it("carries no section built from the user's own data", () => {
    for (const heading of [
      "## The user",
      "## About the user",
      "## How the user wants you to respond",
      "## What you remember about the user",
      "## Skills",
    ]) {
      expect(PRIVATE_PROMPT).not.toContain(heading);
    }
  });

  it("keeps the rules a chat is useless without", () => {
    expect(PRIVATE_PROMPT).toContain("## Rules");
  });

  it("still instructs on memory when it is allowed", () => {
    // Checked by section, not by tool name. The prompt deliberately names no
    // tools — each one describes itself — so what distinguishes a private
    // chat here is the absence of the memory instructions, and the absence of
    // the tools themselves from the registry (asserted below).
    const normal = buildSystemPrompt({ memoryTools: true });
    expect(normal).toContain("## Memory");
    expect(PRIVATE_PROMPT).not.toContain("## Memory");
  });

  it("names no tools at all, so a dropped tool can never dangle", () => {
    // The reason the memory branch exists in the first place: a prompt that
    // lists tools has to be kept in step with whichever ones this request was
    // actually given. Naming none removes that whole class of mismatch.
    const normal = buildSystemPrompt({ memoryTools: true });
    for (const name of Object.keys(buildTools({ memory: null, skills: null }))) {
      expect(normal).not.toContain(name);
    }
  });

  it("does not itself strip personal context — the caller must omit it", () => {
    // Documenting the boundary rather than asserting a guarantee that is not
    // there: `memoryTools` governs the memory tools alone. Withholding the
    // name, settings and skills is the route's job, and this is what breaks if
    // someone later assumes the flag covers them.
    const leaky = buildSystemPrompt({ memoryTools: false, userName: "Ada" });
    expect(leaky).toContain("Ada");
  });
});

describe("private chat tool registry", () => {
  it("hands the model exactly the tools that touch nothing stored", () => {
    const registry = buildTools({ memory: null, skills: null });
    expect(Object.keys(registry).sort()).toEqual(Object.keys(baseTools).sort());
  });

  it("has no memory or skill tool to call", () => {
    const registry = buildTools({ memory: null, skills: null });
    for (const name of [
      "save_memory",
      "search_memory",
      "forget_memory",
      "load_skill",
      "read_skill_resource",
    ]) {
      expect(registry).not.toHaveProperty(name);
    }
  });

  it("registers them again when a chat is not private", () => {
    const registry = buildTools({
      memory: {} as MemoryStore,
      skills: {} as SkillStore,
    });
    expect(registry).toHaveProperty("save_memory");
    expect(registry).toHaveProperty("load_skill");
  });
});
