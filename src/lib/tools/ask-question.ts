import { z } from "zod";
import { randomUUID } from "node:crypto";

const optionSchema = z
  .string()
  .min(1, "options must not be empty")
  .max(80, "options must be under 80 characters");

const questionSchema = z.object({
  question: z
    .string()
    .min(1, "question must not be empty")
    .max(500, "question must be under 500 characters"),
  options: z
    .array(optionSchema)
    .min(2, "provide at least 2 options")
    .max(8, "provide at most 8 options"),
  multiSelect: z.boolean().optional(),
});

export const askQuestionSchema = z.object({
  questions: z
    .array(questionSchema)
    .min(1, "ask at least 1 question")
    .max(4, "ask at most 4 questions"),
  id: z.string().max(64).optional(),
});

export type AskQuestionArgs = z.infer<typeof askQuestionSchema>;

export interface QuestionItem {
  question: string;
  options: string[];
  /** Whether the user may pick more than one option. */
  multiSelect: boolean;
}

export interface QuestionPayload {
  kind: "question";
  id: string;
  questions: QuestionItem[];
}

export function askQuestion(args: AskQuestionArgs): QuestionPayload {
  const questions = args.questions.map((q) => {
    const options = [...new Set(q.options.map((o) => o.trim()).filter(Boolean))];
    if (options.length < 2) {
      throw new Error(`Provide at least 2 distinct options for "${q.question.trim()}".`);
    }
    return { question: q.question.trim(), options, multiSelect: q.multiSelect === true };
  });

  // Answers are reported back keyed by their question text, so two questions
  // worded identically would produce an answer nobody could attribute.
  if (new Set(questions.map((q) => q.question)).size !== questions.length) {
    throw new Error("Each question must be distinct.");
  }

  return { kind: "question", id: args.id ?? randomUUID(), questions };
}

/**
 * The questions in a stored tool output.
 *
 * Transcripts written before this tool could ask more than one question hold a
 * single `question`/`options` pair at the top level. They are already in the
 * database and still render, so reading always goes through here rather than
 * touching `.questions` directly.
 */
export function questionsOf(payload: unknown): QuestionItem[] {
  const p = payload as Partial<QuestionPayload> & { question?: unknown; options?: unknown };

  if (Array.isArray(p?.questions)) {
    return p.questions
      .filter((q) => typeof q?.question === "string" && Array.isArray(q?.options))
      .map((q) => ({
        question: q.question,
        options: q.options,
        multiSelect: q.multiSelect === true,
      }));
  }

  if (typeof p?.question === "string" && Array.isArray(p.options)) {
    return [{ question: p.question, options: p.options as string[], multiSelect: false }];
  }

  return [];
}

/**
 * The user's picks, as the message that gets sent back.
 *
 * A single-choice, single-question ask sends the bare option — that is what it
 * has always sent, and repeating the question back to a model that just asked
 * it is noise. Anything else has to name which question each answer belongs to.
 */
export function formatQuestionAnswer(questions: QuestionItem[], answers: string[][]): string {
  if (questions.length === 1 && !questions[0]?.multiSelect) {
    return (answers[0] ?? []).join(", ");
  }
  return questions
    .map((q, i) => `${q.question} — ${(answers[i] ?? []).join(", ")}`)
    .filter((line) => !line.endsWith("— "))
    .join("\n");
}
