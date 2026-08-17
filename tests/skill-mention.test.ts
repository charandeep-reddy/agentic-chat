import { describe, expect, it } from "vitest";
import {
  applySkillMention,
  expandSkillMentions,
  filterSkillMentions,
  findSkillMentionToken,
  skillMentionDirective,
} from "@/lib/skill-mention";

describe("findSkillMentionToken", () => {
  it("finds a token at the start of the text", () => {
    expect(findSkillMentionToken("/rev", 4)).toEqual({ start: 0, end: 4, query: "rev" });
  });

  it("finds a token right after whitespace", () => {
    expect(findSkillMentionToken("please /rev", 11)).toEqual({ start: 7, end: 11, query: "rev" });
  });

  it("ignores a slash with no preceding whitespace, e.g. a path or URL", () => {
    expect(findSkillMentionToken("a/b", 3)).toBeNull();
    expect(findSkillMentionToken("https://example.com", 8)).toBeNull();
  });

  it("closes once whitespace is typed after the slash", () => {
    expect(findSkillMentionToken("/rev ", 5)).toBeNull();
  });

  it("returns an empty query for a bare slash", () => {
    expect(findSkillMentionToken("/", 1)).toEqual({ start: 0, end: 1, query: "" });
  });

  it("returns null when there's no slash before the cursor", () => {
    expect(findSkillMentionToken("hello", 5)).toBeNull();
  });

  it("uses the nearest slash before the cursor, not the first one", () => {
    expect(findSkillMentionToken("/foo done /rev", 14)).toEqual({ start: 10, end: 14, query: "rev" });
  });
});

describe("filterSkillMentions", () => {
  const skills = [{ name: "weekly-report" }, { name: "code-review" }, { name: "review-checklist" }];

  it("returns everything for an empty query", () => {
    expect(filterSkillMentions(skills, "")).toEqual(skills);
  });

  it("matches a substring anywhere in the name, case-insensitively", () => {
    expect(filterSkillMentions(skills, "REV").map((s) => s.name)).toEqual([
      "review-checklist",
      "code-review",
    ]);
  });

  it("ranks an earlier match position first", () => {
    expect(filterSkillMentions(skills, "review").map((s) => s.name)).toEqual([
      "review-checklist",
      "code-review",
    ]);
  });

  it("excludes non-matches", () => {
    expect(filterSkillMentions(skills, "zzz")).toEqual([]);
  });
});

describe("skillMentionDirective", () => {
  it("builds a directive naming the skill", () => {
    expect(skillMentionDirective("weekly-report")).toBe("Use the weekly-report skill.");
  });
});

describe("applySkillMention", () => {
  it("closes the token into a compact tag, not an expanded sentence", () => {
    const value = "please /rev this";
    const token = findSkillMentionToken(value, 11)!;
    const result = applySkillMention(value, token, "code-review");
    expect(result.value).toBe("please /code-review  this");
    expect(result.value.slice(0, result.cursor)).toBe("please /code-review ");
  });
});

describe("expandSkillMentions", () => {
  const names = ["code-review", "weekly-report"];

  it("expands a known tag at the start of the text", () => {
    expect(expandSkillMentions("/code-review check this", names)).toBe(
      "Use the code-review skill. check this",
    );
  });

  it("expands a known tag mid-sentence and at the end", () => {
    expect(expandSkillMentions("please /code-review", names)).toBe("please Use the code-review skill.");
  });

  it("expands multiple tags in one message", () => {
    expect(expandSkillMentions("/code-review then /weekly-report", names)).toBe(
      "Use the code-review skill. then Use the weekly-report skill.",
    );
  });

  it("leaves an unrecognised name untouched — abandoned or since-deleted skill", () => {
    expect(expandSkillMentions("/not-a-real-skill hello", names)).toBe("/not-a-real-skill hello");
  });

  it("leaves a slash with no preceding whitespace untouched — path, URL, and/or", () => {
    expect(expandSkillMentions("a/code-review b", names)).toBe("a/code-review b");
    expect(expandSkillMentions("read and/weekly-report later", names)).toBe("read and/weekly-report later");
  });
});
