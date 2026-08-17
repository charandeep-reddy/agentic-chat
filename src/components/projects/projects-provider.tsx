"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ProjectSummary } from "@/lib/projects";

/**
 * The user's projects, seeded by the layout and mutated in place.
 *
 * Deliberately not paginated and not refetched on focus, unlike the chat list.
 * Projects are few — they are folders a person makes by hand, not a stream that
 * grows on its own — so the whole set fits in the first render and there is
 * nothing for a second query to discover.
 *
 * Split the same way `chats-provider` is: actions never change after mount, so
 * a component that only needs `moveChat` never re-renders when the list does.
 */
interface ProjectsActions {
  create: (input: { name: string; description?: string }) => Promise<ProjectSummary | null>;
  patch: (id: string, patch: Partial<Omit<ProjectSummary, "id">>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const ListContext = createContext<ProjectSummary[] | null>(null);
const ActionsContext = createContext<ProjectsActions | null>(null);

export function useProjects(): ProjectSummary[] {
  const value = useContext(ListContext);
  if (!value) throw new Error("useProjects must be used inside <ProjectsProvider>");
  return value;
}

export function useProjectsActions(): ProjectsActions {
  const value = useContext(ActionsContext);
  if (!value) throw new Error("useProjectsActions must be used inside <ProjectsProvider>");
  return value;
}

/** Looks a project up by id, for a header that has only the id to go on. */
export function useProject(id: string | null): ProjectSummary | null {
  const projects = useProjects();
  return useMemo(() => (id ? (projects.find((p) => p.id === id) ?? null) : null), [projects, id]);
}

export function ProjectsProvider({
  initialProjects,
  children,
}: {
  initialProjects: ProjectSummary[];
  children: ReactNode;
}) {
  const [projects, setProjects] = useState<ProjectSummary[]>(initialProjects);

  const create = useCallback(async (input: { name: string; description?: string }) => {
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) return null;
      const { project } = (await res.json()) as { project: ProjectSummary };
      // The server does not count chats on create — a new project has none.
      const created = { ...project, chatCount: 0 };
      setProjects((current) => [created, ...current]);
      return created;
    } catch (error) {
      console.error("[projects] create failed:", error);
      return null;
    }
  }, []);

  /** Optimistic, with rollback — the same shape as `patchChat`. */
  const patch = useCallback(async (id: string, next: Partial<Omit<ProjectSummary, "id">>) => {
    let previous: ProjectSummary[] = [];
    setProjects((current) => {
      previous = current;
      return current.map((p) => (p.id === id ? { ...p, ...next } : p));
    });
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch (error) {
      console.error("[projects] patch failed:", error);
      setProjects(previous);
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    let previous: ProjectSummary[] = [];
    setProjects((current) => {
      previous = current;
      return current.filter((p) => p.id !== id);
    });
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
    } catch (error) {
      console.error("[projects] delete failed:", error);
      setProjects(previous);
    }
  }, []);

  const actions = useMemo<ProjectsActions>(
    () => ({ create, patch, remove }),
    [create, patch, remove],
  );

  return (
    <ActionsContext.Provider value={actions}>
      <ListContext.Provider value={projects}>{children}</ListContext.Provider>
    </ActionsContext.Provider>
  );
}
