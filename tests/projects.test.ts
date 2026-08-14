import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/prompts";
import { describeProjectDeletion, MAX_PROJECT_NAME, normalizeField } from "@/lib/projects";

describe("describeProjectDeletion", () => {
  it("does not describe consequences that do not exist", () => {
    // The generic sentence read "Its 0 chats will be kept… Its 0 project
    // memories will be permanently deleted", which makes deleting an empty
    // project sound destructive.
    const copy = describeProjectDeletion(0, 0);
    expect(copy).toBe("This project is empty. Deleting it cannot be undone.");
    expect(copy).not.toContain("0");
  });

  it("mentions only the half that is non-empty", () => {
    expect(describeProjectDeletion(3, 0)).toBe(
      "Its 3 chats will be kept and become ungrouped. This cannot be undone.",
    );
    expect(describeProjectDeletion(0, 2)).toBe(
      "Its 2 project memories will be permanently deleted. This cannot be undone.",
    );
  });

  it("joins both clauses when both apply", () => {
    expect(describeProjectDeletion(3, 2)).toBe(
      "Its 3 chats will be kept and become ungrouped, and its 2 project memories will be permanently deleted. This cannot be undone.",
    );
  });

  it("agrees in number at one", () => {
    const copy = describeProjectDeletion(1, 1);
    expect(copy).toContain("1 chat will be kept and becomes ungrouped");
    expect(copy).toContain("1 project memory will be permanently deleted");
    expect(copy).not.toContain("chats");
    expect(copy).not.toContain("memories");
  });
});

describe("normalizeField", () => {
  it("trims and returns null for an empty field", () => {
    expect(normalizeField("  hello  ", 80)).toBe("hello");
    expect(normalizeField("   ", 80)).toBeNull();
    expect(normalizeField("", 80)).toBeNull();
  });

  it("returns null for anything that is not a string", () => {
    // The endpoints hand this straight off a parsed JSON body, so a number or
    // an object reaching it is a client bug rather than an impossibility.
    expect(normalizeField(42, 80)).toBeNull();
    expect(normalizeField(null, 80)).toBeNull();
    expect(normalizeField(undefined, 80)).toBeNull();
    expect(normalizeField({ name: "x" }, 80)).toBeNull();
  });

  it("caps at the limit rather than rejecting", () => {
    const long = "a".repeat(MAX_PROJECT_NAME + 50);
    expect(normalizeField(long, MAX_PROJECT_NAME)).toHaveLength(MAX_PROJECT_NAME);
  });

  it("trims before capping, so leading space does not eat the limit", () => {
    expect(normalizeField("   abc", 3)).toBe("abc");
  });
});

describe("project instructions in the system prompt", () => {
  it("says nothing about a project when there is none", () => {
    const prompt = buildSystemPrompt({ userName: "Sam" });
    expect(prompt).not.toContain("## This project");
  });

  it("includes the project's name and instructions", () => {
    const prompt = buildSystemPrompt({
      project: { name: "Q3 migration", instructions: "Answer against the Postgres schema." },
    });
    expect(prompt).toContain("## This project: Q3 migration");
    expect(prompt).toContain("Answer against the Postgres schema.");
  });

  it("states that project instructions beat the account-wide ones", () => {
    // Ordering alone is a convention the model may or may not apply, and a
    // project whose instructions lose to the global style is not a project.
    const prompt = buildSystemPrompt({
      responseStyle: "Always answer in bullet points.",
      project: { name: "Legal review", instructions: "Write in full prose." },
    });
    expect(prompt).toContain("follow these");
    expect(prompt.indexOf("Always answer in bullet points.")).toBeLessThan(
      prompt.indexOf("Write in full prose."),
    );
  });

  it("still names the project when it has no instructions", () => {
    const prompt = buildSystemPrompt({ project: { name: "Reading list", instructions: null } });
    expect(prompt).toContain("## This project: Reading list");
    // No dangling promise of instructions that are not there.
    expect(prompt).not.toContain("Where they conflict");
  });

  it("keeps the project section out of a prompt with memory tools off", () => {
    // A private chat builds its prompt with no context at all — this asserts
    // the project cannot arrive by some other route.
    const prompt = buildSystemPrompt({ memoryTools: false });
    expect(prompt).not.toContain("## This project");
    expect(prompt).not.toContain("## About the user");
  });
});
