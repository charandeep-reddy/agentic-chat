import {
  convertToModelMessages,
  createUIMessageStreamResponse,
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
import { ensureChat, getSettings, saveMessages, truncateFrom } from "@/lib/db/queries";
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

  const settings = await getSettings(user.id);
  const modelId = resolveModelId(body.model, settings?.defaultModel);

  const chat = await ensureChat(chatId, user.id, modelId);

  // Edit / regenerate: the client sends the truncation point, and the message
  // list it wants to continue from. Rewriting history before we persist keeps
  // the stored transcript identical to what the model actually saw.
  if (body.truncateFromId) {
    await truncateFrom(chatId, body.truncateFromId);
  }

  const memoryEnabled = settings?.memoryEnabled ?? true;
  const memoryStore = memoryEnabled ? createDbMemoryStore(user.id) : null;
  const memories = memoryEnabled ? await selectPromptMemories(user.id, lastUserText(messages)) : [];

  const system = buildSystemPrompt({
    userName: user.name,
    aboutUser: settings?.aboutUser,
    responseStyle: settings?.responseStyle,
    memories: memories.map((m) => ({ id: m.id, content: m.content, category: m.category })),
  });

  // Persist the incoming user message now, so a dropped connection mid-stream
  // still leaves the question in the transcript.
  const incoming = messages[messages.length - 1];
  if (incoming?.role === "user") {
    await saveMessages(chatId, [
      {
        id: incoming.id,
        role: "user",
        parts: incoming.parts,
        metadata: incoming.metadata,
      },
    ]);
    generateTitleInBackground({ chat, userId: user.id, apiKey, text: lastUserText(messages) });
  }

  const provider = createProvider(apiKey);

  const result = streamText({
    model: provider(modelId),
    system,
    messages: await convertToModelMessages(messages),
    tools: buildTools(memoryStore),
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
      onEnd: async ({ responseMessage }) => {
        if (!responseMessage) return;
        try {
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
  });
}
