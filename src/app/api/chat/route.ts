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
import { buildTools } from "@/lib/tools";
import { ToolError } from "@/lib/tools/errors";
import { buildSystemPrompt } from "@/lib/prompts";
import { DEFAULT_MODEL, languageModel, resolveModelId } from "@/lib/provider";
import { isProviderId } from "@/lib/providers";
import { requireUserApi } from "@/lib/session";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { createDbMemoryStore, selectPromptMemories } from "@/lib/memory-store";
import { createDbSkillStore, selectPromptSkills } from "@/lib/skill-store";
import {
  createChat,
  getChat,
  getProject,
  getSettings,
  saveMessages,
  truncateFrom,
} from "@/lib/db/queries";
import { generateTitleInBackground } from "@/lib/title";
import { toMessageUsage } from "@/lib/usage";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export { DEFAULT_MODEL };

interface ChatRequestBody {
  id?: string;
  messages?: UIMessage[];
  model?: unknown;
  /**
   * An ephemeral conversation: nothing is written and nothing personal is read.
   * See `isPrivate` below for what it turns off and why trusting the client
   * with it is sound.
   */
  private?: boolean;
  /**
   * Which project a brand-new chat should be filed under. Ignored once the chat
   * has a row — the stored value wins, so a stale client cannot move a
   * conversation by resending an old id.
   */
  projectId?: unknown;
  /** Present on edit/regenerate: drop this message and everything after it. */
  truncateFromId?: string;
}

function userTextAt(messages: UIMessage[], from: "first" | "last"): string {
  const order = from === "last" ? [...messages].reverse() : messages;
  for (const message of order) {
    if (message.role !== "user") continue;
    return message.parts
      .map((p) => (p.type === "text" ? p.text : ""))
      .join(" ")
      .trim();
  }
  return "";
}

const lastUserText = (messages: UIMessage[]) => userTextAt(messages, "last");

/**
 * The opening message of the conversation, used to choose which memories go
 * into the system prompt.
 *
 * Deliberately not the latest one: the system prompt is the cached prefix of
 * every request, and rebuilding it per turn invalidates the whole transcript
 * behind it. See `selectPromptMemories`.
 */
const firstUserText = (messages: UIMessage[]) => userTextAt(messages, "first");

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

  // Which provider the key belongs to, and therefore who gets billed. Rejected
  // rather than defaulted for that reason: sending an unrecognised value to
  // whichever provider we happened to pick would leak the key to a company the
  // user never chose.
  const provider = req.headers.get("x-model-provider");
  if (!isProviderId(provider)) {
    return Response.json(
      { error: "bad_provider", message: "Unknown model provider — reload the page." },
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

  /**
   * A private chat is ephemeral in both directions.
   *
   * Nothing is written — no chat row, no messages, no generated title — and
   * nothing personal is read in: no memories, no about/style, no name, no skill
   * index. The memory tools are left out of the registry entirely, which is the
   * only way the promise holds: a prompt asking the model not to remember is a
   * request, while an absent tool is a fact.
   *
   * The flag comes from the request body on every turn, because there is no row
   * to hold it. That needs no trust: it can only ever remove capability, never
   * add it. A client that omits it gets exactly today's behaviour, and one that
   * sets it gets strictly less.
   */
  const isPrivate = body.private === true;

  // These three don't depend on each other, and the database is remote enough
  // that doing them in sequence was the bulk of the delay before the first
  // token. A private chat reads none of them, which is also why it reaches the
  // model soonest.
  const [settings, existingChat, skills] = isPrivate
    ? [null, null, []]
    : await Promise.all([getSettings(user.id), getChat(chatId, user.id), selectPromptSkills(user.id)]);

  /**
   * Which project this conversation belongs to.
   *
   * A stored chat's own column wins; the body is consulted only for a chat that
   * has no row yet, since there is nowhere else for the first turn to learn it
   * from. That asymmetry is what stops a stale or hostile client from moving an
   * existing conversation between projects by resending its id.
   *
   * The value is not validated here, and does not need to be. `getProject`
   * filters by owner, so a foreign id yields no instructions; `createChat`
   * re-checks before it writes, so it files the chat as ungrouped; and the
   * memory query below is already restricted to this user's own rows, none of
   * which can carry another user's project id.
   */
  const projectId = existingChat
    ? existingChat.projectId
    : typeof body.projectId === "string" && body.projectId
      ? body.projectId
      : null;

  // A second round trip rather than a fourth branch of the one above: both of
  // these need the project id, and it is not known until the chat row is. They
  // still run together, so the cost is one hop and not two. Memories are
  // fetched even when the setting turns out to be off — it's on by default, so
  // speculating costs far less than waiting.
  const [projectRow, candidateMemories] = isPrivate
    ? [null, []]
    : await Promise.all([
        projectId ? getProject(projectId, user.id) : Promise.resolve(null),
        selectPromptMemories(user.id, firstUserText(messages), projectId),
      ]);

  const modelId = resolveModelId(body.model, settings?.defaultModel, provider);
  const chat = isPrivate
    ? null
    : (existingChat ?? (await createChat(user.id, { id: chatId, model: modelId, projectId })));

  // Edit / regenerate: the client sends the truncation point, and the message
  // list it wants to continue from. Rewriting history before we persist keeps
  // the stored transcript identical to what the model actually saw.
  //
  // Skipped when private: this deletes rows, an ephemeral chat has none, and an
  // id that collided with a real chat's must not be able to destroy it. The
  // client truncates its own copy either way.
  if (body.truncateFromId && !isPrivate) {
    await truncateFrom(chatId, body.truncateFromId);
  }

  const memoryEnabled = !isPrivate && (settings?.memoryEnabled ?? true);
  // Scoped to the project the store was built for, which is what keeps
  // `save_memory` writing into the project and `search_memory` from reaching
  // outside it. `projectRow` rather than `projectId`: the former has been
  // through the owner check, so an id the user does not own writes account-wide
  // instead of into a stranger's project.
  const memoryStore = memoryEnabled ? createDbMemoryStore(user.id, projectRow?.id ?? null) : null;
  const memories = memoryEnabled ? candidateMemories : [];

  const system = isPrivate
    ? // Deliberately bare. Everything the app knows about the user is omitted,
      // not merely unmentioned.
      buildSystemPrompt({ memoryTools: false })
    : buildSystemPrompt({
        userName: user.name,
        aboutUser: settings?.aboutUser,
        responseStyle: settings?.responseStyle,
        project: projectRow && { name: projectRow.name, instructions: projectRow.instructions },
        memories: memories.map((m) => ({ id: m.id, content: m.content, category: m.category })),
        skills,
        memoryTools: memoryEnabled,
      });

  // Persist the incoming user message so a dropped connection mid-stream still
  // leaves the question in the transcript. It starts now but is not awaited
  // here — the model call doesn't depend on it, and blocking on the write just
  // delayed the first token. `onEnd` awaits it before saving the answer, which
  // is what keeps the two in ordinal order.
  const incoming = messages[messages.length - 1];
  let userSaved: Promise<void> = Promise.resolve();
  if (incoming?.role === "user" && chat) {
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
    generateTitleInBackground({
      chat,
      userId: user.id,
      provider,
      apiKey,
      modelId,
      text: lastUserText(messages),
    });
  }

  // Claimed here rather than at the top of the handler so a request that never
  // reaches the model does not spend the user's budget, and so the gap between
  // claiming a slot and handing back the stream that releases it is as small as
  // possible.
  const limit = rateLimit("chat", user.id);
  if (!limit.ok) return rateLimitResponse(limit);

  const tools = buildTools({
    memory: memoryStore,
    // No skills means no skill tools: the model cannot usefully call them, and
    // leaving them in the registry only invites hallucinated skill names. A
    // private chat is never given the index, so it is never given the tools.
    skills: !isPrivate && skills.length > 0 ? createDbSkillStore(user.id) : null,
  });

  const result = streamText({
    model: languageModel(provider, apiKey, modelId),
    system,
    // `tools` has to be passed here too, or `toModelOutput` is skipped for
    // history and every artifact the model ever rendered is replayed into the
    // prompt in full on every subsequent turn.
    messages: await convertToModelMessages(messages, { tools }),
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
      // the messages `ToolError` exists to show — they are written for the user
      // and carry no internals. It matters most for a private chat: if the
      // model reaches for a tool that chat was not given, that must be visible
      // rather than swallowed. Anything else stays generic and is logged.
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
        return usage ? { usage, model: modelId } : undefined;
      },
      onEnd: async ({ responseMessage }) => {
        // A private chat has nowhere to write. The turn still runs to
        // completion above, which is what releases the concurrency slot.
        if (!responseMessage || isPrivate) return;
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
