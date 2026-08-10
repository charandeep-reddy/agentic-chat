import { ChatPage } from "@/components/chat-page";
import { getSettings, newId } from "@/lib/db/queries";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * A fresh conversation. The id is minted here but no row is written until the
 * first message lands, so opening the app repeatedly does not litter the
 * sidebar with empty chats.
 *
 * The session is read again only for the account-level memory switch: the
 * composer's toggle has to know whether it has anything to act on.
 */
export default async function NewChatPage() {
  const user = await requireUser();
  const settings = await getSettings(user.id);

  return (
    <ChatPage
      chatId={newId("chat")}
      initialMessages={[]}
      initialTitle="New chat"
      initialShareId={null}
      isNew
      memoryScope="all"
      memoryAccountEnabled={settings?.memoryEnabled ?? true}
    />
  );
}
