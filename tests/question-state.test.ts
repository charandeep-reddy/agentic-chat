import { describe, expect, it } from "vitest";
import { pendingQuestionOf, questionAnswersOf } from "@/lib/question-state";

const ask = (toolCallId: string, question: string) => ({
  parts: [
    {
      type: "tool-ask_user_question",
      state: "output-available",
      toolCallId,
      output: { kind: "question", id: toolCallId, questions: [{ question, options: ["a", "b"] }] },
    },
  ],
});

const answer = (toolCallId: string, text: string) => ({
  parts: [{ type: "text", text }],
  metadata: { answerTo: toolCallId },
});

const said = (text: string) => ({ parts: [{ type: "text", text }] });

const NONE = new Set<string>();

describe("questionAnswersOf", () => {
  it("pairs each answer with the question it answers", () => {
    const answers = questionAnswersOf([ask("t1", "Which?"), answer("t1", "a")]);
    expect(answers.get("t1")).toBe("a");
  });

  it("ignores ordinary messages", () => {
    expect(questionAnswersOf([said("hello"), ask("t1", "Which?")]).size).toBe(0);
  });

  it("joins a multi-part answer", () => {
    const message = { parts: [{ type: "text", text: "a" }, { type: "text", text: ", b" }], metadata: { answerTo: "t1" } };
    expect(questionAnswersOf([message]).get("t1")).toBe("a, b");
  });
});

describe("pendingQuestionOf", () => {
  it("finds an unanswered question", () => {
    const pending = pendingQuestionOf([ask("t1", "Which?")], new Map(), NONE);
    expect(pending?.toolCallId).toBe("t1");
  });

  it("stays answered across a reload", () => {
    // The regression this exists for: answered state lived in component state,
    // which a reload emptied — so the question came back live and could be
    // answered a second time, sending a duplicate request. Nothing here is
    // remembered, so a fresh mount over the same transcript sees it answered.
    const transcript = [ask("t1", "Which?"), answer("t1", "a")];
    const answers = questionAnswersOf(transcript);
    expect(pendingQuestionOf(transcript, answers, NONE)).toBeNull();
  });

  it("waits on the later ask when an earlier one was ignored", () => {
    const transcript = [ask("t1", "First?"), said("something else"), ask("t2", "Second?")];
    expect(pendingQuestionOf(transcript, new Map(), NONE)?.toolCallId).toBe("t2");
  });

  it("treats a dismissed question as settled", () => {
    expect(pendingQuestionOf([ask("t1", "Which?")], new Map(), new Set(["t1"]))).toBeNull();
  });

  it("ignores a question whose output has not arrived", () => {
    const streaming = {
      parts: [{ type: "tool-ask_user_question", state: "input-streaming", toolCallId: "t1" }],
    };
    expect(pendingQuestionOf([streaming], new Map(), NONE)).toBeNull();
  });

  it("carries the payload so the prompt can render without a second lookup", () => {
    const pending = pendingQuestionOf([ask("t1", "Which?")], new Map(), NONE);
    expect((pending?.payload as { questions: { question: string }[] }).questions[0].question).toBe(
      "Which?",
    );
  });
});
