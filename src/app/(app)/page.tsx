import { ChatPage } from "@/components/chat/chat-page";

/**
 * A fresh conversation. The id is minted in the browser and no row is written
 * until the first message lands, so opening the app repeatedly does not litter
 * the sidebar with empty chats.
 *
 * Nothing here is dynamic: the page reads nothing that belongs to the user —
 * the layout above already required a session — and holds no per-request value,
 * which is what lets it be prefetched and rendered without a round trip.
 */
export default function NewChatPage() {
  return <ChatPage initialMessages={[]} initialTitle="New chat" initialShareId={null} isNew />;
}
