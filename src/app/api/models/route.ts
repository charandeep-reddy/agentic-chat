import { BASE_URL } from "@/lib/provider";
import { requireUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";

interface RawModel {
  id: string;
  name?: string;
  context_length?: number | null;
}

export interface ModelInfo {
  id: string;
  name: string;
  context: number | null;
}

export async function GET(req: Request) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const apiKey = req.headers.get("x-model-key") ?? req.headers.get("x-openrouter-key");
  if (!apiKey || apiKey.trim() === "") {
    return Response.json({ error: "missing_api_key" }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return Response.json(
      { error: "network", message: "Could not reach the model provider." },
      { status: 502 },
    );
  }

  if (!response.ok) {
    return Response.json({ error: "provider", status: response.status }, { status: response.status });
  }

  const data = (await response.json()) as { data?: RawModel[] };
  const models: ModelInfo[] = (data.data ?? [])
    .map((m) => ({ id: m.id, name: m.name ?? m.id, context: m.context_length ?? null }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return Response.json({ models });
}
