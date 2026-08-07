import { ChatPage } from "@/components/chat-page";
import { newId } from "@/lib/db/queries";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * A fresh conversation. The id is minted here but no row is written until the
 * first message lands, so opening the app repeatedly does not litter the
 * sidebar with empty chats.
 */
export default async function NewChatPage() {
  const user = await requireUser();

  return (
    <ChatPage
      user={{ name: user.name, email: user.email, image: user.image ?? null }}
      chatId={newId("chat")}
      initialMessages={[]}
      initialTitle="New chat"
      initialShareId={null}
      isNew
    />
  );
}
