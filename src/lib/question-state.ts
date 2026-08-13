/**
 * Which questions in a transcript have been answered, and which is still live.
 *
 * Both are derived from the messages rather than remembered in component
 * state. That is the whole point: component state is emptied by a reload, and
 * an answered question that comes back armed can be answered a second time —
 * which sent a duplicate request to the model.
 *
 * `answerTo` is written on the user message that answers a question and is
 * persisted alongside it, so the transcript is the one record that survives.
 */

interface TranscriptPart {
  type: string;
  state?: string;
  toolCallId?: string;
  output?: unknown;
  text?: string;
}

interface TranscriptMessage {
  parts: TranscriptPart[];
  metadata?: unknown;
}

const QUESTION_PART = "tool-ask_user_question";

/** Answer text by the tool call it answers. */
export function questionAnswersOf(messages: readonly TranscriptMessage[]): Map<string, string> {
  const answers = new Map<string, string>();
  for (const message of messages) {
    const answerTo = (message.metadata as { answerTo?: string } | undefined)?.answerTo;
    if (!answerTo) continue;
    const text = message.parts
      .map((part) => (part.type === "text" ? (part.text ?? "") : ""))
      .join("")
      .trim();
    answers.set(answerTo, text);
  }
  return answers;
}

/**
 * The question still waiting on the user, or null.
 *
 * The *last* one: if the model asked again after a question went ignored, the
 * later ask is the one being waited on.
 */
export function pendingQuestionOf(
  messages: readonly TranscriptMessage[],
  answered: ReadonlyMap<string, string>,
  dismissed: ReadonlySet<string>,
): { toolCallId: string; payload: unknown } | null {
  let live: { toolCallId: string; payload: unknown } | null = null;
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== QUESTION_PART) continue;
      if (part.state !== "output-available" || part.toolCallId === undefined) continue;
      if (answered.has(part.toolCallId) || dismissed.has(part.toolCallId)) continue;
      live = { toolCallId: part.toolCallId, payload: part.output };
    }
  }
  return live;
}
