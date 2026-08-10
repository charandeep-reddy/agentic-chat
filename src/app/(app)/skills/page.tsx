import { listSkills } from "@/lib/db/queries";
import { requireUser } from "@/lib/session";
import { SkillsPage } from "@/components/skills-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Skills · Agentic Chat" };

export default async function Skills() {
  const user = await requireUser();
  const skills = await listSkills(user.id);

  return (
    <SkillsPage
      skills={skills.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        body: s.body,
        resources: s.resources ?? {},
        enabled: s.enabled,
        useCount: s.useCount,
        updatedAt: s.updatedAt.toISOString(),
      }))}
    />
  );
}
