import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { setSpendLimit, setUserRole } from "@/lib/db/queries";

/** Current session, or null. Safe to call from any server component or route. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

type SessionUser = { id: string; email: string; name: string; role?: string | null };

/**
 * Promotes the account matching `ADMIN_EMAIL` to the "admin" role,
 * idempotently — a no-op once that account already carries the role, and a
 * no-op entirely when `ADMIN_EMAIL` isn't set (personal BYOK deployments
 * never touch this). Checked on every session read rather than only at
 * sign-up, so setting the env var after the account already exists still
 * promotes it on its next request rather than requiring a fresh sign-up.
 *
 * The admin's own account is given an unlimited spend cap in the same call —
 * see `getSpendStatus`'s "no row means blocked" default in `queries.ts`,
 * which would otherwise lock the very account meant to configure everyone
 * else's limits out of its own deployment.
 */
async function ensureFirstAdmin(user: SessionUser): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail || user.role === "admin") return;
  await setUserRole(user.id, "admin");
  await setSpendLimit(user.id, { limitCents: null, periodDays: 30 });
}

/** Current user, redirecting to the sign-in page when there isn't one. */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  await ensureFirstAdmin(session.user as SessionUser);
  return session.user;
}

/**
 * Route-handler flavour of `requireUser`: returns the user, or a 401 Response
 * to return directly. Callers branch on `"error" in result`.
 */
export async function requireUserApi(): Promise<
  { user: { id: string; email: string; name: string; role?: string | null } } | { error: Response }
> {
  const session = await getSession();
  if (!session) {
    return {
      error: Response.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  await ensureFirstAdmin(session.user as SessionUser);
  return { user: session.user };
}

/**
 * Route-handler flavour for an admin-only endpoint. Distinct from checking
 * `role === "admin"` inline at each call site so the 403 body and status are
 * consistent everywhere managed mode gates something behind it.
 */
export async function requireAdminApi(): Promise<
  { user: { id: string; email: string; name: string } } | { error: Response }
> {
  const result = await requireUserApi();
  if ("error" in result) return result;
  if ((result.user as SessionUser).role !== "admin") {
    return { error: Response.json({ error: "forbidden" }, { status: 403 }) };
  }
  return result;
}
