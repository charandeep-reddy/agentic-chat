import { ChatPage } from "@/components/chat-page";

export const metadata = { title: "Private chat · Agentic Chat" };

/**
 * An ephemeral conversation. Nothing about it is written down: no chat row, no
 * messages, no title, and no memories either read or saved. It has no
 * `/c/[id]` counterpart because there is no row for that route to load —
 * reloading this page starts over, which is the point.
 *
 * Static, like the new-chat route beside it: the id is minted in the browser,
 * so switching modes costs no round trip and both pages can be prefetched.
 */
export default function PrivateChatPage() {
  return (
    <ChatPage initialMessages={[]} initialTitle="Private chat" initialShareId={null} isNew ephemeral />
  );
}
