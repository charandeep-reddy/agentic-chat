"use client";

import { useState } from "react";
import Link from "next/link";
import { IconCheck, IconDownload } from "../icons";

export function InstallPackButton({ slug }: { slug: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(null);

  const install = async () => {
    setState("busy");
    try {
      const res = await fetch(`/api/memory-packs/${slug}/install`, { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      setResult((await res.json()) as { added: number; skipped: number });
      setState("done");
    } catch (error) {
      console.error("[pack] install failed:", error);
      setState("error");
    }
  };

  if (state === "done" && result) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/25 bg-accent-soft px-4 py-3">
        <IconCheck size={16} className="shrink-0 text-accent" />
        <p className="min-w-0 flex-1 text-dense text-text-secondary">
          Added {result.added} {result.added === 1 ? "memory" : "memories"}
          {result.skipped > 0 && ` — ${result.skipped} you already had`}.
        </p>
        <Link
          href="/memory"
          className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-dense font-medium text-accent-text hover:brightness-110"
        >
          Review them
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={state === "busy"}
        onClick={() => void install()}
        className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-dense font-medium text-accent-text hover:brightness-110 disabled:opacity-50"
      >
        <IconDownload size={15} />
        {state === "busy" ? "Adding…" : "Add to my memory"}
      </button>
      {state === "error" && (
        <p className="text-dense text-danger">Could not install the pack. Try again.</p>
      )}
    </div>
  );
}
