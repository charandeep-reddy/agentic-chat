"use client";

import type { UIMessage } from "ai";
import { MessageList } from "./message-list";

const NO_ANSWERS = new Map<string, string>();
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
      questionAnswers={NO_ANSWERS}
      liveQuestion={null}
      onEdit={noop}
      onRegenerate={noop}
    />
  );
}
