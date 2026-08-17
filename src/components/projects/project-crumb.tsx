"use client";

import Link from "next/link";
import { useChatsList } from "../chat/chats-provider";
import { useProject } from "./projects-provider";
import { IconFolder } from "../icons";

/**
 * Which project this chat is in, as context rather than as a control.
 *
 * This used to be a picker. Moving a chat between projects is a rare,
 * organizational action, and it belongs with the comparable ones — pin, rename,
 * delete — in the sidebar row's menu. What the header owes the reader is the
 * answer to "where am I", which is one link.
 *
 * Renders nothing when the chat is not in a project, and nothing on a chat with
 * no messages: `/projects/[id]` is itself a new chat, and a breadcrumb there
 * would name the project the page is already titled after.
 */
export function ProjectCrumb({
  chatId,
  projectId,
}: {
  chatId: string;
  /** What the server rendered. Used when the sidebar has no row for this chat. */
  projectId: string | null;
}) {
  /**
   * The sidebar's row wins where it exists.
   *
   * Moving a chat happens in that row's menu and updates the shared list, so
   * reading the prop alone would leave this crumb naming the old project until
   * a reload. An older chat outside the sidebar's first page has no row, and
   * falls back to what the server rendered.
   */
  const { chats } = useChatsList();
  const row = chats.find((c) => c.id === chatId);
  const project = useProject(row ? row.projectId : projectId);
  if (!project) return null;

  return (
    <>
      <Link
        href={`/projects/${project.id}`}
        className="flex min-w-0 max-w-[8rem] shrink items-center gap-1.5 rounded-md px-1.5 py-1 text-dense text-text-muted transition-colors hover:bg-surface hover:text-text"
      >
        <IconFolder size={12} className="shrink-0 text-text-faint" />
        <span className="truncate">{project.name}</span>
      </Link>
      <span aria-hidden className="shrink-0 text-text-faint">
        &rsaquo;
      </span>
    </>
  );
}
