import "server-only";

import { getSkillByName, listSkills, markSkillUsed } from "@/lib/db/queries";
import type { SkillDetail, SkillStore, SkillSummary } from "@/lib/tools/skills";
import type { Skill } from "@/lib/db/schema";

function toDetail(row: Skill): SkillDetail {
  return {
    name: row.name,
    description: row.description,
    body: row.body,
    resources: Object.keys(row.resources ?? {}),
  };
}

export function createDbSkillStore(userId: string): SkillStore {
  return {
    async list(): Promise<SkillSummary[]> {
      const rows = await listSkills(userId, { enabledOnly: true });
      return rows.map((r) => ({ name: r.name, description: r.description }));
    },

    async load(name) {
      const row = await getSkillByName(userId, name);
      if (!row || !row.enabled) return null;
      // Fire-and-forget: the usage counter is for the management page, and
      // waiting on the write would sit between the model and the instructions
      // it just asked for.
      void markSkillUsed(row.id).catch((error) => {
        console.error("[skills] failed to record use:", error);
      });
      return toDetail(row);
    },

    async readResource(name, path) {
      const row = await getSkillByName(userId, name);
      if (!row || !row.enabled) return null;
      return (row.resources ?? {})[path] ?? null;
    },
  };
}

/** The level-1 index for the system prompt. Empty when the user has no skills. */
export async function selectPromptSkills(userId: string): Promise<SkillSummary[]> {
  const rows = await listSkills(userId, { enabledOnly: true });
  return rows.map((r) => ({ name: r.name, description: r.description }));
}
