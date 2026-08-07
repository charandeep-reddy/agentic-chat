import { streamText, convertToModelMessages, createUIMessageStreamResponse, toUIMessageStream, isStepCount, hasToolCall } from "ai";
import type { UIMessage } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { tools } from "@/lib/tools";
import { SYSTEM_PROMPT } from "@/lib/prompts";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export const DEFAULT_MODEL = "deepseek-v4-flash";

const OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go/v1";

export async function POST(req: Request) {
  const apiKey = req.headers.get("x-openrouter-key");
  if (!apiKey || apiKey.trim() === "") {
    return Response.json({ error: "missing_api_key", message: "Add your OpenCode API key in Settings first." }, { status: 400 });
  }

  let body: { messages?: UIMessage[]; model?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const messages = body.messages ?? [];
  const modelId = typeof body.model === "string" && body.model.trim() !== "" ? body.model : DEFAULT_MODEL;

  const provider = createOpenAICompatible({
    name: "opencode-go",
    baseURL: OPENCODE_GO_BASE_URL,
    apiKey,
  });

  const result = streamText({
    model: provider(modelId),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools,
    temperature: 0.5,
    stopWhen: [isStepCount(6), hasToolCall("ask_user_question")],
    onError: (error) => {
      console.error("[api/chat] stream error:", error);
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
