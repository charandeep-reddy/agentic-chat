import { describe, expect, it } from "vitest";
import { activeSkillMentionDescendant, skillMentionOptionId } from "@/lib/skill-mention";

describe("skillMentionOptionId", () => {
  it("builds a stable id from the skill name", () => {
    expect(skillMentionOptionId("summarize")).toBe("skill-mention-summarize");
  });

  it("is deterministic for repeated calls", () => {
    expect(skillMentionOptionId("translate")).toBe(skillMentionOptionId("translate"));
  });
});

describe("activeSkillMentionDescendant", () => {
  const matches = [{ name: "alpha" }, { name: "beta" }, { name: "gamma" }];

  it("points at the highlighted option while the menu is open", () => {
    expect(activeSkillMentionDescendant(true, matches, 0)).toBe("skill-mention-alpha");
    expect(activeSkillMentionDescendant(true, matches, 2)).toBe("skill-mention-gamma");
  });

  it("is undefined when the menu is closed", () => {
    expect(activeSkillMentionDescendant(false, matches, 0)).toBeUndefined();
  });

  it("is undefined for an out-of-range highlight", () => {
    expect(activeSkillMentionDescendant(true, matches, -1)).toBeUndefined();
    expect(activeSkillMentionDescendant(true, matches, matches.length)).toBeUndefined();
  });

  it("is undefined when no skills match", () => {
    expect(activeSkillMentionDescendant(true, [], 0)).toBeUndefined();
  });
});