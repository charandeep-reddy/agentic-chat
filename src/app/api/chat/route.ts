import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  generateId,
  hasToolCall,
  isStepCount,
  NoSuchToolError,
  streamText,
  toUIMessageStream,
} from "ai";
import type { UIMessage } from "ai";
import { buildTools, MEMORY_TOOL_NAMES } from "@/lib/tools";
import { ToolError } from "@/lib/tools/errors";
import { buildSystemPrompt } from "@/lib/prompts";
import { createProvider, DEFAULT_MODEL, resolveModelId } from "@/lib/provider";
import { requireUserApi } from "@/lib/session";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  createDbMemoryStore,
  listCandidateMemories,
  selectPromptMemories,
} from "@/lib/memory-store";
import { isMemoryScope } from "@/lib/memory-scope";
import { createDbSkillStore, selectPromptSkills } from "@/lib/skill-store";
import { createChat, getChat, getSettings, saveMessages, truncateFrom } from "@/lib/db/queries";
import { generateTitleInBackground } from "@/lib/title";
import { toMessageUsage } from "@/lib/usage";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export { DEFAULT_MODEL };

interface ChatRequestBody {
  id?: string;
  messages?: UIMessage[];
  model?: unknown;
  /** Only read when this request creates the chat; ignored afterwards. */
  memoryScope?: string;
  /** Present on edit/regenerate: drop this message and everything after it. */
  truncateFromId?: string;
}

/**
 * Drops past memory tool calls from the history handed to the model.
 *
 * Turning memory off mid-conversation leaves earlier turns holding
 * `tool-save_memory` parts, and those travel back into the prompt on every
 * request after — the model reads its own past call, learns the tool by name,
 * and tries again. The stored transcript is untouched: this only shapes what
 * one request sees, and the UI still renders the history as it happened.
 */
const MEMORY_PART_TYPES = new Set(MEMORY_TOOL_NAMES.map((name) => `tool-${name}`));

export function withoutMemoryCalls(messages: UIMessage[]): UIMessage[] {
  return messages
    .map((m) => ({ ...m, parts: m.parts.filter((p) => !MEMORY_PART_TYPES.has(p.type)) }))
    // A message whose only content was a memory call has nothing left to send,
    // and an empty parts array is not a message the provider will accept.
    .filter((m) => m.parts.length > 0);
}

function lastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== "user") continue;
    return messages[i].parts
      .map((p) => (p.type === "text" ? p.text : ""))
      .join(" ")
      .trim();
  }
  return "";
}

export async function POST(req: Request) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;
  const { user } = authed;

  const apiKey = req.headers.get("x-model-key") ?? req.headers.get("x-openrouter-key");
  if (!apiKey || apiKey.trim() === "") {
    return Response.json(
      { error: "missing_api_key", message: "Add your model API key in Settings first." },
      { status: 400 },
    );
  }

  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const messages = body.messages ?? [];
  if (messages.length === 0) {
    return Response.json({ error: "no_messages" }, { status: 400 });
  }

  const chatId = typeof body.id === "string" && body.id ? body.id : null;
  if (!chatId) {
    return Response.json({ error: "missing_chat_id" }, { status: 400 });
  }

  // These four don't depend on each other, and the database is remote enough
  // that doing them in sequence was the bulk of the delay before the first
  // token. Memories are fetched even when the setting turns out to be off —
  // it's on by default, so speculating costs far less than waiting.
  const [settings, existingChat, candidateMemories, skills] = await Promise.all([
    getSettings(user.id),
    getChat(chatId, user.id),
    listCandidateMemories(user.id),
    selectPromptSkills(user.id),
  ]);

  const modelId = resolveModelId(body.model, settings?.defaultModel);
  const chat =
    existingChat ??
    (await createChat(user.id, {
      id: chatId,
      model: modelId,
      // Only on creation: an existing chat's scope lives in its row, and
      // letting the request body override it would make a stale client tab
      // silently reopen a chat the user had closed.
      memoryScope: isMemoryScope(body.memoryScope) ? body.memoryScope : undefined,
    }));

  // Edit / regenerate: the client sends the truncation point, and the message
  // list it wants to continue from. Rewriting history before we persist keeps
  // the stored transcript identical to what the model actually saw.
  if (body.truncateFromId) {
    await truncateFrom(chatId, body.truncateFromId);
  }

  // Two gates, in order: the account-level toggle, then this conversation's
  // own scope. The chat can narrow what the model sees; it cannot widen it.
  //
  // "none" cuts both ways: no memories go into the prompt, and `memoryStore`
  // stays null so the save/forget/search tools are never registered for this
  // request. "No memories" is only half a promise if the model can still write
  // what is said here back out.
  const memoryEnabled = settings?.memoryEnabled ?? true;
  const chatScope = {
    scope: isMemoryScope(chat.memoryScope) ? chat.memoryScope : ("all" as const),
    ids: chat.memoryIds ?? [],
  };
  const memoryAllowed = memoryEnabled && chatScope.scope !== "none";
  const memoryStore = memoryAllowed ? createDbMemoryStore(user.id) : null;
  const memories = memoryAllowed
    ? selectPromptMemories(candidateMemories, lastUserText(messages), chatScope)
    : [];

  const system = buildSystemPrompt({
    userName: user.name,
    aboutUser: settings?.aboutUser,
    responseStyle: settings?.responseStyle,
    memories: memories.map((m) => ({ id: m.id, content: m.content, category: m.category })),
    skills,
    // Matches the registry below: a prompt that still describes memory tools
    // the model has not been given makes it call names that do not exist.
    memoryTools: memoryAllowed,
  });

  // Persist the incoming user message so a dropped connection mid-stream still
  // leaves the question in the transcript. It starts now but is not awaited
  // here — the model call doesn't depend on it, and blocking on the write just
  // delayed the first token. `onEnd` awaits it before saving the answer, which
  // is what keeps the two in ordinal order.
  const incoming = messages[messages.length - 1];
  let userSaved: Promise<void> = Promise.resolve();
  if (incoming?.role === "user") {
    userSaved = saveMessages(chatId, [
      {
        id: incoming.id,
        role: "user",
        parts: incoming.parts,
        metadata: incoming.metadata,
      },
    ]);
    // Nothing awaits this until the stream ends, so keep a rejection from
    // surfacing as an unhandled one in the meantime.
    userSaved.catch(() => {});
    generateTitleInBackground({ chat, userId: user.id, apiKey, text: lastUserText(messages) });
  }

  // Claimed here rather than at the top of the handler so a request that never
  // reaches the model does not spend the user's budget, and so the gap between
  // claiming a slot and handing back the stream that releases it is as small as
  // possible.
  const limit = rateLimit("chat", user.id);
  if (!limit.ok) return rateLimitResponse(limit);

  const provider = createProvider(apiKey);

  const tools = buildTools({
    memory: memoryStore,
    // No skills means no skill tools: the model cannot usefully call them, and
    // leaving them in the registry only invites hallucinated skill names.
    skills: skills.length > 0 ? createDbSkillStore(user.id) : null,
  });

  const result = streamText({
    model: provider(modelId),
    system,
    // `tools` has to be passed here too, or `toModelOutput` is skipped for
    // history and every artifact the model ever rendered is replayed into the
    // prompt in full on every subsequent turn.
    messages: await convertToModelMessages(memoryAllowed ? messages : withoutMemoryCalls(messages), {
      tools,
    }),
    tools,
    temperature: 0.5,
    // Loading a skill costs a step before any real work starts, and a skill
    // that says "fetch this, then chart it" spends several more following its
    // own instructions. Eight left those turns ending mid-task.
    stopWhen: [isStepCount(12), hasToolCall("ask_user_question")],
    onError: (error) => {
      console.error("[api/chat] stream error:", error);
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      // The SDK masks every error as "An error occurred." so server details
      // never reach the browser. That is the right default, but it also hides
      // the messages `ToolError` exists to show — they are written for the
      // user and carry no internals. Anything else stays generic, and the real
      // one goes to the server log.
      onError: (error) => {
        console.error("[api/chat] tool/stream error:", error);
        if (NoSuchToolError.isInstance(error)) {
          return `The model called a tool that is not available in this chat (${error.toolName}).`;
        }
        if (error instanceof ToolError) return error.message;
        return "Something went wrong running that step.";
      },
      // Without this the SDK leaves the response message id as "", so every
      // answer upserts onto the same empty-id row instead of being stored.
      // It also travels to the client in the `start` chunk, which keeps the
      // id the browser renders identical to the one on disk.
      generateMessageId: generateId,
      // BYOK means the user pays the provider directly, so the token count is
      // their bill. `finish` carries the usage for the whole turn, tool steps
      // included. It rides along as message metadata, which `saveMessages`
      // already persists — so the number survives a reload with no new column.
      messageMetadata: ({ part }) => {
        if (part.type !== "finish") return undefined;
        const usage = toMessageUsage(part.totalUsage);
        // The model travels with the usage: pricing is per model, and an old
        // turn must be costed with the model that actually wrote it, not
        // whatever is selected now.
        // What the model was actually told about the user. `selectPromptMemories`
        // picks silently, so without this there is no way to tell whether an
        // answer leaned on a memory — or which one.
        const injected = memories.map((m) => ({ id: m.id, content: m.content }));
        // Recorded per turn, not per chat: the toggle can be flipped mid
        // conversation, and the transcript is the only honest record of which
        // answers ran with memory and which did not. Written only when off, so
        // the common case adds nothing to every stored message.
        const off = memoryAllowed ? {} : { memoryOff: true as const };
        return usage
          ? { usage, model: modelId, memories: injected, ...off }
          : { memories: injected, ...off };
      },
      onEnd: async ({ responseMessage }) => {
        if (!responseMessage) return;
        try {
          await userSaved;
          await saveMessages(chatId, [
            {
              id: responseMessage.id,
              role: responseMessage.role,
              parts: responseMessage.parts,
              metadata: responseMessage.metadata,
              model: modelId,
            },
          ]);
        } catch (error) {
          console.error("[api/chat] failed to persist assistant message:", error);
        }
      },
    }),
    // Switching chats unmounts the client hook, which aborts its fetch and
    // cancels its half of the response. `consumeSseStream` hands us a tee'd
    // copy: draining it keeps the source alive, so the model finishes its turn
    // and `onEnd` still writes the answer to the database. Without it the
    // cancel propagates and the reply is lost mid-sentence.
    consumeSseStream: ({ stream }) => {
      // This copy is drained to completion whatever the client does, which
      // makes it the one place guaranteed to observe the end of the turn — so
      // it is also where the concurrency slot is given back.
      void consumeStream({
        stream,
        onError: (error) => console.error("[api/chat] background stream error:", error),
      }).finally(limit.release);
    },
  });
}
