export const dynamic = "force-dynamic";

interface OpenRouterModel {
  id: string;
  name?: string;
  context_length?: number | null;
  pricing?: {
    prompt?: string;
    completion?: string;
  } | null;
}

export interface ModelInfo {
  id: string;
  name: string;
  context: number | null;
}

export async function GET(req: Request) {
  const apiKey = req.headers.get("x-openrouter-key");
  if (!apiKey || apiKey.trim() === "") {
    return Response.json({ error: "missing_api_key" }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return Response.json({ error: "network", message: "Could not reach OpenRouter." }, { status: 502 });
  }

  if (!response.ok) {
    return Response.json({ error: "openrouter", status: response.status }, { status: response.status });
  }

  const data = (await response.json()) as { data?: OpenRouterModel[] };
  const models: ModelInfo[] = (data.data ?? [])
    .map((m) => ({ id: m.id, name: m.name ?? m.id, context: m.context_length ?? null }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return Response.json({ models });
}
