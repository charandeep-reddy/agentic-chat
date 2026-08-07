import { describe, expect, it } from "vitest";
import {
  formatSkillIndex,
  loadSkill,
  parseSkillMarkdown,
  readSkillResource,
  slugifySkillName,
  validateSkill,
} from "@/lib/tools/skills";
import type { SkillDetail, SkillStore } from "@/lib/tools/skills";
import { buildSystemPrompt } from "@/lib/prompts";
import { ToolError } from "@/lib/tools/errors";

function storeOf(skills: SkillDetail[], resources: Record<string, Record<string, string>> = {}): SkillStore {
  return {
    async list() {
      return skills.map((s) => ({ name: s.name, description: s.description }));
    },
    async load(name) {
      return skills.find((s) => s.name === name) ?? null;
    },
    async readResource(name, path) {
      return resources[name]?.[path] ?? null;
    },
  };
}

const WEEKLY: SkillDetail = {
  name: "weekly-report",
  description: "Build the weekly ops report. Use when asked for the weekly or Monday numbers.",
  body: "1. Fetch the CSV.\n2. Chart revenue as a line.",
  resources: ["template.md"],
};

describe("load_skill", () => {
  it("returns the body only when asked, which is the point of the design", async () => {
    const out = await loadSkill({ name: "weekly-report" }, storeOf([WEEKLY]));

    expect(out.kind).toBe("skill_loaded");
    expect(out.body).toContain("Chart revenue");
    // Paths, not contents: a long reference file stays unpaid-for until the
    // model decides it needs it.
    expect(out.resources).toEqual(["template.md"]);
  });

  it("names the real skills when the model invents one", async () => {
    const store = storeOf([WEEKLY]);

    await expect(loadSkill({ name: "weekly-reports" }, store)).rejects.toThrow(ToolError);
    await expect(loadSkill({ name: "weekly-reports" }, store)).rejects.toThrow(/weekly-report/);
  });

  it("says so plainly when the library is empty", async () => {
    await expect(loadSkill({ name: "anything" }, storeOf([]))).rejects.toThrow(/no skills/i);
  });

  it("caps a body that would swamp the context", async () => {
    const huge = { ...WEEKLY, body: "x".repeat(30_000) };
    const out = await loadSkill({ name: "weekly-report" }, storeOf([huge]));

    expect(out.body.length).toBeLessThan(21_000);
    expect(out.body).toContain("[truncated at 20000 characters]");
  });
});

describe("read_skill_resource", () => {
  it("returns one file's contents", async () => {
    const store = storeOf([WEEKLY], { "weekly-report": { "template.md": "# Heading" } });
    const out = await readSkillResource({ name: "weekly-report", path: "template.md" }, store);

    expect(out.content).toBe("# Heading");
  });

  it("lists what the skill does have when the path is wrong", async () => {
    const store = storeOf([WEEKLY], { "weekly-report": { "template.md": "x" } });

    await expect(
      readSkillResource({ name: "weekly-report", path: "nope.md" }, store),
    ).rejects.toThrow(/template\.md/);
  });

  it("points back at load_skill when the skill itself is unknown", async () => {
    await expect(readSkillResource({ name: "ghost", path: "a.md" }, storeOf([]))).rejects.toThrow(
      /load_skill/,
    );
  });
});

describe("parseSkillMarkdown", () => {
  it("reads a SKILL.md the way Claude writes one", () => {
    const parsed = parseSkillMarkdown(
      ['---', 'name: weekly-report', 'description: Build the weekly.', '---', '', 'Step one.'].join("\n"),
    );

    expect(parsed.name).toBe("weekly-report");
    expect(parsed.description).toBe("Build the weekly.");
    expect(parsed.body).toBe("Step one.");
  });

  it("strips quotes around a frontmatter value", () => {
    const parsed = parseSkillMarkdown(`---\nname: "weekly"\n---\nBody.`);
    expect(parsed.name).toBe("weekly");
  });

  it("treats a plain document as all body", () => {
    const parsed = parseSkillMarkdown("Just instructions.");

    expect(parsed.name).toBeNull();
    expect(parsed.body).toBe("Just instructions.");
  });

  it("does not mistake a horizontal rule for frontmatter", () => {
    const parsed = parseSkillMarkdown("Do the thing.\n\n---\n\nThen the other thing.");

    expect(parsed.name).toBeNull();
    expect(parsed.body).toContain("Then the other thing.");
  });
});

describe("validateSkill", () => {
  const valid = { name: "weekly-report", description: WEEKLY.description, body: "Do it." };

  it("accepts a well-formed skill", () => {
    expect(validateSkill(valid)).toBeNull();
  });

  it("rejects a name the model could not type back reliably", () => {
    expect(validateSkill({ ...valid, name: "Weekly Report" })).toMatch(/lowercase/);
  });

  it("rejects a description too thin to trigger on", () => {
    expect(validateSkill({ ...valid, description: "reports" })).toMatch(/at least/);
  });

  it("rejects an empty body", () => {
    expect(validateSkill({ ...valid, body: "   " })).toMatch(/empty/);
  });
});

describe("slugifySkillName", () => {
  it("turns a display name into a handle", () => {
    expect(slugifySkillName("Weekly Report!")).toBe("weekly-report");
    expect(slugifySkillName("  PDF   export  ")).toBe("pdf-export");
  });
});

describe("the prompt index", () => {
  it("carries names and descriptions, never bodies", () => {
    const prompt = buildSystemPrompt({ skills: [{ name: WEEKLY.name, description: WEEKLY.description }] });

    expect(prompt).toContain("## Skills");
    expect(prompt).toContain("**weekly-report**");
    expect(prompt).toContain("Monday numbers");
    expect(prompt).not.toContain("Chart revenue");
  });

  it("omits the section entirely when the user has no skills", () => {
    expect(buildSystemPrompt({})).not.toContain("## Skills");
    expect(buildSystemPrompt({ skills: [] })).not.toContain("## Skills");
  });

  it("formats one line per skill", () => {
    const index = formatSkillIndex([
      { name: "a", description: "First." },
      { name: "b", description: "Second." },
    ]);
    expect(index.split("\n")).toHaveLength(2);
  });
});
