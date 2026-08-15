import Link from "next/link";
import { notFound } from "next/navigation";
import type { UIMessage } from "ai";
import { getMessages, getSharedChat } from "@/lib/db/queries";
import { SharedTranscript } from "@/components/shared-transcript";
import { IconLogo } from "@/components/icons";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ shareId: string }> };

export async function generateMetadata({ params }: Props) {
  const { shareId } = await params;
  const chat = await getSharedChat(shareId);
  return {
    title: chat ? `${chat.title} · Agentic Chat` : "Shared chat · Agentic Chat",
    // A share link is meant for people the author sent it to, not for search.
    robots: { index: false, follow: false },
  };
}

export default async function SharedChatPage({ params }: Props) {
  const { shareId } = await params;

  const chat = await getSharedChat(shareId);
  if (!chat) notFound();

  const stored = await getMessages(chat.id);
  const messages: UIMessage[] = stored.map((m) => ({
    id: m.id,
    role: m.role as UIMessage["role"],
    parts: m.parts,
    metadata: m.metadata,
  }));

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-3 border-b border-border-subtle bg-bg/90 px-4 backdrop-blur">
        <Link href="/" className="flex items-center gap-2 text-ui font-semibold text-text">
          <IconLogo size={15} className="text-accent" />
          Agentic Chat
        </Link>
        <span className="min-w-0 flex-1 truncate text-dense text-text-muted">{chat.title}</span>
        <Link
          href="/"
          className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-dense font-medium text-accent-text hover:brightness-110"
        >
          Try it
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="mb-6 rounded-xl border border-border-subtle bg-surface/40 px-4 py-3">
          <p className="text-dense text-text-secondary">
            <span className="font-medium text-text">{chat.ownerName}</span> shared this conversation
            {chat.sharedAt && (
              <span className="text-text-faint">
                {" "}
                on {new Date(chat.sharedAt).toLocaleDateString()}
              </span>
            )}
            .
          </p>
          <p className="mt-1 text-micro text-text-faint">
            Read-only. Nothing you do here is sent back to the author.
          </p>
        </div>

        <SharedTranscript messages={messages} />
      </main>
    </div>
  );
}
