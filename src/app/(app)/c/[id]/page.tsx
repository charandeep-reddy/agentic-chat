import { notFound } from "next/navigation";
import type { UIMessage } from "ai";
import { ChatPage } from "@/components/chat-page";
import { getChat, getMessages } from "@/lib/db/queries";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const user = await requireUser();
  const chat = await getChat(id, user.id);
  return { title: chat ? `${chat.title} · Agentic Chat` : "Agentic Chat" };
}

export default async function ExistingChatPage({ params }: Props) {
  const { id } = await params;
  const user = await requireUser();

  const chat = await getChat(id, user.id);
  if (!chat) notFound();

  const stored = await getMessages(id);
  const messages: UIMessage[] = stored.map((m) => ({
    id: m.id,
    role: m.role as UIMessage["role"],
    parts: m.parts,
    metadata: m.metadata,
  }));

  return (
    <ChatPage
      chatId={chat.id}
      initialMessages={messages}
      initialTitle={chat.title}
      initialShareId={chat.shareId}
      isNew={false}
      projectId={chat.projectId}
    />
  );
}
