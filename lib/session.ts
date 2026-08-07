import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/** Current session, or null. Safe to call from any server component or route. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** Current user, redirecting to the sign-in page when there isn't one. */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session.user;
}

/**
 * Route-handler flavour of `requireUser`: returns the user, or a 401 Response
 * to return directly. Callers branch on `"error" in result`.
 */
export async function requireUserApi(): Promise<
  { user: { id: string; email: string; name: string } } | { error: Response }
> {
  const session = await getSession();
  if (!session) {
    return {
      error: Response.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  return { user: session.user };
}
