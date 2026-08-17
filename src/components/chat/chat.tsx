"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { z } from "zod";
import { SettingsPanel } from "../settings/settings-panel";
import { useSidebarToggle } from "../app-shell";
import { useProviderSettings } from "../settings/use-provider-settings";
import { useChatsActions } from "./chats-provider";
import { Composer } from "./composer";
import { EmptyState } from "../empty-state";
import { MessageList } from "./message-list";
import { QuestionPrompt } from "./question-prompt";
import { pendingQuestionOf, questionAnswersOf } from "@/lib/question-state";
import { ShareButton } from "./share-button";
import { usageSchema } from "@/lib/usage";
import { ConversationCost } from "./conversation-cost";
import { ConfirmDialog } from "../confirm-dialog";
import { PrivateButton } from "./private-button";
import { ProjectCrumb } from "../projects/project-crumb";
import { requestLeave, setLeaveGuard } from "../sidebar/leave-guard";
import { startNewChat } from "../sidebar/new-chat";
import { IconChevron, IconKey, IconSidebar } from "../icons";
import type { AttachmentSummary } from "@/lib/document";
import { useDisabledTools } from "./use-disabled-tools";
import { describeError } from "@/lib/chat-errors";
import { TitleSync } from "./chat-title-sync";

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
  /**
   * The project this chat belongs to, or null.
   *
   * Sent with every turn but only *read* on the first one, before the chat has
   * a row — after that the stored column wins. See the route for why the two
   * directions differ.
   */
  projectId: string | null;
  /**
   * What to show in place of the default opening screen while the transcript is
   * empty.
   *
   * This is the seam that makes a project page a place to work rather than a
   * form: the project renders its own introduction — instructions, recent
   * chats — above a live composer, instead of sending the user somewhere else
   * to start typing.
   */
  emptyState?: ReactNode;
}

const metadataSchema = z.object({
  answerTo: z.string().optional(),
  // Whether the answer came from the option list. A typed reply settles the
  // question just as well, but it is prose and gets an ordinary bubble rather
  // than the compact pill an option label fits in.
  answerPicked: z.boolean().optional(),
  usage: usageSchema.optional(),
  model: z.string().optional(),
  // Set by a periodic save during streaming, cleared by the final one. A
  // message still carrying it on load means the server never finished this
  // turn — see `partial` in `message-list.tsx`.
  partial: z.boolean().optional(),
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

export function Chat({
  chatId,
  initialMessages,
  initialTitle,
  initialShareId,
  isNew,
  ephemeral,
  projectId,
  emptyState,
}: ChatProps) {
  const toggleSidebar = useSidebarToggle();
  const [disabledTools, setDisabledTools] = useDisabledTools(chatId);
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
  const { addChat, setChatTitle } = useChatsActions();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Dismissals are deliberately not persisted: closing a question is a "not
  // now", not an answer, and there is no message to write it on.
  const [dismissedQuestions, setDismissedQuestions] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState(initialTitle);

  /**
   * The generated title, delivered to both places that show it.
   *
   * One fetch, two consumers. The header and the sidebar used to learn this
   * separately — `TitleSync` polling the chat, and a full list reload racing it
   * — which was two requests for one fact, and they could disagree in between.
   */
  const onTitle = useCallback(
    (next: string) => {
      setTitle(next);
      setChatTitle(chatId, next);
    },
    [chatId, setChatTitle],
  );
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
        body: {
          id: chatId,
          model,
          ...(ephemeral ? { private: true } : {}),
          // Omitted rather than sent as null when there is no project, so a
          // private chat's body stays exactly as bare as it was.
          ...(projectId ? { projectId } : {}),
          ...(disabledTools.length ? { disabledTools } : {}),
        },
      }),
    [apiKey, provider, model, chatId, ephemeral, projectId, disabledTools],
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

  // Both derived from the transcript rather than held in state — see
  // `lib/question-state.ts` for why a reload used to re-arm answered questions.
  const questionAnswers = useMemo(() => questionAnswersOf(messages), [messages]);
  const pendingQuestion = useMemo(
    () => pendingQuestionOf(messages, questionAnswers, dismissedQuestions),
    [messages, questionAnswers, dismissedQuestions],
  );

  /**
   * A new chat only exists in the URL until the first message. Once the turn
   * starts, the row is written server-side, so we swap the URL and put the chat
   * in the sidebar — without a navigation, which would remount and drop the
   * stream.
   *
   * Added straight to the list rather than refetched. Every field is already
   * known here: the client minted the id and the row it is about to create is
   * this. The refetch it replaced cost a full `/api/chats` round trip *and*
   * left the sidebar without the chat for the 1.5s it waited. The generated
   * title arrives separately, through `TitleSync`.
   */
  const claimUrl = useCallback(() => {
    // A private chat has no row to claim and never reaches the sidebar.
    if (ephemeral || !isNew || startedRef.current) return;
    startedRef.current = true;
    window.history.replaceState(null, "", `/c/${chatId}`);
    addChat({
      id: chatId,
      title: initialTitle,
      pinned: false,
      shareId: null,
      projectId,
      updatedAt: new Date().toISOString(),
    });
  }, [ephemeral, isNew, chatId, initialTitle, projectId, addChat]);

  const dismissQuestion = useCallback(
    (toolCallId: string) => setDismissedQuestions((prev) => new Set(prev).add(toolCallId)),
    [],
  );

  const send = useCallback(
    (text: string, attachments?: { summaries: AttachmentSummary[]; typed: string }) => {
      const trimmed = text.trim();
      if (!trimmed || busy || !apiKey) return;
      claimUrl();
      // Typing instead of picking is a valid answer, so it is recorded as one.
      // Without the tag the reply settled the question on screen but not in
      // the transcript, and a reload put the card back.
      //
      // `attachments`/`displayText` carry a document summary for rendering —
      // the extracted text itself lives only in `trimmed`, sent to the model,
      // never duplicated into metadata.
      const metadata = {
        ...(pendingQuestion ? { answerTo: pendingQuestion.toolCallId, answerPicked: false } : {}),
        ...(attachments
          ? { attachments: attachments.summaries, displayText: attachments.typed }
          : {}),
      };
      void sendMessage({
        role: "user",
        parts: [{ type: "text", text: trimmed }],
        ...(Object.keys(metadata).length ? { metadata } : {}),
      });
    },
    [busy, pendingQuestion, apiKey, sendMessage, claimUrl],
  );

  const answerQuestion = useCallback(
    (text: string, toolCallId: string) => {
      claimUrl();
      void sendMessage({
        role: "user",
        parts: [{ type: "text", text }],
        // Read back out of the transcript to tell answered questions from live
        // ones, which is what makes the answer survive a reload.
        metadata: { answerTo: toolCallId, answerPicked: true },
      });
    },
    [sendMessage, claimUrl],
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
    // Rate-limited to one read per animation frame. `scroll` can fire far
    // faster than that, and each read forces a synchronous layout — doing
    // that unthrottled while the transcript is also mutating from incoming
    // tokens is its own source of jank, on top of the one below.
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
        setPinned(distance < 120);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    if (!pinned) return;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      // Instant while streaming, not smooth: `messages` gets a new reference
      // on every token, so this effect reruns every token too. A *smooth*
      // scroll queues an animation that owns the scroll position while it
      // runs — restarting one every token means an almost continuous
      // animation fighting any manual scroll attempt for the whole reply,
      // which is what reads as "scrolling up lags while it's generating".
      // Outside a stream there's one jump, not a chain, so smooth is fine.
      behavior: busy || messages.length <= 1 ? "auto" : "smooth",
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
        void requestLeave().then((ok) => {
          if (!ok) return;
          startNewChat();
          router.push("/");
        });
      } else if (meta && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        void requestLeave().then((ok) => {
          if (!ok) return;
          startNewChat();
          router.push("/private");
        });
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

        {/* Context, not a control — moving a chat lives in the sidebar row's
            menu with pin and rename. Withheld until the chat has a row, so the
            project's own landing page does not name itself twice. */}
        {!ephemeral && messages.length > 0 && (
          <ProjectCrumb chatId={chatId} projectId={projectId} />
        )}

        <h1 className="min-w-0 flex-1 truncate text-dense font-medium text-text-secondary">
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
          className="key-pill flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-dense transition-colors"
        >
          <IconKey size={12} />
          <span data-when="key">Connected</span>
          <span data-when="no-key">Add API key</span>
        </button>
      </header>

      <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          {messages.length === 0 ? (
            (emptyState ?? (
              <EmptyState
                hasKey={apiKey !== ""}
                busy={busy}
                ephemeral={ephemeral}
                onSend={send}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            ))
          ) : (
            <MessageList
              messages={messages}
              busy={busy}
              waiting={status === "submitted"}
              questionAnswers={questionAnswers}
              liveQuestion={pendingQuestion?.toolCallId ?? null}
              onEdit={editMessage}
              onRegenerate={regenerateMessage}
            />
          )}

          {failure && (
            <div
              role="alert"
              className="mt-6 flex items-center gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-ui text-danger"
            >
              <span className="min-w-0 flex-1">{failure.message}</span>
              {failure.showSettings && (
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="shrink-0 rounded-md border border-danger/40 px-2.5 py-1 text-dense hover:bg-danger/10"
                >
                  Settings
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/*
       * A shared anchor for the floating button below, rather than the
       * button measuring its offset from the screen bottom: `QuestionPrompt`
       * and `Composer`'s textarea (up to 200px) both change height, and a
       * fixed offset tuned for the common case would put the button over
       * whichever of them is taller than that. `bottom-full` anchors the
       * button to the top edge of *this* box instead, so it tracks whatever
       * that combined height actually is.
       */}
      <div className="relative">
        {/*
         * Faded and shrunk to nothing when pinned rather than unmounted — a
         * hard mount/unmount has no transition to animate, so scrolling up
         * used to pop the button in abruptly instead of it arriving.
         *
         * Shape changes with `busy`: mid-answer, a bare chevron cannot tell
         * you whether scrolling down returns to a finished reply or one still
         * being written, so it becomes a pill with a live indicator instead.
         */}
        {messages.length > 0 && (
          <button
            type="button"
            aria-label={
              busy ? "Reply is still being written — scroll to follow it" : "Scroll to the newest message"
            }
            onClick={() =>
              scrollRef.current?.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: "smooth",
              })
            }
            className={`absolute bottom-full left-1/2 z-10 mb-3 flex -translate-x-1/2 items-center justify-center gap-1.5 rounded-full border border-border-strong bg-surface-raised text-text shadow-xl backdrop-blur-sm transition-all duration-150 hover:border-accent/50 hover:text-accent active:scale-95 ${
              pinned ? "pointer-events-none scale-90 opacity-0" : "scale-100 opacity-100"
            } ${
              busy
                ? "px-2.5 py-1.5 sm:px-3.5 sm:py-2"
                : "h-9 w-9 sm:h-10 sm:w-10"
            }`}
          >
            {busy ? (
              <>
                <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />
                <span className="text-micro font-medium">Generating…</span>
              </>
            ) : (
              // Two icons, one shown via `hidden`/`sm:block`, rather than one
              // sized by breakpoint: `IconChevron`'s `size` prop sets pixel
              // width/height directly, which Tailwind's responsive prefixes
              // can't reach — there's no `sm:size` for a component prop.
              <>
                <IconChevron size={16} className="sm:hidden" />
                <IconChevron size={18} className="hidden sm:block" />
              </>
            )}
          </button>
        )}

        {pendingQuestion && !busy && (
          <QuestionPrompt
            key={pendingQuestion.toolCallId}
            payload={pendingQuestion.payload}
            onAnswer={(text) => answerQuestion(text, pendingQuestion.toolCallId)}
            onDismiss={() => dismissQuestion(pendingQuestion.toolCallId)}
          />
        )}

        <Composer
          ref={composerRef}
          chatId={chatId}
          ephemeral={ephemeral}
          hasKey={apiKey !== ""}
          busy={busy}
          questionPending={pendingQuestion !== null}
          model={model}
          onSend={send}
          onStop={stop}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </div>

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
        disabledTools={disabledTools}
        onDisabledToolsChange={setDisabledTools}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Title is server-generated; this keeps the header honest after a
          refresh. A private chat is never titled, so there is nothing to poll
          for — and polling would mean a request naming a chat that does not
          exist. */}
      {!ephemeral && (
        <TitleSync
          chatId={chatId}
          current={title}
          onChange={onTitle}
          active={messages.length > 0}
        />
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
