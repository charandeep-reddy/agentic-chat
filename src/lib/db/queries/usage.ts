import "server-only";

import { sql } from "drizzle-orm";
import { db } from "../index";

export interface ModelUsageRollup {
  model: string;
  input: number;
  output: number;
  total: number;
  reasoning: number;
  cached: number;
}

export async function getCumulativeUsage(userId: string): Promise<ModelUsageRollup[]> {
  const result = await db.execute(sql`
    SELECT 
      m.metadata->>'model' as model,
      sum((m.metadata->'usage'->>'input')::numeric) as input,
      sum((m.metadata->'usage'->>'output')::numeric) as output,
      sum((m.metadata->'usage'->>'total')::numeric) as total,
      sum((m.metadata->'usage'->>'reasoning')::numeric) as reasoning,
      sum((m.metadata->'usage'->>'cached')::numeric) as cached
    FROM message m
    JOIN chat c ON c.id = m.chat_id
    WHERE c.user_id = ${userId}
      AND m.metadata->>'model' IS NOT NULL
      AND m.metadata->>'usage' IS NOT NULL
    GROUP BY m.metadata->>'model'
  `);

  return result.rows.map((r: Record<string, unknown>) => ({
    model: r.model,
    input: Number(r.input) || 0,
    output: Number(r.output) || 0,
    total: Number(r.total) || 0,
    reasoning: Number(r.reasoning) || 0,
    cached: Number(r.cached) || 0,
  }));
}
