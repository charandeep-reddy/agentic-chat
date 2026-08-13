import { listModels } from "@/lib/model-catalog";
import { isProviderId } from "@/lib/providers";
import { requireUserApi } from "@/lib/session";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export type { ModelInfo } from "@/lib/model-catalog";

export async function GET(req: Request) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const limit = rateLimit("models", authed.user.id);
  if (!limit.ok) return rateLimitResponse(limit);

  const apiKey = req.headers.get("x-model-key") ?? req.headers.get("x-openrouter-key");
  if (!apiKey || apiKey.trim() === "") {
    return Response.json({ error: "missing_api_key" }, { status: 400 });
  }

  // Rejected rather than defaulted: guessing the provider would send this key
  // to somebody the user did not choose, which for a header full of secret is
  // the one mistake worth failing loudly on.
  const provider = req.headers.get("x-model-provider");
  if (!isProviderId(provider)) {
    return Response.json({ error: "bad_provider" }, { status: 400 });
  }

  const result = await listModels(provider, apiKey.trim());

  if (!result.ok) {
    if (result.error === "network") {
      return Response.json(
        { error: "network", message: "Could not reach the model provider." },
        { status: 502 },
      );
    }
    return Response.json({ error: "provider", status: result.status }, { status: result.status });
  }

  return Response.json({ models: result.models });
}
