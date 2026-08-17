"use client";

import { useState, type ReactNode } from "react";
import type { UIMessage } from "ai";
import { newId } from "@/lib/id";
import { useNewChatNonce } from "../sidebar/new-chat";
import { Chat } from "./chat";

/**
 * The chat pane. The sidebar frame around it is the layout's, not this
 * component's — see `app/(app)/layout.tsx`.
 *
 * A conversation that does not exist yet has its id minted here, in the
 * browser, rather than by the page above. Generating it on the server meant
 * both entry routes had to be `force-dynamic` — without that, `newId()` would
 * run once at build time and every visitor would share one chat id — so every
 * "New chat" and every mode switch paid a server round trip to produce a UUID,
 * and neither route could be prefetched. Minting it on the client lets both
 * pages be static, which is what removes the skeleton flash between them.
 *
 * The id never reaches the DOM — it is a `key`, a request body field and a
 * draft-storage key — so the server and the client generating different values
 * does not affect hydration.
 */
export function ChatPage(props: ChatPageProps) {
  const nonce = useNewChatNonce();
  /**
   * A saved chat is identified by its id. A new one has no id yet, so it is
   * identified by which "new chat" it is — remounting on request, which is
   * what makes the lazy id below run again.
   *
   * The project is part of that identity. Every project page is a new chat with
   * no id, so without it, moving from one project to another kept the same
   * mount: the same minted chat id, and a `projectId` already captured in
   * state — the second project's page would have quietly filed its first
   * message under the first project.
   */
  return <ChatPageInner key={props.chatId ?? `new:${nonce}:${props.projectId ?? ""}`} {...props} />;
}

interface ChatPageProps {
  /** Omitted for a new chat, which has no row and therefore no id yet. */
  chatId?: string;
  initialMessages: UIMessage[];
  initialTitle: string;
  initialShareId: string | null;
  isNew: boolean;
  /** A private chat: nothing is persisted and nothing personal is read. */
  ephemeral?: boolean;
  /** A saved chat's project. A new one takes whichever project started it. */
  projectId?: string | null;
  /** Replaces the opening screen while the transcript is empty. */
  emptyState?: ReactNode;
}

function ChatPageInner({
  chatId,
  initialMessages,
  initialTitle,
  initialShareId,
  isNew,
  ephemeral = false,
  projectId,
  emptyState,
}: ChatPageProps) {
  // Lazy initializer, so switching between two chats does not re-mint on every
  // render — and so a saved chat keeps the id it was loaded with.
  const [id] = useState(() => chatId ?? newId(ephemeral ? "tmp" : "chat"));

  /**
   * The project comes from the route: `/projects/[id]` renders a new chat
   * already scoped to it, and `/c/[id]` hands down whatever the row stores.
   */
  const project = ephemeral ? null : (projectId ?? null);

  return (
    <Chat
      // Remounting per chat id resets the streaming state cleanly when the
      // user jumps between conversations.
      key={id}
      chatId={id}
      initialMessages={initialMessages}
      initialTitle={initialTitle}
      initialShareId={initialShareId}
      isNew={isNew}
      ephemeral={ephemeral}
      projectId={project}
      emptyState={emptyState}
    />
  );
}
