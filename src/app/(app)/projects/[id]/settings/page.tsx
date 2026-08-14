import { notFound } from "next/navigation";
import { ProjectSettingsPage } from "@/components/project-settings-page";
import { getProject, listChats, listMemories } from "@/lib/db/queries";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProject(id, user.id);
  return { title: project ? `${project.name} settings · Agentic Chat` : "Agentic Chat" };
}

export default async function ProjectSettingsRoute({ params }: Props) {
  const { id } = await params;
  const user = await requireUser();

  // First, and alone: everything below is scoped to a project this user owns,
  // and a 404 here is what makes the rest of the page unreachable for one they
  // do not.
  const project = await getProject(id, user.id);
  if (!project) notFound();

  const [chats, memories] = await Promise.all([
    listChats(user.id, { projectId: project.id, limit: 100 }),
    // `belongingTo`, not `visibleIn`: this screen is about what the project
    // holds, and folding the account-wide memories in would suggest deleting
    // one here removes it everywhere.
    listMemories(user.id, { scope: { belongingTo: project.id } }),
  ]);

  return (
    <ProjectSettingsPage
      project={{
        id: project.id,
        name: project.name,
        description: project.description,
        instructions: project.instructions,
      }}
      chatCount={chats.length}
      memories={memories.map((m) => ({
        id: m.id,
        content: m.content,
        category: m.category,
      }))}
    />
  );
}
