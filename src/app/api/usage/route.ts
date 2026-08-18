import { getCumulativeUsage } from "@/lib/db/queries/usage";
import { requireUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const usage = await getCumulativeUsage(authed.user.id);
  return Response.json({ usage });
}
