import { getSpendStatus } from "@/lib/db/queries";
import { requireUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * The current user's own spend status. Meaningful only in managed mode, but
 * answered regardless of it — a personal BYOK account just gets back an
 * unconfigured (blocked, spent 0) row that the client never renders, rather
 * than this route needing to know about `ORG_MANAGED_KEYS` itself.
 */
export async function GET() {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const status = await getSpendStatus(authed.user.id);
  return Response.json(status);
}
