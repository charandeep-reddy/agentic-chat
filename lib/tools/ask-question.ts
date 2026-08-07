import { z } from "zod";
import { randomUUID } from "node:crypto";

export const askQuestionSchema = z.object({
  question: z.string().min(1, "question must not be empty").max(500, "question must be under 500 characters"),
  options: z
    .array(z.string().min(1, "options must not be empty").max(80, "options must be under 80 characters"))
    .min(2, "provide at least 2 options")
    .max(8, "provide at most 8 options"),
  id: z.string().max(64).optional(),
});

export type AskQuestionArgs = z.infer<typeof askQuestionSchema>;

export interface QuestionPayload {
  kind: "question";
  id: string;
  question: string;
  options: string[];
}

export function askQuestion(args: AskQuestionArgs): QuestionPayload {
  const unique = [...new Set(args.options.map((o) => o.trim()).filter(Boolean))];
  if (unique.length < 2) {
    throw new Error("Provide at least 2 distinct options for the question.");
  }
  return {
    kind: "question",
    id: args.id ?? randomUUID(),
    question: args.question.trim(),
    options: unique,
  };
}
