"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { z } from "zod";
import { SettingsPanel, KEY_STORAGE, MODEL_STORAGE } from "./settings-panel";
import { getStorage, setStorage, removeStorage, subscribeStorage } from "@/lib/local-storage";
import { useChats } from "./chats-provider";
import { Composer } from "./composer";
import { EmptyState } from "./empty-state";
import { MessageList } from "./message-list";
import { ShareButton } from "./share-button";
import { DEFAULT_MODEL } from "@/lib/models";
import { IconChevron, IconKey, IconSidebar } from "./icons";

export interface ChatProps {
  chatId: string;
  initialMessages: UIMessage[];
  initialTitle: string;
  initialShareId: string | null;
  /** True for a chat that has not been written to the database yet. */
  isNew: boolean;
  onToggleSidebar: () => void;
}

const metadataSchema = z.object({ answerTo: z.string().optional() });

/** Codes the route returns without a sentence of its own. */
const ERROR_TEXT: Record<string, string> = {
  unauthorized: "Your session expired. Sign in again.",
  bad_request: "The app sent a malformed request.",
  no_messages: "There was nothing to send.",
  missing_chat_id: "This chat has no id — reload the page.",
  too_many_requests: "Too many requests. Give it a moment.",
  too_many_streams: "Another response is still generating.",
};

/**
 * A failed response reaches us as an Error whose message is the raw body, which
 * for this API is JSON — so the banner was showing `{"error":"…"}` verbatim.
 * Prefer the sentence the route wrote, and only offer the Settings shortcut for
 * the failures Settings can actually fix.
 */
function describeError(error: Error): { message: string; showSettings: boolean } {
  let parsed: { error?: string; message?: string };
  try {
    parsed = JSON.parse(error.message) as typeof parsed;
  } catch {
    return { message: error.message, showSettings: true };
  }

  const code = parsed.error ?? "";
  return {
    message: parsed.message ?? ERROR_TEXT[code] ?? error.message,
    showSettings: code === "missing_api_key" || code === "provider",
  };
}

export function Chat({
  chatId,
  initialMessages,
  initialTitle,
  initialShareId,
  isNew,
  onToggleSidebar,
}: ChatProps) {
  const apiKey = useSyncExternalStore(
    (cb) => subscribeStorage(KEY_STORAGE, cb),
    () => getStorage(KEY_STORAGE),
    () => "",
  );
  const storedModel = useSyncExternalStore(
    (cb) => subscribeStorage(MODEL_STORAGE, cb),
    () => getStorage(MODEL_STORAGE),
    () => "",
  );
  const model = storedModel || DEFAULT_MODEL;

  const router = useRouter();
  const { refresh } = useChats();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState(initialTitle);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const startedRef = useRef(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: apiKey ? { "x-model-key": apiKey } : {},
        body: { id: chatId, model },
      }),
    [apiKey, model, chatId],
  );

  const { messages, sendMessage, setMessages, regenerate, status, error, stop } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
    messageMetadataSchema: metadataSchema,
  });

  const busy = status === "submitted" || status === "streaming";

  const pendingQuestion = useMemo(() => {
    for (const message of messages) {
      for (const part of message.parts) {
        if (part.type !== "tool-ask_user_question") continue;
        if (!("state" in part) || part.state !== "output-available") continue;
        if (answeredQuestions.has(part.toolCallId)) continue;
        return part.toolCallId;
      }
    }
    return null;
  }, [messages, answeredQuestions]);

  /**
   * A new chat only exists in the URL until the first message. Once the turn
   * starts, the row is written server-side, so we swap the URL and refresh the
   * sidebar — without a navigation, which would remount and drop the stream.
   */
  const claimUrl = useCallback(() => {
    if (!isNew || startedRef.current) return;
    startedRef.current = true;
    window.history.replaceState(null, "", `/c/${chatId}`);
    // The title is generated server-side after the first message lands.
    setTimeout(() => void refresh(), 1500);
  }, [isNew, chatId, refresh]);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy || pendingQuestion || !apiKey) return;
      claimUrl();
      void sendMessage({ role: "user", parts: [{ type: "text", text: trimmed }] });
    },
    [busy, pendingQuestion, apiKey, sendMessage, claimUrl],
  );

  const answerQuestion = useCallback(
    (option: string, toolCallId: string) => {
      setAnsweredQuestions((prev) => new Set(prev).add(toolCallId));
      void sendMessage({
        role: "user",
        parts: [{ type: "text", text: option }],
        metadata: { answerTo: toolCallId },
      });
    },
    [sendMessage],
  );

  /** Rewrites a user message and re-runs everything downstream of it. */
  const editMessage = useCallback(
    (messageId: string, text: string) => {
      const index = messages.findIndex((m) => m.id === messageId);
      if (index === -1 || busy) return;
      setMessages(messages.slice(0, index));
      void sendMessage(
        { role: "user", parts: [{ type: "text", text }] },
        { body: { truncateFromId: messageId } },
      );
    },
    [messages, busy, setMessages, sendMessage],
  );

  const regenerateMessage = useCallback(
    (messageId: string) => {
      if (busy) return;
      void regenerate({ messageId, body: { truncateFromId: messageId } });
    },
    [busy, regenerate],
  );

  // Keep the viewport pinned to the newest content unless the user scrolled up
  // to read something older.
  const [pinned, setPinned] = useState(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      setPinned(distance < 120);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!pinned) return;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: messages.length > 1 ? "smooth" : "auto",
    });
  }, [messages, busy, pinned]);

  // Keyboard shortcuts, matching what the big three settled on.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        router.push("/");
      } else if (meta && e.key === "/") {
        e.preventDefault();
        composerRef.current?.focus();
      } else if (e.key === "Escape" && busy) {
        stop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, busy, stop]);

  return (
    <div className="relative flex h-dvh min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
          title="Toggle sidebar (⌘B)"
          className="rounded-md p-1.5 text-text-faint hover:bg-surface hover:text-text"
        >
          <IconSidebar size={16} />
        </button>

        <h1 className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-secondary">
          {title}
        </h1>

        {messages.length > 0 && (
          <ShareButton
            chatId={chatId}
            title={title}
            messages={messages}
            initialShareId={initialShareId}
          />
        )}

        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
            apiKey
              ? "border-accent/40 text-accent hover:bg-accent-soft"
              : "border-warn/40 text-warn hover:bg-warn-soft"
          }`}
        >
          <IconKey size={12} />
          {apiKey ? "Connected" : "Add API key"}
        </button>
      </header>

      <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          {messages.length === 0 ? (
            <EmptyState
              hasKey={apiKey !== ""}
              busy={busy}
              onSend={send}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          ) : (
            <MessageList
              messages={messages}
              busy={busy}
              waiting={status === "submitted"}
              answeredQuestions={answeredQuestions}
              onAnswerQuestion={answerQuestion}
              onEdit={editMessage}
              onRegenerate={regenerateMessage}
            />
          )}

          {error && (
            <div
              role="alert"
              className="mt-6 flex items-center gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
            >
              <span className="min-w-0 flex-1">{describeError(error).message}</span>
              {describeError(error).showSettings && (
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="shrink-0 rounded-md border border-danger/40 px-2.5 py-1 text-xs hover:bg-danger/10"
                >
                  Settings
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {!pinned && messages.length > 0 && (
        <button
          type="button"
          aria-label="Scroll to the newest message"
          onClick={() =>
            scrollRef.current?.scrollTo({
              top: scrollRef.current.scrollHeight,
              behavior: "smooth",
            })
          }
          className="absolute bottom-28 left-1/2 z-10 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-surface-raised text-text-muted shadow-lg transition-colors hover:text-text"
        >
          <IconChevron size={15} />
        </button>
      )}

      <Composer
        ref={composerRef}
        chatId={chatId}
        hasKey={apiKey !== ""}
        busy={busy}
        blocked={pendingQuestion !== null}
        model={model}
        onSend={send}
        onStop={stop}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <SettingsPanel
        apiKey={apiKey}
        model={model}
        onKeyChange={(key) => (key ? setStorage(KEY_STORAGE, key) : removeStorage(KEY_STORAGE))}
        onModelChange={(m) => setStorage(MODEL_STORAGE, m)}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Title is server-generated; this keeps the header honest after a refresh. */}
      <TitleSync chatId={chatId} current={title} onChange={setTitle} active={messages.length > 0} />
    </div>
  );
}

/**
 * Polls once shortly after the first exchange to pick up the generated title.
 * Cheaper and simpler than streaming it down the message channel, and the
 * window where it matters is a couple of seconds long.
 */
function TitleSync({
  chatId,
  current,
  onChange,
  active,
}: {
  chatId: string;
  current: string;
  onChange: (title: string) => void;
  active: boolean;
}) {
  useEffect(() => {
    if (!active || current !== "New chat") return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/chats/${chatId}`);
        if (!res.ok) return;
        const data = (await res.json()) as { chat: { title: string } };
        if (!cancelled && data.chat.title !== "New chat") onChange(data.chat.title);
      } catch {
        // A missed title is cosmetic; the sidebar picks it up on next load.
      }
    }, 2500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [chatId, current, onChange, active]);

  return null;
}
