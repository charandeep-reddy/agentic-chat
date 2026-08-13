"use client";

import { useMemo } from "react";
import { questionsOf } from "@/lib/tools/ask-question";
import { IconQuestion } from "./icons";

/**
 * What was asked, in the transcript.
 *
 * Purely a record. The live question is docked above the composer
 * (`QuestionPrompt`), and the answer arrives as the user message directly
 * below this — so this card only has to say what the choice was, not offer it
 * again. It used to stay clickable, which meant a reload re-armed a question
 * that had already been answered and let it be answered twice.
 */
export function QuestionCard({ payload, answer }: { payload: unknown; answer: string | null }) {
  const questions = useMemo(() => questionsOf(payload), [payload]);
  if (questions.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-surface/40 px-3 py-2.5">
      <div className="flex items-center gap-2 text-text-faint">
        <IconQuestion size={14} />
        <span className="text-dense">
          {questions.length > 1 ? `Asked ${questions.length} questions` : "Asked"}
        </span>
        {answer === null && (
          <span className="ml-auto font-mono text-micro text-text-faint">no answer</span>
        )}
      </div>
      <ul className="mt-1.5 space-y-1">
        {questions.map((q) => (
          <li key={q.question} className="text-dense leading-snug text-text-secondary">
            {q.question}
          </li>
        ))}
      </ul>
    </div>
  );
}
