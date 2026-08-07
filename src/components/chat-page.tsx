"use client";

import type { UIMessage } from "ai";
import { AppShell } from "./app-shell";
import { Chat } from "./chat";
import type { SidebarUser } from "./sidebar";

export function ChatPage({
  user,
  chatId,
  initialMessages,
  initialTitle,
  initialShareId,
  isNew,
}: {
  user: SidebarUser;
  chatId: string;
  initialMessages: UIMessage[];
  initialTitle: string;
  initialShareId: string | null;
  isNew: boolean;
}) {
  return (
    <AppShell user={user}>
      {({ toggleSidebar }) => (
        <Chat
          // Remounting per chat id resets the streaming state cleanly when the
          // user jumps between conversations.
          key={chatId}
          chatId={chatId}
          initialMessages={initialMessages}
          initialTitle={initialTitle}
          initialShareId={initialShareId}
          isNew={isNew}
          onToggleSidebar={toggleSidebar}
        />
      )}
    </AppShell>
  );
}
