import { notFound } from "next/navigation";
import { ChatPage } from "@/components/chat-page";
import { ProjectIntro } from "@/components/project-intro";
import { getProject, listChats } from "@/lib/db/queries";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProject(id, user.id);
  return { title: project ? `${project.name} · Agentic Chat` : "Agentic Chat" };
}

/**
 * A project is a *place to work*, not a settings screen.
 *
 * The route renders a new chat already scoped to the project, so arriving here
 * and typing starts a conversation inside it. The project's own introduction —
 * its instructions and the chats already in it — takes the place of the usual
 * opening screen, and disappears the moment the transcript has anything in it.
 *
 * Editing the project lives at `./settings`. Configuring is the rare action and
 * should not be what the landing page is for.
 */
export default async function ProjectRoute({ params }: Props) {
  const { id } = await params;
  const user = await requireUser();

  const project = await getProject(id, user.id);
  if (!project) notFound();

  // Capped, not paged: this is a "pick up where you left off" list sitting
  // above a composer, not an archive. Everything is reachable from the sidebar
  // and `/chats`.
  const chats = await listChats(user.id, { projectId: project.id, limit: 8 });

  return (
    <ChatPage
      initialMessages={[]}
      initialTitle="New chat"
      initialShareId={null}
      isNew
      projectId={project.id}
      emptyState={
        <ProjectIntro
          name={project.name}
          description={project.description}
          instructions={project.instructions}
          settingsHref={`/projects/${project.id}/settings`}
          chats={chats.map((c) => ({
            id: c.id,
            title: c.title,
            updatedAt: c.updatedAt.toISOString(),
          }))}
        />
      }
    />
  );
}
