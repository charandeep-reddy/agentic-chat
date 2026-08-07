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
          ? "border-zinc-800 bg-white/[0.02] opacity-40"
          : state === "pending"
            ? "border-emerald-500/30 bg-emerald-500/[0.04]"
            : "border-emerald-500/25 bg-emerald-500/[0.03]"
      }`}
    >
      <header className="flex h-10 items-center gap-2 border-b border-zinc-800/70 px-3">
        <span className={state === "pending" ? "text-emerald-400" : "text-zinc-500"}>
          <IconQuestion size={15} />
        </span>
        <h3 className="text-[13px] font-medium text-zinc-300">Question</h3>
        {state === "superseded" && (
          <span className="ml-auto rounded-full border border-zinc-700 px-2 py-0.5 font-mono text-[10px] text-zinc-500">
            superseded
          </span>
        )}
        {state === "pending" && (
          <span className="ml-auto flex items-center gap-1.5 rounded-full border border-emerald-500/30 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            awaiting your answer
          </span>
        )}
      </header>

      <div className="p-4">
        <p className="mb-3 text-sm font-medium text-zinc-100">{payload.question}</p>
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
                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                    : "cursor-not-allowed border-zinc-800 text-zinc-600"
                  : "border-zinc-700 text-zinc-200 hover:border-emerald-500 hover:bg-emerald-500/5"
              }`}
            >
              <span
                className={`font-mono text-[10px] ${
                  done && picked === option ? "text-emerald-400" : done ? "text-zinc-700" : "text-zinc-600"
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
            <span className="text-[11px] text-zinc-600">or type your own:</span>
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
              className="h-8 flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 text-[13px] text-zinc-200 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={submitTyped}
              disabled={typed.trim() === ""}
              className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Answer
            </button>
          </div>
        )}

        {done && picked && (
          <p className="mt-3 text-xs text-zinc-500">
            You chose: <span className="font-medium text-emerald-400">{picked}</span>
          </p>
        )}
      </div>
    </div>
  );
}
