import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  generateId,
  hasToolCall,
  isStepCount,
  streamText,
  toUIMessageStream,
} from "ai";
import type { UIMessage } from "ai";
import { buildTools } from "@/lib/tools";
import { buildSystemPrompt } from "@/lib/prompts";
import { createProvider, DEFAULT_MODEL, resolveModelId } from "@/lib/provider";
import { requireUserApi } from "@/lib/session";
import { createDbMemoryStore, selectPromptMemories } from "@/lib/memory-store";
import { createChat, getChat, getSettings, saveMessages, truncateFrom } from "@/lib/db/queries";
import { generateTitleInBackground } from "@/lib/title";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export { DEFAULT_MODEL };

interface ChatRequestBody {
  id?: string;
  messages?: UIMessage[];
  model?: unknown;
  /** Present on edit/regenerate: drop this message and everything after it. */
  truncateFromId?: string;
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

  // These three don't depend on each other, and the database is remote enough
  // that doing them in sequence was the bulk of the delay before the first
  // token. Memories are fetched even when the setting turns out to be off —
  // it's on by default, so speculating costs far less than waiting.
  const [settings, existingChat, candidateMemories] = await Promise.all([
    getSettings(user.id),
    getChat(chatId, user.id),
    selectPromptMemories(user.id, lastUserText(messages)),
  ]);

  const modelId = resolveModelId(body.model, settings?.defaultModel);
  const chat = existingChat ?? (await createChat(user.id, { id: chatId, model: modelId }));

  // Edit / regenerate: the client sends the truncation point, and the message
  // list it wants to continue from. Rewriting history before we persist keeps
  // the stored transcript identical to what the model actually saw.
  if (body.truncateFromId) {
    await truncateFrom(chatId, body.truncateFromId);
  }

  const memoryEnabled = settings?.memoryEnabled ?? true;
  const memoryStore = memoryEnabled ? createDbMemoryStore(user.id) : null;
  const memories = memoryEnabled ? candidateMemories : [];

  const system = buildSystemPrompt({
    userName: user.name,
    aboutUser: settings?.aboutUser,
    responseStyle: settings?.responseStyle,
    memories: memories.map((m) => ({ id: m.id, content: m.content, category: m.category })),
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

  const provider = createProvider(apiKey);

  const tools = buildTools(memoryStore);

  const result = streamText({
    model: provider(modelId),
    system,
    // `tools` has to be passed here too, or `toModelOutput` is skipped for
    // history and every artifact the model ever rendered is replayed into the
    // prompt in full on every subsequent turn.
    messages: await convertToModelMessages(messages, { tools }),
    tools,
    temperature: 0.5,
    stopWhen: [isStepCount(8), hasToolCall("ask_user_question")],
    onError: (error) => {
      console.error("[api/chat] stream error:", error);
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      // Without this the SDK leaves the response message id as "", so every
      // answer upserts onto the same empty-id row instead of being stored.
      // It also travels to the client in the `start` chunk, which keeps the
      // id the browser renders identical to the one on disk.
      generateMessageId: generateId,
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
      void consumeStream({
        stream,
        onError: (error) => console.error("[api/chat] background stream error:", error),
      });
    },
  });
}
