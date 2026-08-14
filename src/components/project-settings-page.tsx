"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "./confirm-dialog";
import { PageShell, Section } from "./page-shell";
import { useProjectsActions } from "./projects-provider";
import { IconBrain, IconCheck, IconFolder } from "./icons";
import {
  describeProjectDeletion,
  MAX_PROJECT_DESCRIPTION,
  MAX_PROJECT_INSTRUCTIONS,
  MAX_PROJECT_NAME,
} from "@/lib/projects";

export interface ProjectMemory {
  id: string;
  content: string;
  category: string;
}

interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
}

/**
 * Editing a project: what it tells the model, and getting rid of it.
 *
 * Deliberately a second screen rather than the project's landing page. The
 * landing page is a live chat scoped to the project, because starting work is
 * the common action and configuring is the rare one — a form standing between
 * the user and the composer got that backwards.
 */
export function ProjectSettingsPage({
  project,
  chatCount,
  memories,
}: {
  project: ProjectDetail;
  chatCount: number;
  memories: ProjectMemory[];
}) {
  const router = useRouter();
  const { patch, remove } = useProjectsActions();

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [instructions, setInstructions] = useState(project.instructions ?? "");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const dirty =
    name.trim() !== project.name ||
    description.trim() !== (project.description ?? "") ||
    instructions.trim() !== (project.instructions ?? "");

  const save = async () => {
    const next = name.trim();
    if (!next) {
      setName(project.name);
      return;
    }
    setSaving(true);
    // Through the store, so the sidebar's copy of the name changes with it.
    await patch(project.id, { name: next, description: description.trim() || null });
    // `instructions` is not on the summary the provider holds — it is only ever
    // read by the prompt builder — so it goes straight to the endpoint rather
    // than through a store with nowhere to put it.
    try {
      await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instructions: instructions.trim() }),
      });
    } catch (error) {
      console.error("[project] failed to save instructions:", error);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
    // Re-reads the server component above, so the saved values become the new
    // baseline without a reload.
    router.refresh();
  };

  return (
    <PageShell title={`${project.name} · Settings`}>
      <Link
        href={`/projects/${project.id}`}
        className="-mt-2 flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-dense text-text-muted transition-colors hover:bg-surface hover:text-text"
      >
        <IconFolder size={13} />
        Back to {project.name}
      </Link>

      <Section
        title="Instructions"
        description="Followed in every chat in this project. Where these conflict with your account-wide preferences, these win."
        action={
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => void save()}
            className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-dense font-medium text-accent-text transition-opacity disabled:opacity-40"
          >
            {saved ? (
              <span className="flex items-center gap-1.5">
                <IconCheck size={13} />
                Saved
              </span>
            ) : saving ? (
              "Saving…"
            ) : (
              "Save"
            )}
          </button>
        }
      >
        <div className="space-y-3">
          <div>
            <label htmlFor="project-name" className="mb-1.5 block text-dense text-text-muted">
              Name
            </label>
            <input
              id="project-name"
              value={name}
              maxLength={MAX_PROJECT_NAME}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-ui text-text focus:border-border-strong focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="project-description" className="mb-1.5 block text-dense text-text-muted">
              Description
            </label>
            <input
              id="project-description"
              value={description}
              maxLength={MAX_PROJECT_DESCRIPTION}
              placeholder="What this project is for. Never sent to the model."
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-ui text-text placeholder:text-text-faint focus:border-border-strong focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="project-instructions"
              className="mb-1.5 block text-dense text-text-muted"
            >
              Custom instructions
            </label>
            <textarea
              id="project-instructions"
              value={instructions}
              rows={10}
              maxLength={MAX_PROJECT_INSTRUCTIONS}
              placeholder={
                "e.g. This project is the Q3 migration.\nAlways answer in terms of the Postgres schema in the first message.\nPrefer diagrams over prose for anything about data flow."
              }
              onChange={(e) => setInstructions(e.target.value)}
              className="w-full resize-y rounded-lg border border-border-subtle bg-bg px-3 py-2 font-mono text-dense leading-relaxed text-text placeholder:text-text-faint focus:border-border-strong focus:outline-none"
            />
          </div>
        </div>
      </Section>

      <Section
        title="Memories"
        description="Saved inside this project and readable only from its chats. Your account-wide memories are available here too — these are the ones that stay put."
      >
        {memories.length === 0 ? (
          <p className="text-dense leading-relaxed text-text-faint">
            Nothing saved in this project yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {memories.map((memory) => (
              <li
                key={memory.id}
                className="flex items-start gap-2.5 rounded-lg border border-border-subtle bg-bg px-3 py-2"
              >
                <IconBrain size={13} className="mt-0.5 shrink-0 text-text-faint" />
                <span className="min-w-0 flex-1 text-dense leading-relaxed text-text-secondary">
                  {memory.content}
                </span>
                <span className="shrink-0 text-micro text-text-faint">{memory.category}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Delete project"
        description={
          chatCount === 0 && memories.length === 0
            ? "Nothing is in this project yet."
            : "Conversations in a project are kept and become ungrouped. Its memories are deleted with it."
        }
      >
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="rounded-lg border border-danger/40 px-3 py-1.5 text-dense font-medium text-danger transition-colors hover:bg-danger-soft"
        >
          Delete {project.name}
        </button>
      </Section>

      {confirmingDelete && (
        <ConfirmDialog
          title={`Delete "${project.name}"?`}
          description={describeProjectDeletion(chatCount, memories.length)}
          confirmLabel="Delete project"
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            setConfirmingDelete(false);
            void remove(project.id);
            router.push("/");
          }}
        />
      )}
    </PageShell>
  );
}
