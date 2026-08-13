/**
 * Starting points for "How should the model respond?".
 *
 * A preset writes its text into the same field the user types in, rather than
 * living beside it as a separate setting. ChatGPT keeps the two apart — a
 * "Base style and tone" dropdown stacked on top of the custom-instructions box
 * — which gives the model two sources of truth to reconcile whenever they
 * disagree, invisibly and not always the same way. Claude's styles are the
 * instruction itself, which is the shape copied here.
 *
 * Writing into the field also means a preset is editable, readable, and
 * inspectable: the user can see exactly what was added and change one clause of
 * it. Nothing about the prompt or the schema has to know these exist.
 *
 * Kept short on purpose. This text goes into the system prompt on every request
 * and now sits inside the cached prefix, so a long preset is paid for in every
 * conversation it is used in.
 */
export interface StylePreset {
  id: string;
  label: string;
  /** One line describing the effect, for the button's title. */
  hint: string;
  /** What lands in the textarea. Empty for the default, which clears it. */
  text: string;
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "default",
    label: "Default",
    hint: "No style instructions — clears the field",
    text: "",
  },
  {
    id: "concise",
    label: "Concise",
    hint: "Short answers, no preamble",
    text: "Lead with the answer. Keep it short — a sentence or two where that is enough. Skip preamble, and skip summaries of what you just said.",
  },
  {
    id: "explanatory",
    label: "Explanatory",
    hint: "Teaches the reasoning, not just the result",
    text: "Explain the reasoning, not only the conclusion. Define a term the first time it appears, and say why an approach beats the alternatives rather than just asserting it.",
  },
  {
    id: "formal",
    label: "Formal",
    hint: "Polished enough to forward to someone",
    text: "Write in a polished, professional register — the kind of thing I could forward to a colleague or a client unedited. No slang and no filler.",
  },
  {
    id: "direct",
    label: "Direct",
    hint: "Blunt, disagrees when it disagrees",
    text: "Be blunt. Say when something is a bad idea, and why. No hedging, no flattery, no opening with what a good question it was. Disagree with me when you disagree with me.",
  },
  {
    id: "visual",
    label: "Show, don't tell",
    hint: "Reaches for a widget before a paragraph",
    text: "Prefer showing over describing: a chart for numbers, a diagram for a process, a table for a comparison, a working widget for anything interactive. Keep the prose around it short.",
  },
];

/**
 * Which preset the current text came from, if any.
 *
 * Whitespace-insensitive, because the textarea round-trips through a database
 * column and a trim on save — an exact comparison would quietly stop matching
 * the moment a trailing newline survived.
 */
export function matchPreset(text: string): StylePreset | null {
  const normalized = text.trim();
  return STYLE_PRESETS.find((p) => p.id !== "default" && p.text === normalized) ?? null;
}

/**
 * True when replacing `text` would destroy something the user wrote.
 *
 * Empty is safe, and so is text that is exactly a preset — the user has not
 * written anything in either case, so swapping needs no confirmation. Anything
 * else is theirs.
 */
export function isCustom(text: string): boolean {
  return text.trim() !== "" && matchPreset(text) === null;
}
