"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell, Section } from "./page-shell";
import {
  parseSkillMarkdown,
  slugifySkillName,
  SKILL_LIMITS,
  validateSkill,
} from "@/lib/tools/skills";
import { IconCheck, IconClose, IconEdit, IconPlus, IconSpark, IconTrash } from "./icons";

export interface SkillItem {
  id: string;
  name: string;
  description: string;
  body: string;
  resources: Record<string, string>;
  enabled: boolean;
  useCount: number;
  updatedAt: string;
}

interface Draft {
  name: string;
  description: string;
  body: string;
  resources: Array<{ path: string; content: string }>;
}

const EMPTY: Draft = { name: "", description: "", body: "", resources: [] };

const EXAMPLE = `---
name: weekly-report
description: Build the weekly ops report. Use when asked for "the weekly", a status report, or Monday numbers.
---

1. Fetch the numbers from the dashboard CSV the user pastes.
2. Chart revenue as a line, tickets as bars.
3. Lead with the three deltas that moved most, then the chart.
4. Keep the summary under 120 words.`;

function toDraft(skill: SkillItem): Draft {
  return {
    name: skill.name,
    description: skill.description,
    body: skill.body,
    resources: Object.entries(skill.resources ?? {}).map(([path, content]) => ({ path, content })),
  };
}

function toResourceMap(list: Draft["resources"]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const r of list) {
    const path = r.path.trim();
    if (path) map[path] = r.content;
  }
  return map;
}

function SkillEditor({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: Draft;
  submitLabel: string;
  onSubmit: (draft: Draft) => Promise<string | null>;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  /**
   * Pasting a whole SKILL.md into the instructions box splits it up rather
   * than storing the frontmatter as prose — that file is the format people
   * already have skills written in.
   */
  const onBodyPaste = (text: string) => {
    const parsed = parseSkillMarkdown(text);
    if (!parsed.name && !parsed.description) return false;
    set({
      name: draft.name || slugifySkillName(parsed.name ?? ""),
      description: draft.description || parsed.description || "",
      body: parsed.body,
    });
    return true;
  };

  const submit = async () => {
    const name = slugifySkillName(draft.name);
    const resources = toResourceMap(draft.resources);
    const invalid = validateSkill({
      name,
      description: draft.description.trim(),
      body: draft.body.trim(),
      resources,
    });
    if (invalid) {
      setError(invalid);
      return;
    }

    setSaving(true);
    setError(await onSubmit({ ...draft, name }));
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-text-secondary">Name</label>
          <input
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            onBlur={() => set({ name: slugifySkillName(draft.name) })}
            placeholder="weekly-report"
            maxLength={SKILL_LIMITS.name}
            className="w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 font-mono text-[13px] text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-text-secondary">
            When to use it
          </label>
          <input
            value={draft.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Build the weekly ops report. Use when asked for the weekly or Monday numbers."
            maxLength={SKILL_LIMITS.description}
            className="w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-[13px] text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
          />
        </div>
      </div>
      <p className="-mt-2 text-[11px] leading-relaxed text-text-faint">
        The description is the only thing the model reads before deciding to open the skill. Say
        what it does <em>and</em> the words a request for it would use.
      </p>

      <div>
        <label className="mb-1.5 block text-[12px] font-medium text-text-secondary">
          Instructions
        </label>
        <textarea
          rows={10}
          value={draft.body}
          maxLength={SKILL_LIMITS.body}
          onChange={(e) => set({ body: e.target.value })}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (draft.body.trim() === "" && onBodyPaste(text)) e.preventDefault();
          }}
          placeholder={EXAMPLE}
          className="scroll-thin w-full resize-y rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 font-mono text-[12px] leading-relaxed text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
        />
        <p className="mt-1 text-right text-[11px] text-text-faint">
          {draft.body.length}/{SKILL_LIMITS.body} · paste a SKILL.md and the frontmatter fills the
          fields above
        </p>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-[12px] font-medium text-text-secondary">Resources</label>
          <button
            type="button"
            onClick={() =>
              set({ resources: [...draft.resources, { path: "", content: "" }] })
            }
            disabled={draft.resources.length >= SKILL_LIMITS.resourceCount}
            className="flex items-center gap-1 text-[11px] text-text-faint hover:text-text-secondary disabled:opacity-40"
          >
            <IconPlus size={11} />
            Add file
          </button>
        </div>
        <p className="mb-2 text-[11px] leading-relaxed text-text-faint">
          Reference material the instructions can name — a template, a checklist, a table. The model
          fetches one only when it needs it, so long files cost nothing until then.
        </p>

        {draft.resources.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-subtle px-3 py-2.5 text-[12px] text-text-faint">
            None. Most skills do not need any.
          </p>
        ) : (
          <ul className="space-y-2">
            {draft.resources.map((resource, i) => (
              <li key={i} className="rounded-lg border border-border-subtle bg-bg-elevated p-2.5">
                <div className="mb-2 flex items-center gap-2">
                  <input
                    value={resource.path}
                    onChange={(e) =>
                      set({
                        resources: draft.resources.map((r, j) =>
                          j === i ? { ...r, path: e.target.value } : r,
                        ),
                      })
                    }
                    placeholder="reference/tone.md"
                    maxLength={SKILL_LIMITS.resourcePath}
                    className="min-w-0 flex-1 rounded-md border border-border-subtle bg-surface px-2 py-1 font-mono text-[12px] text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => set({ resources: draft.resources.filter((_, j) => j !== i) })}
                    aria-label={`Remove ${resource.path || "resource"}`}
                    className="shrink-0 rounded-md p-1.5 text-text-faint hover:bg-danger-soft hover:text-danger"
                  >
                    <IconTrash size={12} />
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={resource.content}
                  maxLength={SKILL_LIMITS.resource}
                  onChange={(e) =>
                    set({
                      resources: draft.resources.map((r, j) =>
                        j === i ? { ...r, content: e.target.value } : r,
                      ),
                    })
                  }
                  placeholder="Contents…"
                  className="scroll-thin w-full resize-y rounded-md border border-border-subtle bg-surface px-2 py-1.5 font-mono text-[12px] text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-[12px] text-danger">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-accent-text hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border px-3 py-2 text-[13px] text-text-muted hover:text-text"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function SkillRow({
  skill,
  onToggle,
  onEdit,
  onDelete,
}: {
  skill: SkillItem;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const resourceCount = Object.keys(skill.resources ?? {}).length;

  return (
    <li
      className={`group flex items-start gap-3 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 transition-opacity ${
        skill.enabled ? "" : "opacity-50"
      }`}
    >
      <input
        type="checkbox"
        checked={skill.enabled}
        onChange={(e) => onToggle(skill.id, e.target.checked)}
        aria-label={skill.enabled ? `Disable ${skill.name}` : `Enable ${skill.name}`}
        className="mt-1 h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
      />

      <div className="min-w-0 flex-1">
        <p className="font-mono text-[13px] text-text">{skill.name}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-text-secondary">
          {skill.description}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-text-faint">
          <span>{skill.body.length} chars</span>
          {resourceCount > 0 && <span>· {resourceCount} resources</span>}
          <span>· used {skill.useCount}×</span>
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          onClick={() => onEdit(skill.id)}
          aria-label={`Edit ${skill.name}`}
          className="rounded-md p-1.5 text-text-faint hover:bg-surface hover:text-text"
        >
          <IconEdit size={13} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(skill.id)}
          aria-label={`Delete ${skill.name}`}
          className="rounded-md p-1.5 text-text-faint hover:bg-danger-soft hover:text-danger"
        >
          <IconTrash size={13} />
        </button>
      </div>
    </li>
  );
}

export function SkillsPage({ skills }: { skills: SkillItem[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  /** Returns an error message for the editor to show, or null on success. */
  const send = async (url: string, method: string, payload?: unknown): Promise<string | null> => {
    try {
      const res = await fetch(url, {
        method,
        headers: payload ? { "content-type": "application/json" } : undefined,
        body: payload ? JSON.stringify(payload) : undefined,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        return data.message ?? `Request failed (${res.status}).`;
      }
      router.refresh();
      return null;
    } catch (error) {
      console.error("[skills] request failed:", error);
      return "Could not reach the server.";
    }
  };

  const create = async (draft: Draft) => {
    const error = await send("/api/skills", "POST", {
      name: draft.name,
      description: draft.description.trim(),
      body: draft.body.trim(),
      resources: toResourceMap(draft.resources),
    });
    if (!error) setAdding(false);
    return error;
  };

  const update = async (id: string, draft: Draft) => {
    const error = await send(`/api/skills/${id}`, "PATCH", {
      name: draft.name,
      description: draft.description.trim(),
      body: draft.body.trim(),
      resources: toResourceMap(draft.resources),
    });
    if (!error) setEditingId(null);
    return error;
  };

  const enabledCount = skills.filter((s) => s.enabled).length;

  return (
    <PageShell
      title="Skills"
      description="Instructions you write once and the model opens when they apply. Only each skill's name and description sit in the prompt — the body is fetched on demand, so a big library stays cheap."
      tabs={[
        { href: "/profile", label: "Profile", active: false },
        { href: "/memory", label: "Memory", active: false },
        { href: "/skills", label: "Skills", active: true },
      ]}
    >
      <Section
        title="Your skills"
        description={
          skills.length > 0
            ? `${enabledCount} of ${skills.length} enabled. Disabled skills stay saved but are hidden from the model.`
            : undefined
        }
        action={
          !adding && (
            <button
              type="button"
              onClick={() => {
                setAdding(true);
                setEditingId(null);
              }}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-text hover:brightness-110"
            >
              <IconPlus size={12} />
              New skill
            </button>
          )
        }
      >
        {adding && (
          <div className="mb-5 rounded-lg border border-accent/30 bg-bg-elevated p-4">
            <SkillEditor
              initial={EMPTY}
              submitLabel="Create skill"
              onSubmit={create}
              onCancel={() => setAdding(false)}
            />
          </div>
        )}

        {skills.length === 0 && !adding ? (
          <div className="rounded-lg border border-dashed border-border-subtle px-4 py-8 text-center">
            <IconSpark size={20} className="mx-auto text-text-faint" />
            <p className="mt-2 text-[13px] text-text-secondary">No skills yet.</p>
            <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-text-faint">
              A skill is how you want one kind of task done — the format of your weekly report, the
              rules for a code review, the tone of a customer reply.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {skills.map((skill) =>
              skill.id === editingId ? (
                <li
                  key={skill.id}
                  className="rounded-lg border border-accent/30 bg-bg-elevated p-4"
                >
                  <SkillEditor
                    initial={toDraft(skill)}
                    submitLabel="Save changes"
                    onSubmit={(draft) => update(skill.id, draft)}
                    onCancel={() => setEditingId(null)}
                  />
                </li>
              ) : (
                <SkillRow
                  key={skill.id}
                  skill={skill}
                  onToggle={(id, enabled) => void send(`/api/skills/${id}`, "PATCH", { enabled })}
                  onEdit={(id) => {
                    setEditingId(id);
                    setAdding(false);
                  }}
                  onDelete={(id) => void send(`/api/skills/${id}`, "DELETE")}
                />
              ),
            )}
          </ul>
        )}
      </Section>

      <Section
        title="How the model uses them"
        description="Worth knowing when a skill does not fire the way you expected."
      >
        <ol className="space-y-2.5 text-[12px] leading-relaxed text-text-muted">
          <li className="flex gap-2.5">
            <IconCheck size={13} className="mt-0.5 shrink-0 text-accent" />
            <span>
              Every enabled skill&apos;s <strong className="text-text-secondary">name and
              description</strong> are in the system prompt on every turn. That is the whole
              trigger — a vague description is why a skill gets skipped.
            </span>
          </li>
          <li className="flex gap-2.5">
            <IconCheck size={13} className="mt-0.5 shrink-0 text-accent" />
            <span>
              When one matches, the model calls <code className="font-mono">load_skill</code> and
              reads the instructions before starting.
            </span>
          </li>
          <li className="flex gap-2.5">
            <IconCheck size={13} className="mt-0.5 shrink-0 text-accent" />
            <span>
              Resources are fetched one at a time with{" "}
              <code className="font-mono">read_skill_resource</code>, only if the instructions point
              at them.
            </span>
          </li>
          <li className="flex gap-2.5">
            <IconClose size={13} className="mt-0.5 shrink-0 text-text-faint" />
            <span>
              Skills are instructions, not programs. Nothing in them is executed — the model reads
              them and works through the tools it already has.
            </span>
          </li>
        </ol>
      </Section>
    </PageShell>
  );
}
