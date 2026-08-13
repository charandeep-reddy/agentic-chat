"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatQuestionAnswer, questionsOf } from "@/lib/tools/ask-question";
import { IconCheck, IconChevron, IconClose, IconEdit } from "./icons";

/**
 * The pending question, docked above the composer.
 *
 * It sits here rather than in the transcript because a question is not a
 * record of something that happened — it is the thing being asked of you right
 * now, and it belongs next to the other control that sends a message. The
 * composer stays live throughout: an option list is an offer, not a gate, and
 * answering in prose is always allowed.
 *
 * Several questions are stepped through one at a time. Showing four at once
 * turns a decision into a form, and the answer only goes back when the last
 * one is done anyway.
 */
export function QuestionPrompt({
  payload,
  onAnswer,
  onDismiss,
}: {
  payload: unknown;
  onAnswer: (text: string) => void;
  onDismiss: () => void;
}) {
  const questions = useMemo(() => questionsOf(payload), [payload]);
  const count = questions.length;

  const [step, setStep] = useState(0);
  const [picks, setPicks] = useState<string[][]>(() => questions.map(() => []));
  const [cursor, setCursor] = useState(0);
  const [editing, setEditing] = useState(false);
  const [custom, setCustom] = useState("");

  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const question = questions[step];

  // The card is keyboard-first, so it takes focus when it appears and again
  // whenever the step changes — otherwise the arrow-key hint in the footer
  // would be a lie until someone clicked.
  useEffect(() => {
    if (!editing) cardRef.current?.focus();
  }, [step, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (!question) return null;

  const chosen = picks[step] ?? [];
  /** One past the last option: the "Something else" row. */
  const customRow = question.options.length;
  const isLast = step === count - 1;

  const setPicksAt = (next: string[]) =>
    setPicks(picks.map((p, i) => (i === step ? next : p)));

  const leave = (nextPicks: string[][]) => {
    if (!isLast) {
      setPicks(nextPicks);
      setStep(step + 1);
      setCursor(0);
      setEditing(false);
      setCustom("");
      return;
    }
    const text = formatQuestionAnswer(questions, nextPicks);
    // Every question skipped is not an answer; close rather than send nothing.
    if (text.trim() === "") onDismiss();
    else onAnswer(text);
  };

  const withStep = (answers: string[]) =>
    picks.map((p, i) => (i === step ? answers : p));

  const choose = (option: string) => {
    if (question.multiSelect) {
      setPicksAt(chosen.includes(option) ? chosen.filter((o) => o !== option) : [...chosen, option]);
      return;
    }
    leave(withStep([option]));
  };

  const commitCustom = () => {
    const text = custom.trim();
    if (text === "") return;
    if (question.multiSelect) {
      setPicksAt(chosen.includes(text) ? chosen : [...chosen, text]);
      setCustom("");
      setEditing(false);
      cardRef.current?.focus();
      return;
    }
    leave(withStep([text]));
  };

  const skip = () => leave(withStep([]));

  const back = () => {
    if (step === 0) return;
    setStep(step - 1);
    setCursor(0);
    setEditing(false);
    setCustom("");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (editing) {
        setEditing(false);
        setCustom("");
        cardRef.current?.focus();
      } else {
        onDismiss();
      }
      return;
    }
    if (editing) return;

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      // Wraps, because a list this short is faster to cycle than to reverse.
      setCursor((c) => (c + delta + customRow + 1) % (customRow + 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (cursor === customRow) setEditing(true);
      else choose(question.options[cursor]);
      return;
    }
    // Number keys jump straight to an option, matching the badges.
    const digit = Number(e.key);
    if (Number.isInteger(digit) && digit >= 1 && digit <= question.options.length) {
      e.preventDefault();
      setCursor(digit - 1);
      choose(question.options[digit - 1]);
    }
  };

  const canContinue = question.multiSelect ? chosen.length > 0 : false;

  return (
    <div className="mx-auto w-full max-w-3xl shrink-0 px-4">
      <div
        ref={cardRef}
        tabIndex={0}
        role="group"
        aria-label={question.question}
        onKeyDown={onKeyDown}
        className="overflow-hidden rounded-2xl border border-border bg-surface/90 backdrop-blur-xl focus:outline-none"
      >
        <div className="flex items-start gap-3 px-4 pb-3 pt-3.5">
          <p className="min-w-0 flex-1 text-[15px] leading-snug text-text">{question.question}</p>
          <div className="flex shrink-0 items-center gap-2">
            {count > 1 && (
              <span className="font-mono text-[11px] text-text-faint">
                {step + 1} of {count}
              </span>
            )}
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss this question"
              className="rounded-md p-1 text-text-faint transition-colors hover:bg-surface-raised hover:text-text"
            >
              <IconClose size={15} />
            </button>
          </div>
        </div>

        <ul>
          {question.options.map((option, i) => {
            const active = cursor === i;
            const selected = chosen.includes(option);
            return (
              <li key={option} className={i > 0 ? "border-t border-border-subtle" : ""}>
                <button
                  type="button"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => choose(option)}
                  aria-pressed={question.multiSelect ? selected : undefined}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-[15px] transition-colors ${
                    active ? "bg-surface-raised text-text" : "text-text-secondary"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-mono text-[12px] ${
                      selected
                        ? "bg-accent text-surface"
                        : active
                          ? "bg-border-strong text-text"
                          : "bg-surface-raised text-text-faint"
                    }`}
                  >
                    {selected ? <IconCheck size={13} /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{option}</span>
                  {active && !question.multiSelect && (
                    <span aria-hidden className="shrink-0 font-mono text-[13px] text-text-faint">
                      ⏎
                    </span>
                  )}
                </button>
              </li>
            );
          })}

          <li className="border-t border-border-subtle">
            {editing ? (
              <div className="flex items-center gap-3 px-3 py-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-raised text-text-faint">
                  <IconEdit size={13} />
                </span>
                <input
                  ref={inputRef}
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    commitCustom();
                  }}
                  maxLength={160}
                  placeholder="Type your answer…"
                  className="min-w-0 flex-1 bg-transparent text-[15px] text-text placeholder-text-faint focus:outline-none"
                />
                <button
                  type="button"
                  onClick={commitCustom}
                  disabled={custom.trim() === ""}
                  className="shrink-0 rounded-md border border-border-strong px-2.5 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {question.multiSelect ? "Add" : "Send"}
                </button>
              </div>
            ) : (
              <div
                className={`flex items-center gap-3 pr-3 transition-colors ${
                  cursor === customRow ? "bg-surface-raised" : ""
                }`}
              >
                <button
                  type="button"
                  onMouseEnter={() => setCursor(customRow)}
                  onClick={() => setEditing(true)}
                  className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left text-[15px] text-text-faint"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-raised">
                    <IconEdit size={13} />
                  </span>
                  <span className="truncate">Something else</span>
                </button>
                <button
                  type="button"
                  onClick={skip}
                  className="shrink-0 rounded-md bg-surface-raised px-2.5 py-1.5 text-[13px] text-text-secondary transition-colors hover:text-text"
                >
                  Skip
                </button>
              </div>
            )}
          </li>
        </ul>

        {(step > 0 || question.multiSelect) && (
          <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-3 py-2">
            {step > 0 ? (
              <button
                type="button"
                onClick={back}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[13px] text-text-secondary transition-colors hover:bg-surface-raised hover:text-text"
              >
                <span aria-hidden className="rotate-90">
                  <IconChevron size={14} />
                </span>
                Back
              </button>
            ) : (
              <span />
            )}
            {question.multiSelect && (
              <button
                type="button"
                onClick={() => leave(picks)}
                disabled={!canContinue}
                className="rounded-md border border-transparent bg-accent px-3 py-1.5 text-[13px] font-medium text-surface transition-colors disabled:border-border-subtle disabled:bg-transparent disabled:text-text-faint"
              >
                {isLast ? "Send" : "Next"}
              </button>
            )}
          </div>
        )}
      </div>

      <p className="px-1 pt-2 text-center font-mono text-[11px] text-text-faint">
        ↑↓ to navigate · {question.multiSelect ? "Enter to toggle" : "Enter to select"} · or type
        below
      </p>
    </div>
  );
}
