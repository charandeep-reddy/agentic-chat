"use client";

import { useState } from "react";
import type { QuestionPayload } from "@/lib/tools/ask-question";
import { IconQuestion } from "./icons";

export type QuestionState = "pending" | "answered" | "superseded";

export function QuestionCard({
  payload,
  state,
  onAnswer,
  onTypedAnswer,
}: {
  payload: QuestionPayload;
  state: QuestionState;
  onAnswer: (option: string) => void;
  onTypedAnswer: (text: string) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const done = state !== "pending" || picked !== null;

  const pick = (option: string) => {
    if (done) return;
    setPicked(option);
    onAnswer(option);
  };

  const submitTyped = () => {
    const text = typed.trim();
    if (done || text === "") return;
    setPicked(text);
    onTypedAnswer(text);
  };

  return (
    <div
      className={`rounded-xl border transition-opacity ${
        state === "superseded"
          ? "border-border bg-surface/40 opacity-40"
          : state === "pending"
            ? "border-accent/30 bg-accent-soft"
            : "border-accent/25 bg-accent-soft"
      }`}
    >
      <header className="flex h-10 items-center gap-2 border-b border-border-subtle px-3">
        <span className={state === "pending" ? "text-accent" : "text-text-faint"}>
          <IconQuestion size={15} />
        </span>
        <h3 className="text-[13px] font-medium text-text-secondary">Question</h3>
        {state === "superseded" && (
          <span className="ml-auto rounded-full border border-border-strong px-2 py-0.5 font-mono text-[10px] text-text-faint">
            superseded
          </span>
        )}
        {state === "pending" && (
          <span className="ml-auto flex items-center gap-1.5 rounded-full border border-accent/30 px-2 py-0.5 font-mono text-[10px] text-accent">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            awaiting your answer
          </span>
        )}
      </header>

      <div className="p-4">
        <p className="mb-3 text-sm font-medium text-text">{payload.question}</p>
        <div className="space-y-2">
          {payload.options.map((option, i) => (
            <button
              key={option}
              type="button"
              disabled={done}
              onClick={() => pick(option)}
              className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-[13px] transition-colors ${
                done
                  ? picked === option
                    ? "border-accent bg-accent-soft text-accent"
                    : "cursor-not-allowed border-border text-text-faint"
                  : "border-border-strong text-text-secondary hover:border-accent hover:bg-accent-soft"
              }`}
            >
              <span
                className={`font-mono text-[10px] ${
                  done && picked === option ? "text-accent" : "text-text-faint"
                }`}
              >
                {i + 1}
              </span>
              {option}
            </button>
          ))}
        </div>

        {!done && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[11px] text-text-faint">or type your own:</span>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitTyped();
                }
              }}
              maxLength={160}
              placeholder="Answer…"
              className="h-8 flex-1 rounded-md border border-border bg-surface px-2.5 text-[13px] text-text placeholder-text-faint focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={submitTyped}
              disabled={typed.trim() === ""}
              className="rounded-md border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40"
            >
              Answer
            </button>
          </div>
        )}

        {done && picked && (
          <p className="mt-3 text-xs text-text-faint">
            You chose: <span className="font-medium text-accent">{picked}</span>
          </p>
        )}
      </div>
    </div>
  );
}
