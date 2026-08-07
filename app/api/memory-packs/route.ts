import { createPack, listOwnedPacks, listPublicPacks } from "@/lib/db/queries";
import type { PackEntry } from "@/lib/db/queries";
import { requireUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";

const MAX_ENTRIES = 200;

export async function GET(req: Request) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "public";

  const packs =
    scope === "mine"
      ? await listOwnedPacks(authed.user.id)
      : await listPublicPacks(url.searchParams.get("q") ?? undefined);

  return Response.json({ packs });
}

export async function POST(req: Request) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  let body: {
    name?: string;
    description?: string;
    entries?: PackEntry[];
    isPublic?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) return Response.json({ error: "missing_name" }, { status: 400 });

  const entries = (body.entries ?? [])
    .filter((e) => typeof e?.content === "string" && e.content.trim())
    .slice(0, MAX_ENTRIES)
    .map((e) => ({ content: e.content.trim().slice(0, 500), category: e.category || "fact" }));

  if (entries.length === 0) return Response.json({ error: "no_entries" }, { status: 400 });

  const pack = await createPack(authed.user.id, {
    name: name.slice(0, 80),
    description: body.description?.slice(0, 400),
    entries,
    isPublic: body.isPublic ?? false,
  });

  return Response.json({ pack }, { status: 201 });
}
