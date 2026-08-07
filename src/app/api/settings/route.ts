import { getSettings, saveSettings } from "@/lib/db/queries";
import { requireUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";

const MAX_INSTRUCTION_LENGTH = 3000;

export async function GET() {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const settings = await getSettings(authed.user.id);
  return Response.json({ settings });
}

export async function PATCH(req: Request) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  let body: {
    aboutUser?: string;
    responseStyle?: string;
    defaultModel?: string;
    memoryEnabled?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  for (const field of ["aboutUser", "responseStyle"] as const) {
    const value = body[field];
    if (typeof value !== "string") continue;
    if (value.length > MAX_INSTRUCTION_LENGTH) {
      return Response.json({ error: "too_long", field }, { status: 400 });
    }
    patch[field] = value.trim() || null;
  }
  if (typeof body.defaultModel === "string") patch.defaultModel = body.defaultModel.trim() || null;
  if (typeof body.memoryEnabled === "boolean") patch.memoryEnabled = body.memoryEnabled;

  const settings = await saveSettings(authed.user.id, patch);
  return Response.json({ settings });
}
