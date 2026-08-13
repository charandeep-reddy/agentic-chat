"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { z } from "zod";
import { SettingsPanel } from "./settings-panel";
import { useSidebarToggle } from "./app-shell";
import { useProviderSettings } from "./use-provider-settings";
import { useChatsActions } from "./chats-provider";
import { Composer } from "./composer";
import { EmptyState } from "./empty-state";
import { MessageList } from "./message-list";
import { ShareButton } from "./share-button";
import { usageSchema } from "@/lib/usage";
import { ConversationCost } from "./conversation-cost";
import { ConfirmDialog } from "./confirm-dialog";
import { PrivateButton } from "./private-button";
import { requestLeave, setLeaveGuard } from "./leave-guard";
import { IconChevron, IconKey, IconSidebar } from "./icons";

export interface ChatProps {
  chatId: string;
  initialMessages: UIMessage[];
  initialTitle: string;
  initialShareId: string | null;
  /** True for a chat that has not been written to the database yet. */
  isNew: boolean;
  /**
   * A private chat. Nothing is persisted — not the transcript, not the title,
   * not a draft — and the server is told to withhold memories, settings and
   * skills. Closing the tab loses it, which is what it is for.
   */
  ephemeral: boolean;
}

const metadataSchema = z.object({
  answerTo: z.string().optional(),
  usage: usageSchema.optional(),
  model: z.string().optional(),
});

/**
 * Messages a private chat must hold before leaving it asks for confirmation.
 *
 * Two is one exchange: a question and the answer to it. The threshold was
 * higher when leaving meant deliberately navigating elsewhere, but the mode
 * toggle now sits in the header a few pixels from the rest of the controls,
 * and a single stray click there discards work that exists nowhere else. Still
 * not zero — an empty or half-typed chat should not argue with you.
 */
const LEAVE_GUARD_AFTER = 2;

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
  ephemeral,
}: ChatProps) {
  const toggleSidebar = useSidebarToggle();
  const {
    provider,
    apiKey,
    model,
    providersWithKey,
    setProvider,
    setApiKey,
    setModel,
    clearKey,
    clearAllKeys,
  } = useProviderSettings();

  // Keeps the pre-paint attribute honest after the key is added or cleared, so
  // the CSS above and the React state below never disagree.
  useEffect(() => {
    document.documentElement.toggleAttribute("data-has-key", apiKey !== "");
  }, [apiKey]);

  const router = useRouter();
  const { refresh } = useChatsActions();
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
        // The provider travels with the key it belongs to. The route refuses a
        // request whose provider it does not recognise rather than picking one.
        headers: apiKey ? { "x-model-key": apiKey, "x-model-provider": provider } : {},
        // `private` rides on every turn rather than being stored, because a
        // private chat has no row to store it on. The server treats it as
        // narrowing-only, so a request that loses it is no worse than a
        // normal one.
        body: { id: chatId, model, ...(ephemeral ? { private: true } : {}) },
      }),
    [apiKey, provider, model, chatId, ephemeral],
  );

  const { messages, sendMessage, setMessages, regenerate, status, error, stop } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
    messageMetadataSchema: metadataSchema,
  });

  const busy = status === "submitted" || status === "streaming";

  // Parsed once per error rather than once per read — it was being called twice
  // in the same render, JSON.parse included.
  const failure = useMemo(() => (error ? describeError(error) : null), [error]);

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
    // A private chat has no row to claim and never reaches the sidebar.
    if (ephemeral || !isNew || startedRef.current) return;
    startedRef.current = true;
    window.history.replaceState(null, "", `/c/${chatId}`);
    // The title is generated server-side after the first message lands.
    setTimeout(() => void refresh(), 1500);
  }, [ephemeral, isNew, chatId, refresh]);

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

  /**
   * The live transcript, for callbacks that need to read it without depending
   * on it.
   *
   * `messages` is a new array on every streamed token. Any callback listing it
   * as a dependency is therefore rebuilt token by token, and every memoized
   * message that receives the callback re-renders with it — which is exactly
   * what made a long conversation get slower as the answer grew.
   */
  const messagesRef = useRef(messages);
  const busyRef = useRef(busy);
  useEffect(() => {
    messagesRef.current = messages;
    busyRef.current = busy;
  }, [messages, busy]);

  /** Rewrites a user message and re-runs everything downstream of it. */
  const editMessage = useCallback(
    (messageId: string, text: string) => {
      const current = messagesRef.current;
      const index = current.findIndex((m) => m.id === messageId);
      if (index === -1 || busyRef.current) return;
      setMessages(current.slice(0, index));
      // A private chat has no stored history to rewrite; dropping the messages
      // here is the whole of it.
      void sendMessage(
        { role: "user", parts: [{ type: "text", text }] },
        ephemeral ? undefined : { body: { truncateFromId: messageId } },
      );
    },
    [setMessages, sendMessage, ephemeral],
  );

  const regenerateMessage = useCallback(
    (messageId: string) => {
      if (busyRef.current) return;
      void regenerate(ephemeral ? { messageId } : { messageId, body: { truncateFromId: messageId } });
    },
    [regenerate, ephemeral],
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

  /**
   * A private transcript exists only in this tab, so anything that leaves the
   * page destroys it. Three exits have to be covered and they are all
   * different: reload and tab close (`beforeunload`), a link click anywhere in
   * the shell (the capture listener below), and a programmatic `router.push`
   * from the palette or a shortcut (`requestLeave`).
   */
  const guardActive = ephemeral && messages.length >= LEAVE_GUARD_AFTER;
  const [leaveDecision, setLeaveDecision] = useState<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    if (!guardActive) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [guardActive]);

  // Publishes the veto to the sidebar, the palette and this component's own
  // shortcuts. Storing the resolver is what turns a promise into a dialog:
  // whoever wanted to navigate waits until a button is pressed.
  useEffect(() => {
    if (!guardActive) return;
    setLeaveGuard(() => new Promise<boolean>((resolve) => setLeaveDecision(() => resolve)));
    return () => setLeaveGuard(null);
  }, [guardActive]);

  /**
   * Catches link clicks before React Router sees them, which is what makes
   * this work without every `<Link>` in the app knowing about private chats.
   *
   * Modifier-clicks are left alone deliberately: ⌘-click opens a new tab and
   * this one survives, so there is nothing to confirm.
   */
  useEffect(() => {
    if (!guardActive) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      // Internal navigations only. An external link opens elsewhere, and a
      // fragment stays on the page.
      if (!href?.startsWith("/")) return;
      const target = anchor.getAttribute("target");
      if (target && target !== "_self") return;
      e.preventDefault();
      e.stopPropagation();
      void requestLeave().then((ok) => {
        if (ok) router.push(href);
      });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [guardActive, router]);

  // Keyboard shortcuts, matching what the big three settled on.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void requestLeave().then((ok) => ok && router.push("/"));
      } else if (meta && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        void requestLeave().then((ok) => ok && router.push("/private"));
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
          onClick={toggleSidebar}
          aria-label="Toggle sidebar"
          title="Toggle sidebar (⌘B)"
          className="rounded-md p-1.5 text-text-faint hover:bg-surface hover:text-text"
        >
          <IconSidebar size={16} />
        </button>

        <h1 className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-secondary">
          {title}
        </h1>

        <ConversationCost messages={messages} />

        <PrivateButton active={ephemeral} />

        {!ephemeral && messages.length > 0 && (
          <ShareButton
            chatId={chatId}
            title={title}
            messages={messages}
            initialShareId={initialShareId}
          />
        )}

        {/* Both labels are rendered and CSS drops one, so the first painted
            frame is already right. Driving this from `apiKey` alone meant a
            visible "Add API key" in warning colours on every refresh, for
            everyone — the value is not readable until after hydration. */}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="key-pill flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors"
        >
          <IconKey size={12} />
          <span data-when="key">Connected</span>
          <span data-when="no-key">Add API key</span>
        </button>
      </header>

      <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          {messages.length === 0 ? (
            <EmptyState
              hasKey={apiKey !== ""}
              busy={busy}
              ephemeral={ephemeral}
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

          {failure && (
            <div
              role="alert"
              className="mt-6 flex items-center gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
            >
              <span className="min-w-0 flex-1">{failure.message}</span>
              {failure.showSettings && (
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
        ephemeral={ephemeral}
        hasKey={apiKey !== ""}
        busy={busy}
        blocked={pendingQuestion !== null}
        model={model}
        onSend={send}
        onStop={stop}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <SettingsPanel
        provider={provider}
        apiKey={apiKey}
        model={model}
        providersWithKey={providersWithKey}
        onProviderChange={setProvider}
        onKeyChange={setApiKey}
        onModelChange={setModel}
        onClearKey={clearKey}
        onClearAllKeys={clearAllKeys}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Title is server-generated; this keeps the header honest after a
          refresh. A private chat is never titled, so there is nothing to poll
          for — and polling would mean a request naming a chat that does not
          exist. */}
      {!ephemeral && (
        <TitleSync chatId={chatId} current={title} onChange={setTitle} active={messages.length > 0} />
      )}

      {/* Spoken on arrival rather than left to be discovered. The composer's
          own label is the visual channel; this is the same fact for a screen
          reader, before anything has been typed. */}
      {ephemeral && (
        <p role="status" className="sr-only">
          Private chat. This conversation is not saved, and no memories are read or written.
        </p>
      )}

      {leaveDecision && (
        <ConfirmDialog
          title="Leave this private chat?"
          description="It was never saved. Leaving discards the conversation, and it cannot be recovered."
          confirmLabel="Leave and discard"
          onConfirm={() => {
            leaveDecision(true);
            setLeaveDecision(null);
          }}
          onCancel={() => {
            leaveDecision(false);
            setLeaveDecision(null);
          }}
        />
      )}
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
