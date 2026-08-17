import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useProjects, useProjectsActions } from "../projects/projects-provider";
import { startNewChat } from "./new-chat";
import { MAX_PROJECT_NAME } from "@/lib/projects";
import { IconFolder, IconPlus } from "../icons";

/**
 * The projects list, above the chats.
 *
 * Above rather than below because it is the shorter and more stable of the two:
 * a handful of named folders a person made on purpose, over a list that grows
 * on its own and is ordered by recency. Putting the stable thing first means the
 * projects stay in the same place as the chat list churns beneath them.
 */
export function ProjectsSection({
  activeProjectId,
  onNavigate,
}: {
  activeProjectId: string | null;
  onNavigate: () => void;
}) {
  const projects = useProjects();
  const { create } = useProjectsActions();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const router = useRouter();

  const commit = async () => {
    const name = draft.trim();
    setCreating(false);
    setDraft("");
    if (!name) return;
    const project = await create({ name });
    // Straight into the new project: the reason to make one is to put something
    // in it, and leaving the user on the page they were on makes them find it.
    if (project) router.push(`/projects/${project.id}`);
  };

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between px-2.5 pb-1">
        <h2 className="text-micro font-medium uppercase tracking-wider text-text-faint">Projects</h2>
        <button
          type="button"
          aria-label="New project"
          onClick={() => setCreating(true)}
          className="rounded-md p-0.5 text-text-faint transition-colors hover:bg-surface hover:text-text"
        >
          <IconPlus size={13} />
        </button>
      </div>

      {creating && (
        <input
          autoFocus
          value={draft}
          maxLength={MAX_PROJECT_NAME}
          placeholder="Project name"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commit();
            if (e.key === "Escape") {
              setDraft("");
              setCreating(false);
            }
          }}
          className="mb-1 w-full rounded-lg border border-accent/50 bg-surface px-2.5 py-2 text-dense text-text placeholder:text-text-faint focus:outline-none"
        />
      )}

      {projects.length === 0 && !creating ? (
        <p className="px-2.5 py-1 text-micro leading-relaxed text-text-faint">
          Group chats that share instructions and context.
        </p>
      ) : (
        <div className="space-y-0.5">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              onClick={() => {
                // A project page is a new chat, so it needs the same nudge as
                // "New chat" does: once its first message has claimed the URL,
                // navigating back to the project is a navigation to the page
                // already on screen, and nothing would remount.
                startNewChat();
                onNavigate();
              }}
              className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-dense transition-colors ${
                project.id === activeProjectId
                  ? "bg-surface-raised text-text"
                  : "text-text-muted hover:bg-surface hover:text-text-secondary"
              }`}
            >
              <IconFolder size={13} className="shrink-0 text-text-faint" />
              <span className="truncate">{project.name}</span>
              {project.chatCount > 0 && (
                <span className="ml-auto shrink-0 text-micro text-text-faint">{project.chatCount}</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
