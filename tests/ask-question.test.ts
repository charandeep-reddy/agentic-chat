import { describe, expect, it } from "vitest";
import {
  askQuestion,
  askQuestionSchema,
  formatQuestionAnswer,
  questionsOf,
} from "@/lib/tools/ask-question";

describe("ask_user_question", () => {
  it("builds a payload with a generated id", () => {
    const payload = askQuestion({ questions: [{ question: "Which chart?", options: ["Bar", "Line"] }] });
    expect(payload.kind).toBe("question");
    expect(payload.id).toBeTruthy();
    expect(payload.questions).toEqual([
      { question: "Which chart?", options: ["Bar", "Line"], multiSelect: false },
    ]);
  });

  it("carries several questions in one call", () => {
    const payload = askQuestion({
      questions: [
        { question: "Which provider?", options: ["Anthropic", "OpenAI"] },
        { question: "Which features?", options: ["Streaming", "Tools"], multiSelect: true },
      ],
    });
    expect(payload.questions).toHaveLength(2);
    expect(payload.questions[1].multiSelect).toBe(true);
  });

  it("defaults multiSelect to false rather than undefined", () => {
    // The card branches on it directly, so it has to be a boolean on the way out.
    const payload = askQuestion({ questions: [{ question: "q", options: ["a", "b"] }] });
    expect(payload.questions[0].multiSelect).toBe(false);
  });

  it("dedupes and trims options per question", () => {
    const payload = askQuestion({ questions: [{ question: "Pick", options: [" a ", "a", " b "] }] });
    expect(payload.questions[0].options).toEqual(["a", "b"]);
  });

  it("rejects fewer than 2 distinct options, naming the question", () => {
    expect(() =>
      askQuestion({
        questions: [
          { question: "Fine", options: ["a", "b"] },
          { question: "Broken", options: ["same", "same"] },
        ],
      }),
    ).toThrow(/Broken/);
  });

  it("rejects two questions worded the same", () => {
    // Answers are reported back keyed by question text; identical text makes
    // the reply impossible to attribute.
    expect(() =>
      askQuestion({
        questions: [
          { question: "Which?", options: ["a", "b"] },
          { question: " Which? ", options: ["c", "d"] },
        ],
      }),
    ).toThrow(/distinct/);
  });

  it("validates through the zod schema", () => {
    const ok = (questions: unknown) => askQuestionSchema.safeParse({ questions }).success;
    expect(ok([{ question: "q", options: ["a", "b"] }])).toBe(true);
    expect(ok([{ question: "q", options: ["a", "b"], multiSelect: true }])).toBe(true);
    expect(ok([{ question: "q", options: ["a"] }])).toBe(false);
    expect(ok([{ question: "", options: ["a", "b"] }])).toBe(false);
    expect(ok([])).toBe(false);
    // Four questions is already a lot to answer at once.
    expect(ok(Array.from({ length: 5 }, (_, i) => ({ question: `q${i}`, options: ["a", "b"] })))).toBe(
      false,
    );
    expect(ok([{ question: "q", options: Array.from({ length: 9 }, (_, i) => `o${i}`) }])).toBe(false);
  });
});

describe("questionsOf", () => {
  it("reads the current shape", () => {
    const payload = askQuestion({ questions: [{ question: "q", options: ["a", "b"] }] });
    expect(questionsOf(payload)).toEqual([{ question: "q", options: ["a", "b"], multiSelect: false }]);
  });

  it("reads transcripts written before multi-question existed", () => {
    // These rows are already in the database and still have to render.
    const legacy = { kind: "question", id: "1", question: "Which chart?", options: ["Bar", "Line"] };
    expect(questionsOf(legacy)).toEqual([
      { question: "Which chart?", options: ["Bar", "Line"], multiSelect: false },
    ]);
  });

  it("returns nothing for output it cannot read", () => {
    for (const junk of [null, undefined, {}, { questions: "no" }, { question: 7 }]) {
      expect(questionsOf(junk)).toEqual([]);
    }
  });
});

describe("formatQuestionAnswer", () => {
  const one = { question: "Which chart?", options: ["Bar", "Line"], multiSelect: false };
  const many = { question: "Which features?", options: ["Streaming", "Tools"], multiSelect: true };

  it("sends a lone single-choice answer bare", () => {
    // Unchanged from before multi-select: echoing back a question the model
    // asked one turn ago is noise.
    expect(formatQuestionAnswer([one], [["Bar"]])).toBe("Bar");
  });

  it("names the question once there is more than one", () => {
    expect(
      formatQuestionAnswer(
        [one, { question: "Which colour?", options: ["Red", "Blue"], multiSelect: false }],
        [["Bar"], ["Red"]],
      ),
    ).toBe("Which chart? — Bar\nWhich colour? — Red");
  });

  it("names the question when one choice could mean several things", () => {
    expect(formatQuestionAnswer([many], [["Streaming", "Tools"]])).toBe(
      "Which features? — Streaming, Tools",
    );
  });

  it("drops questions left unanswered instead of sending an empty line", () => {
    expect(formatQuestionAnswer([one, many], [["Bar"], []])).toBe("Which chart? — Bar");
  });

  it("is empty when nothing was picked, so the caller can refuse to send it", () => {
    expect(formatQuestionAnswer([one], [[]])).toBe("");
    expect(formatQuestionAnswer([one, many], [[], []])).toBe("");
  });
});
