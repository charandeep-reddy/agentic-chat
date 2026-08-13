import { z } from "zod";
import { randomUUID } from "node:crypto";

const optionSchema = z.object({
  label: z
    .string()
    .min(1, "an option label must not be empty")
    .max(60, "an option label must be under 60 characters"),
  description: z
    .string()
    .max(160, "an option description must be under 160 characters")
    .optional(),
});

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

/**
 * One choice.
 *
 * The label is the answer — short enough to read at a glance and short enough
 * to send back verbatim. The description is the gloss that used to get crammed
 * into the label in parentheses, where it made the most specific option the
 * one most likely to be clipped.
 */
export interface QuestionOption {
  label: string;
  description?: string;
}

export interface QuestionItem {
  question: string;
  options: QuestionOption[];
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
    const byLabel = new Map<string, QuestionOption>();
    for (const option of q.options) {
      const label = option.label.trim();
      const description = option.description?.trim();
      // First wins: a later duplicate is a slip, not a correction.
      if (label && !byLabel.has(label)) {
        byLabel.set(label, description ? { label, description } : { label });
      }
    }
    const options = [...byLabel.values()];
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
 * Options as objects, whatever shape they were stored in.
 *
 * Options used to be bare strings. Those rows are in the database and still
 * render, so every read normalises rather than assuming the current shape.
 */
function optionsOf(raw: unknown): QuestionOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((o): QuestionOption | null => {
      if (typeof o === "string") return o.trim() ? { label: o } : null;
      if (o && typeof o === "object" && typeof (o as QuestionOption).label === "string") {
        const { label, description } = o as QuestionOption;
        return description ? { label, description } : { label };
      }
      return null;
    })
    .filter((o): o is QuestionOption => o !== null);
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
  const p = payload as
    | (Partial<QuestionPayload> & { question?: unknown; options?: unknown })
    | null
    | undefined;

  if (Array.isArray(p?.questions)) {
    return p.questions
      .filter((q) => typeof q?.question === "string")
      .map((q) => ({
        question: q.question,
        options: optionsOf(q.options),
        multiSelect: q.multiSelect === true,
      }))
      .filter((q) => q.options.length > 0);
  }

  if (typeof p?.question === "string") {
    const options = optionsOf(p.options);
    return options.length > 0 ? [{ question: p.question, options, multiSelect: false }] : [];
  }

  return [];
}

/**
 * Sent when every question was skipped.
 *
 * Skipping is a response, not a silence. The model asked and is waiting; if
 * nothing goes back it waits forever and the card was merely hidden — which is
 * what made a skipped question reappear on reload, since the only durable
 * record of a settled question is a message carrying `answerTo`.
 */
export const SKIPPED_ANSWER = "Skipped — no preference, your call.";

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
