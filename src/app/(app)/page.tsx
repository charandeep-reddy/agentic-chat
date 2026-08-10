import { ChatPage } from "@/components/chat-page";
import { newId } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

/**
 * A fresh conversation. The id is minted here but no row is written until the
 * first message lands, so opening the app repeatedly does not litter the
 * sidebar with empty chats.
 *
 * No session lookup: the layout already required one, and this page reads
 * nothing that belongs to the user.
 */
export default function NewChatPage() {
  return (
    <ChatPage
      chatId={newId("chat")}
      initialMessages={[]}
      initialTitle="New chat"
      initialShareId={null}
      isNew
    />
  );
}
