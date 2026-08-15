import { notFound, redirect } from "next/navigation";
import { AdminPage } from "@/components/admin-page";
import { listManagedProviders, listEmployeeSpend } from "@/lib/db/queries";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin · Agentic Chat" };

/**
 * Unreachable on a personal BYOK deployment — `notFound()` rather than a
 * redirect, so the route's very existence doesn't leak that managed mode is
 * a thing this app can do to someone poking at URLs on a deployment that
 * isn't running it.
 */
export default async function AdminRoute() {
  if (process.env.ORG_MANAGED_KEYS !== "true") notFound();

  const user = await requireUser();
  // `requireUser` already promotes the `ADMIN_EMAIL` account on the way
  // through (`ensureFirstAdmin` in `session.ts`), so this check sees that
  // promotion on the very first request that triggers it.
  if ((user as { role?: string | null }).role !== "admin") redirect("/");

  const [providers, employees] = await Promise.all([listManagedProviders(), listEmployeeSpend()]);

  return <AdminPage configuredProviders={providers} employees={employees} />;
}
