"use client";

import type { UIMessage } from "ai";
import { Chat } from "./chat";
import type { MemoryScope } from "@/lib/memory-scope";

/**
 * The chat pane. The sidebar frame around it is the layout's, not this
 * component's — see `app/(app)/layout.tsx`.
 */
export function ChatPage({
  chatId,
  initialMessages,
  initialTitle,
  initialShareId,
  isNew,
  memoryScope,
  memoryAccountEnabled,
}: {
  chatId: string;
  initialMessages: UIMessage[];
  initialTitle: string;
  initialShareId: string | null;
  isNew: boolean;
  memoryScope: MemoryScope;
  memoryAccountEnabled: boolean;
}) {
  return (
    <Chat
      // Remounting per chat id resets the streaming state cleanly when the
      // user jumps between conversations.
      key={chatId}
      chatId={chatId}
      initialMessages={initialMessages}
      initialTitle={initialTitle}
      initialShareId={initialShareId}
      isNew={isNew}
      memoryScope={memoryScope}
      memoryAccountEnabled={memoryAccountEnabled}
    />
  );
}
