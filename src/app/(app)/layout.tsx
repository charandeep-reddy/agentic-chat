import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/session";
import { CHATS_PAGE_SIZE, listChats } from "@/lib/db/queries";

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
  // already in a position to hand over.
  const chats = await listChats(user.id, { limit: CHATS_PAGE_SIZE });

  return (
    <AppShell
      user={{ name: user.name, email: user.email, image: user.image ?? null }}
      initialChats={chats.map((c) => ({ ...c, updatedAt: c.updatedAt.toISOString() }))}
    >
      {children}
    </AppShell>
  );
}
