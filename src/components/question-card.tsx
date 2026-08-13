"use client";

import { useMemo, useState } from "react";
import { formatQuestionAnswer, questionsOf } from "@/lib/tools/ask-question";
import { IconQuestion } from "./icons";

export type QuestionState = "pending" | "answered" | "superseded";

export function QuestionCard({
  payload,
  state,
  onAnswer,
}: {
  payload: unknown;
  state: QuestionState;
  onAnswer: (text: string) => void;
}) {
  const questions = useMemo(() => questionsOf(payload), [payload]);

  /**
   * One question with one answer stays a single click — that is the common
   * case and making it a click plus a Submit would be a tax on it. Anything
   * else has to be assembled before it can be sent, because a half-answered
   * set is not an answer.
   */
  const needsSubmit = questions.length > 1 || questions.some((q) => q.multiSelect);

  const [picks, setPicks] = useState<string[][]>(() => questions.map(() => []));
  const [typed, setTyped] = useState<string[]>(() => questions.map(() => ""));
  const [sent, setSent] = useState<string | null>(null);
  const done = state !== "pending" || sent !== null;

  const answersWithTyped = picks.map((chosen, i) => {
    const extra = typed[i]?.trim();
    return extra && !chosen.includes(extra) ? [...chosen, extra] : chosen;
  });
  const complete = answersWithTyped.every((a) => a.length > 0);

  const submit = (answers: string[][]) => {
    const text = formatQuestionAnswer(questions, answers);
    if (done || text.trim() === "") return;
    setSent(text);
    onAnswer(text);
  };

  const choose = (index: number, option: string) => {
    if (done) return;
    const question = questions[index];
    const chosen = picks[index] ?? [];

    if (!needsSubmit) {
      submit([[option]]);
      return;
    }

    const next = question.multiSelect
      ? chosen.includes(option)
        ? chosen.filter((o) => o !== option)
        : [...chosen, option]
      : chosen.includes(option)
        ? []
        : [option];

    setPicks(picks.map((p, i) => (i === index ? next : p)));
  };

  const setTypedAt = (index: number, value: string) =>
    setTyped(typed.map((t, i) => (i === index ? value : t)));

  return (
    <div
      className={`rounded-xl border transition-opacity ${
        state === "superseded"
          ? "border-border bg-surface/40 opacity-40"
          : "border-accent/30 bg-accent-soft"
      }`}
    >
      <header className="flex h-10 items-center gap-2 border-b border-border-subtle px-3">
        <span className={state === "pending" ? "text-accent" : "text-text-faint"}>
          <IconQuestion size={15} />
        </span>
        <h3 className="text-[13px] font-medium text-text-secondary">
          {questions.length > 1 ? `${questions.length} questions` : "Question"}
        </h3>
        {state === "superseded" && (
          <span className="ml-auto rounded-full border border-border-strong px-2 py-0.5 font-mono text-[10px] text-text-faint">
            superseded
          </span>
        )}
        {state === "pending" && !done && (
          <span className="ml-auto flex items-center gap-1.5 rounded-full border border-accent/30 px-2 py-0.5 font-mono text-[10px] text-accent">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            awaiting your answer
          </span>
        )}
      </header>

      <div className="space-y-5 p-4">
        {questions.map((q, qi) => {
          const chosen = picks[qi] ?? [];
          return (
            <div key={q.question}>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-text">{q.question}</p>
                {q.multiSelect && !done && (
                  <span className="shrink-0 text-[11px] text-text-faint">pick any</span>
                )}
              </div>

              <div className="space-y-2">
                {q.options.map((option, i) => {
                  const selected = chosen.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={done}
                      aria-pressed={selected}
                      onClick={() => choose(qi, option)}
                      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-[13px] transition-colors ${
                        selected
                          ? "border-accent bg-accent-soft text-accent"
                          : done
                            ? "cursor-not-allowed border-border text-text-faint"
                            : "border-border-strong text-text-secondary hover:border-accent hover:bg-accent-soft"
                      }`}
                    >
                      {needsSubmit ? (
                        <span
                          aria-hidden
                          className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center border ${
                            q.multiSelect ? "rounded-[4px]" : "rounded-full"
                          } ${selected ? "border-accent bg-accent" : "border-border-strong"}`}
                        >
                          {selected && <span className="h-1.5 w-1.5 rounded-full bg-surface" />}
                        </span>
                      ) : (
                        <span className="font-mono text-[10px] text-text-faint">{i + 1}</span>
                      )}
                      {option}
                    </button>
                  );
                })}
              </div>

              {!done && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="shrink-0 text-[11px] text-text-faint">
                    {q.multiSelect ? "or add your own:" : "or type your own:"}
                  </span>
                  <input
                    type="text"
                    value={typed[qi] ?? ""}
                    onChange={(e) => setTypedAt(qi, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      if (needsSubmit) {
                        if (complete) submit(answersWithTyped);
                      } else if ((typed[qi] ?? "").trim() !== "") {
                        submit([[typed[qi].trim()]]);
                      }
                    }}
                    maxLength={160}
                    placeholder="Answer…"
                    className="h-8 flex-1 rounded-md border border-border bg-surface px-2.5 text-[13px] text-text placeholder-text-faint focus:border-accent focus:outline-none"
                  />
                  {!needsSubmit && (
                    <button
                      type="button"
                      onClick={() => submit([[(typed[qi] ?? "").trim()]])}
                      disabled={(typed[qi] ?? "").trim() === ""}
                      className="rounded-md border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Answer
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {needsSubmit && !done && (
          <div className="flex items-center justify-end gap-3 border-t border-border-subtle pt-3">
            <span className="text-[11px] text-text-faint">
              {complete
                ? "Ready to send"
                : `${answersWithTyped.filter((a) => a.length > 0).length} of ${questions.length} answered`}
            </span>
            <button
              type="button"
              onClick={() => submit(answersWithTyped)}
              disabled={!complete}
              className="rounded-md border border-transparent bg-accent px-3 py-1.5 text-xs font-medium text-surface transition-colors disabled:border-border-subtle disabled:bg-transparent disabled:text-text-faint"
            >
              Submit
            </button>
          </div>
        )}

        {sent && (
          <p className="whitespace-pre-line border-t border-border-subtle pt-3 text-xs text-text-faint">
            You chose: <span className="font-medium text-accent">{sent}</span>
          </p>
        )}
      </div>
    </div>
  );
}
