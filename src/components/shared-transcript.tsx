"use client";

import type { UIMessage } from "ai";
import { MessageList } from "./message-list";

const NO_ANSWERS = new Set<string>();
const noop = () => {};

/**
 * The public view of a shared chat. It reuses the live transcript renderer so
 * charts, diagrams and HTML artifacts look identical, but in read-only mode:
 * nothing here can mutate a conversation the viewer does not own.
 */
export function SharedTranscript({ messages }: { messages: UIMessage[] }) {
  return (
    <MessageList
      messages={messages}
      busy={false}
      readOnly
      answeredQuestions={NO_ANSWERS}
      onAnswerQuestion={noop}
      onEdit={noop}
      onRegenerate={noop}
    />
  );
}
