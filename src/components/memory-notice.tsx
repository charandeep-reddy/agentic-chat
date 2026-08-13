"use client";

import Link from "next/link";
import type { MemorySaved } from "@/lib/tools/memory";
import { IconBrain } from "./icons";

/**
 * A quiet inline confirmation that something was remembered — the same
 * affordance ChatGPT shows, with a route to undo it.
 */
export function MemoryNotice({ saved }: { saved: MemorySaved }) {
  return (
    <div className="animate-fade-up flex items-start gap-2.5 rounded-xl border border-human/25 bg-human-soft px-3 py-2.5">
      <IconBrain size={14} className="mt-0.5 shrink-0 text-human" />
      <div className="min-w-0 flex-1">
        <p className="text-dense font-medium text-human">
          {saved.alreadyKnown ? "Already remembered" : "Memory saved"}
        </p>
        <p className="mt-0.5 text-dense leading-relaxed text-text-secondary">{saved.content}</p>
      </div>
      <Link
        href="/memory"
        className="shrink-0 rounded-md px-2 py-1 text-micro text-text-faint underline-offset-2 hover:text-text-secondary hover:underline"
      >
        Manage
      </Link>
    </div>
  );
}
