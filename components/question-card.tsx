"use client";

import { useState } from "react";
import type { QuestionPayload } from "@/lib/tools/ask-question";

export function QuestionCard({
  payload,
  answered,
  onAnswer,
}: {
  payload: QuestionPayload;
  answered: boolean;
  onAnswer: (option: string) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const done = answered || picked !== null;

  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
      <p className="mb-3 text-sm font-medium text-zinc-100">{payload.question}</p>
      <div className="flex flex-wrap gap-2">
        {payload.options.map((option) => (
          <button
            key={option}
            type="button"
            disabled={done}
            onClick={() => {
              setPicked(option);
              onAnswer(option);
            }}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
              done
                ? picked === option
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                  : "cursor-not-allowed border-zinc-800 text-zinc-600"
                : "border-zinc-700 text-zinc-200 hover:border-emerald-500 hover:text-emerald-300"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      {done && <p className="mt-2 text-xs text-zinc-500">Answered{picked ? `: ${picked}` : " — continuing…"}</p>}
    </div>
  );
}
