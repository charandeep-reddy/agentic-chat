"use client";

import { useState } from "react";
import { IconTrash } from "../icons";

export interface MemoryItem {
  id: string;
  content: string;
  category: string;
  source: string;
  enabled: boolean;
  createdAt: string;
}

const SOURCE_LABELS: Record<string, string> = {
  agent: "saved by the model",
  user: "added by you",
  imported: "from a pack",
};

export function MemoryRow({
  item,
  onToggle,
  onDelete,
  onEdit,
}: {
  item: MemoryItem;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, content: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.content);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== item.content) onEdit(item.id, next);
    else setDraft(item.content);
  };

  return (
    <li
      className={`group flex items-start gap-3 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 transition-opacity ${
        item.enabled ? "" : "opacity-50"
      }`}
    >
      <input
        type="checkbox"
        checked={item.enabled}
        onChange={(e) => onToggle(item.id, e.target.checked)}
        aria-label={item.enabled ? "Disable this memory" : "Enable this memory"}
        className="mt-1 h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
      />

      <div className="min-w-0 flex-1">
        {editing ? (
          <textarea
            autoFocus
            rows={2}
            value={draft}
            maxLength={500}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") {
                setDraft(item.content);
                setEditing(false);
              }
            }}
            className="w-full resize-none rounded-md border border-accent/40 bg-surface px-2 py-1 text-dense text-text focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="block w-full text-left text-dense leading-relaxed text-text-secondary hover:text-text"
          >
            {item.content}
          </button>
        )}
        <p className="mt-1 flex items-center gap-1.5 text-micro text-text-faint">
          <span className="rounded-full border border-border-subtle px-1.5 py-px font-mono">
            {item.category}
          </span>
          <span>{SOURCE_LABELS[item.source] ?? item.source}</span>
          <span>· {new Date(item.createdAt).toLocaleDateString()}</span>
        </p>
      </div>

      <button
        type="button"
        onClick={() => onDelete(item.id)}
        aria-label="Delete memory"
        className="shrink-0 rounded-md p-1.5 text-text-faint opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
      >
        <IconTrash size={13} />
      </button>
    </li>
  );
}
