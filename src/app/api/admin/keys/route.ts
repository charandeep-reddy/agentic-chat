import { isProviderId } from "@/lib/providers";
import { listManagedProviders, removeManagedKey, setManagedKey } from "@/lib/db/queries";
import { requireAdminApi } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Which providers the admin has configured a key for — never the keys themselves. */
export async function GET() {
  const authed = await requireAdminApi();
  if ("error" in authed) return authed.error;

  const providers = await listManagedProviders();
  return Response.json({ providers });
}

export async function POST(req: Request) {
  const authed = await requireAdminApi();
  if ("error" in authed) return authed.error;

  let body: { provider?: unknown; key?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  if (!isProviderId(body.provider)) {
    return Response.json({ error: "bad_provider" }, { status: 400 });
  }
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!key) {
    return Response.json({ error: "empty_key" }, { status: 400 });
  }

  await setManagedKey(body.provider, key);
  return Response.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: Request) {
  const authed = await requireAdminApi();
  if ("error" in authed) return authed.error;

  const provider = new URL(req.url).searchParams.get("provider");
  if (!isProviderId(provider)) {
    return Response.json({ error: "bad_provider" }, { status: 400 });
  }

  await removeManagedKey(provider);
  return Response.json({ ok: true });
}
