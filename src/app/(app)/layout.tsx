import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/session";
import { CHATS_PAGE_SIZE, listChats, listProjects } from "@/lib/db/queries";

/**
 * The frame every signed-in route renders inside.
 *
 * Its whole job is to exist above the pages rather than inside them. Next.js
 * preserves a layout across navigations within its segment, so moving between
 * chats — or opening a new one — replaces only the content column. The sidebar,
 * the chat list, the command palette and the drawer state all survive, along
 * with the sidebar's scroll position.
 *
 * The route group `(app)` adds no path segment: `/`, `/c/[id]`, `/memory`,
 * `/profile` and `/skills` keep the URLs they had. `/share`, `/pack` and
 * `/sign-in` sit outside it because they are reachable signed-out and have no
 * sidebar.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  // One session lookup for the whole frame. Pages under here still call
  // `requireUser` for their own data, and Better Auth reads the same request,
  // so this does not add a round trip per navigation.
  const user = await requireUser();

  // The sidebar's first page, rendered rather than fetched. Without this the
  // sidebar mounted empty, showed a skeleton, and asked for rows the server was
  // already in a position to hand over. Projects ride along in the same pass —
  // they are few, and the sidebar draws them above the chat list.
  const [chats, projects] = await Promise.all([
    listChats(user.id, { limit: CHATS_PAGE_SIZE }),
    listProjects(user.id),
  ]);

  // `requireUser` above already promoted the `ADMIN_EMAIL` account on the way
  // through (`ensureFirstAdmin` in `session.ts`), so `user.role` reflects
  // that promotion by the time it's read here.
  const managed = process.env.ORG_MANAGED_KEYS === "true";
  const isAdmin = managed && (user as { role?: string | null }).role === "admin";

  return (
    <AppShell
      user={{ name: user.name, email: user.email, image: user.image ?? null }}
      initialChats={chats.map((c) => ({ ...c, updatedAt: c.updatedAt.toISOString() }))}
      initialProjects={projects.map((p) => ({ ...p, updatedAt: p.updatedAt.toISOString() }))}
      managed={managed}
      isAdmin={isAdmin}
    >
      {children}
    </AppShell>
  );
}
