import { describe, expect, it } from "vitest";
import { askQuestion, askQuestionSchema } from "@/lib/tools/ask-question";

describe("ask_user_question", () => {
  it("builds a question payload with a generated id", () => {
    const payload = askQuestion({ question: "Which chart?", options: ["Bar", "Line"] });
    expect(payload.kind).toBe("question");
    expect(payload.id).toBeTruthy();
    expect(payload.options).toEqual(["Bar", "Line"]);
  });

  it("dedupes and trims options", () => {
    const payload = askQuestion({ question: "Pick", options: [" a ", "a", " b "] });
    expect(payload.options).toEqual(["a", "b"]);
  });

  it("rejects fewer than 2 distinct options", () => {
    expect(() => askQuestion({ question: "Pick", options: ["same", "same"] })).toThrow(/2 distinct/);
  });

  it("validates through the zod schema", () => {
    expect(askQuestionSchema.safeParse({ question: "q", options: ["a", "b"] }).success).toBe(true);
    expect(askQuestionSchema.safeParse({ question: "q", options: ["a"] }).success).toBe(false);
    expect(askQuestionSchema.safeParse({ question: "", options: ["a", "b"] }).success).toBe(false);
    expect(askQuestionSchema.safeParse({ question: "q", options: ["a", "b", "c", "d", "e", "f", "g", "h", "i"] }).success).toBe(false);
  });
});
