import { describe, expect, it } from "vitest";
import {
  SKIPPED_ANSWER,
  askQuestion,
  askQuestionSchema,
  formatQuestionAnswer,
  questionsOf,
} from "@/lib/tools/ask-question";

/** Options as the model now writes them. */
const opts = (...labels: string[]) => labels.map((label) => ({ label }));

describe("ask_user_question", () => {
  it("builds a payload with a generated id", () => {
    const payload = askQuestion({
      questions: [{ question: "Which chart?", options: opts("Bar", "Line") }],
    });
    expect(payload.kind).toBe("question");
    expect(payload.id).toBeTruthy();
    expect(payload.questions).toEqual([
      { question: "Which chart?", options: [{ label: "Bar" }, { label: "Line" }], multiSelect: false },
    ]);
  });

  it("keeps a description alongside its label", () => {
    // The whole reason options stopped being bare strings: the detail that
    // used to be crammed into the label in parentheses now has its own field.
    const payload = askQuestion({
      questions: [
        {
          question: "How should the analysis be delivered?",
          options: [
            { label: "Quick summary", description: "avg, min, max, trends" },
            { label: "Deep dive" },
          ],
        },
      ],
    });
    expect(payload.questions[0].options).toEqual([
      { label: "Quick summary", description: "avg, min, max, trends" },
      { label: "Deep dive" },
    ]);
  });

  it("omits an empty description rather than storing a blank one", () => {
    const payload = askQuestion({
      questions: [{ question: "q", options: [{ label: "a", description: "  " }, { label: "b" }] }],
    });
    expect(payload.questions[0].options[0]).toEqual({ label: "a" });
  });

  it("carries several questions in one call", () => {
    const payload = askQuestion({
      questions: [
        { question: "Which provider?", options: opts("Anthropic", "OpenAI") },
        { question: "Which features?", options: opts("Streaming", "Tools"), multiSelect: true },
      ],
    });
    expect(payload.questions).toHaveLength(2);
    expect(payload.questions[1].multiSelect).toBe(true);
  });

  it("defaults multiSelect to false rather than undefined", () => {
    // The card branches on it directly, so it has to be a boolean on the way out.
    const payload = askQuestion({ questions: [{ question: "q", options: opts("a", "b") }] });
    expect(payload.questions[0].multiSelect).toBe(false);
  });

  it("dedupes on the label and trims it", () => {
    const payload = askQuestion({
      questions: [{ question: "Pick", options: opts(" a ", "a", " b ") }],
    });
    expect(payload.questions[0].options).toEqual([{ label: "a" }, { label: "b" }]);
  });

  it("keeps the first of two options sharing a label", () => {
    // A later duplicate is a slip, not a correction.
    const payload = askQuestion({
      questions: [
        {
          question: "Pick",
          options: [
            { label: "a", description: "first" },
            { label: "a", description: "second" },
            { label: "b" },
          ],
        },
      ],
    });
    expect(payload.questions[0].options).toEqual([
      { label: "a", description: "first" },
      { label: "b" },
    ]);
  });

  it("rejects fewer than 2 distinct options, naming the question", () => {
    expect(() =>
      askQuestion({
        questions: [
          { question: "Fine", options: opts("a", "b") },
          { question: "Broken", options: opts("same", "same") },
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
          { question: "Which?", options: opts("a", "b") },
          { question: " Which? ", options: opts("c", "d") },
        ],
      }),
    ).toThrow(/distinct/);
  });

  it("validates through the zod schema", () => {
    const ok = (questions: unknown) => askQuestionSchema.safeParse({ questions }).success;
    expect(ok([{ question: "q", options: opts("a", "b") }])).toBe(true);
    expect(ok([{ question: "q", options: opts("a", "b"), multiSelect: true }])).toBe(true);
    expect(ok([{ question: "q", options: [{ label: "a", description: "why" }, { label: "b" }] }])).toBe(
      true,
    );
    // Bare strings are no longer accepted on the way in — only on the way out,
    // where stored transcripts still hold them.
    expect(ok([{ question: "q", options: ["a", "b"] }])).toBe(false);
    expect(ok([{ question: "q", options: opts("a") }])).toBe(false);
    expect(ok([{ question: "", options: opts("a", "b") }])).toBe(false);
    expect(ok([])).toBe(false);
    // Four questions is already a lot to answer at once.
    expect(ok(Array.from({ length: 5 }, (_, i) => ({ question: `q${i}`, options: opts("a", "b") })))).toBe(
      false,
    );
    expect(ok([{ question: "q", options: opts(...Array.from({ length: 9 }, (_, i) => `o${i}`)) }])).toBe(
      false,
    );
  });

  it("caps the label short enough to read at a glance", () => {
    // A long label is what got clipped on a phone in the first place; the
    // detail belongs in `description`, which is allowed to be longer.
    expect(ok60("a".repeat(60))).toBe(true);
    expect(ok60("a".repeat(61))).toBe(false);
  });
});

/** Whether a label of this length passes the schema. */
function ok60(label: string): boolean {
  return askQuestionSchema.safeParse({
    questions: [{ question: "q", options: [{ label }, { label: "other" }] }],
  }).success;
}

describe("questionsOf", () => {
  it("reads the current shape", () => {
    const payload = askQuestion({ questions: [{ question: "q", options: opts("a", "b") }] });
    expect(questionsOf(payload)).toEqual([
      { question: "q", options: [{ label: "a" }, { label: "b" }], multiSelect: false },
    ]);
  });

  it("reads transcripts whose options are bare strings", () => {
    // Written before options gained a description. Already in the database.
    const legacy = { kind: "question", id: "1", questions: [{ question: "q", options: ["a", "b"] }] };
    expect(questionsOf(legacy)).toEqual([
      { question: "q", options: [{ label: "a" }, { label: "b" }], multiSelect: false },
    ]);
  });

  it("reads transcripts written before multi-question existed", () => {
    const legacy = { kind: "question", id: "1", question: "Which chart?", options: ["Bar", "Line"] };
    expect(questionsOf(legacy)).toEqual([
      { question: "Which chart?", options: [{ label: "Bar" }, { label: "Line" }], multiSelect: false },
    ]);
  });

  it("drops a question left with no readable options", () => {
    expect(questionsOf({ questions: [{ question: "q", options: [7, null] }] })).toEqual([]);
  });

  it("returns nothing for output it cannot read", () => {
    for (const junk of [null, undefined, {}, { questions: "no" }, { question: 7 }]) {
      expect(questionsOf(junk)).toEqual([]);
    }
  });
});

describe("formatQuestionAnswer", () => {
  const one = { question: "Which chart?", options: opts("Bar", "Line"), multiSelect: false };
  const many = { question: "Which features?", options: opts("Streaming", "Tools"), multiSelect: true };

  it("sends a lone single-choice answer bare", () => {
    // Unchanged from before multi-select: echoing back a question the model
    // asked one turn ago is noise.
    expect(formatQuestionAnswer([one], [["Bar"]])).toBe("Bar");
  });

  it("sends the label, never the description", () => {
    // The description is a gloss for the reader; the label is the answer.
    const glossed = {
      question: "How?",
      options: [{ label: "Quick summary", description: "avg, min, max" }, { label: "Deep dive" }],
      multiSelect: false,
    };
    expect(formatQuestionAnswer([glossed], [["Quick summary"]])).toBe("Quick summary");
  });

  it("names the question once there is more than one", () => {
    expect(
      formatQuestionAnswer(
        [one, { question: "Which colour?", options: opts("Red", "Blue"), multiSelect: false }],
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

  it("is empty when nothing was picked, so the caller can substitute a skip", () => {
    expect(formatQuestionAnswer([one], [[]])).toBe("");
    expect(formatQuestionAnswer([one, many], [[], []])).toBe("");
  });

  it("has a skip message to send in that case", () => {
    // Skipping has to send something. A question only counts as settled once
    // a message carries its `answerTo`, so closing silently left it pending
    // and a reload brought the card straight back.
    expect(SKIPPED_ANSWER.trim()).not.toBe("");
  });
});
