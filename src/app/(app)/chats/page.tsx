import { requireUser } from "@/lib/session";
import { AllChatsPage } from "@/components/all-chats-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "All chats · Agentic Chat" };

/**
 * Browse everything, a page at a time.
 *
 * The list is fetched client-side rather than rendered here: it is paged, and
 * server-rendering only the first page would mean two different code paths
 * producing the same list. The layout has already required a session, so this
 * only has to confirm one exists before handing over.
 */
export default async function AllChats() {
  await requireUser();
  return <AllChatsPage />;
}
