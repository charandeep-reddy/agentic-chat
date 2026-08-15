import { listEmployeeSpend, setSpendLimit } from "@/lib/db/queries";
import { requireAdminApi } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Every account on this instance with its role and current-period spend. */
export async function GET() {
  const authed = await requireAdminApi();
  if ("error" in authed) return authed.error;

  const employees = await listEmployeeSpend();
  return Response.json({ employees });
}

/** Sets one employee's spend cap. `limitCents: null` means unlimited. */
export async function PATCH(req: Request) {
  const authed = await requireAdminApi();
  if ("error" in authed) return authed.error;

  let body: { userId?: unknown; limitCents?: unknown; periodDays?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  if (typeof body.userId !== "string" || !body.userId) {
    return Response.json({ error: "missing_user_id" }, { status: 400 });
  }
  const limitCents =
    body.limitCents === null
      ? null
      : typeof body.limitCents === "number" && Number.isFinite(body.limitCents) && body.limitCents >= 0
        ? Math.round(body.limitCents)
        : undefined;
  if (limitCents === undefined) {
    return Response.json({ error: "bad_limit" }, { status: 400 });
  }
  const periodDays =
    typeof body.periodDays === "number" && Number.isFinite(body.periodDays) && body.periodDays > 0
      ? Math.round(body.periodDays)
      : 30;

  await setSpendLimit(body.userId, { limitCents, periodDays });
  return Response.json({ ok: true });
}
