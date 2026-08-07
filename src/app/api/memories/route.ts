import { createMemory, deleteAllMemories, listMemories } from "@/lib/db/queries";
import { requireUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const memories = await listMemories(authed.user.id);
  return Response.json({ memories });
}

export async function POST(req: Request) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  let body: { content?: string; category?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const content = body.content?.trim();
  if (!content) return Response.json({ error: "empty_content" }, { status: 400 });
  if (content.length > 500) return Response.json({ error: "too_long" }, { status: 400 });

  const created = await createMemory(authed.user.id, {
    content,
    category: body.category,
    source: "user",
  });
  return Response.json({ memory: created }, { status: 201 });
}

export async function DELETE() {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const deleted = await deleteAllMemories(authed.user.id);
  return Response.json({ deleted });
}
