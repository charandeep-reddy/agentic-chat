export interface SkillMentionToken {
  /** Index of the "/" itself. */
  start: number;
  /** Cursor position — end of the token, where replacement text is spliced in. */
  end: number;
  /** Text typed after "/", used to filter the menu. */
  query: string;
}

/**
 * Finds the "/skill-name" token the cursor is currently inside of, if any.
 *
 * A token starts a "/" at the beginning of the text or right after
 * whitespace (so an email or a path fragment doesn't trigger it), and runs
 * to the cursor with no whitespace in between (so it closes itself the
 * moment a space is typed, the same way it closes on `Escape`).
 */
export function findSkillMentionToken(value: string, cursor: number): SkillMentionToken | null {
  const upToCursor = value.slice(0, cursor);
  const slashIndex = upToCursor.lastIndexOf("/");
  if (slashIndex === -1) return null;

  const before = upToCursor[slashIndex - 1];
  if (before !== undefined && !/\s/.test(before)) return null;

  const query = upToCursor.slice(slashIndex + 1);
  if (/\s/.test(query)) return null;

  return { start: slashIndex, end: cursor, query };
}

/** Case-insensitive substring match on name, ranked by where the match starts. */
export function filterSkillMentions<T extends { name: string }>(skills: T[], query: string): T[] {
  if (!query) return skills;
  const q = query.toLowerCase();
  return skills
    .map((skill) => ({ skill, at: skill.name.toLowerCase().indexOf(q) }))
    .filter((s) => s.at !== -1)
    .sort((a, b) => a.at - b.at || a.skill.name.localeCompare(b.skill.name))
    .map((s) => s.skill);
}

/** What a resolved "/name" token is expanded to when the message is sent. */
export function skillMentionDirective(name: string): string {
  return `Use the ${name} skill.`;
}

/**
 * Closes a "/query" token into a finished "/name " tag, returning the new
 * text and cursor position. Deliberately stays a compact tag rather than
 * expanding to the directive sentence here — a composer full of "Use the X
 * skill." prose is illegible to keep typing through. Expansion happens once,
 * in `expandSkillMentions`, right before the message leaves the composer.
 */
export function applySkillMention(
  value: string,
  token: SkillMentionToken,
  name: string,
): { value: string; cursor: number } {
  const tag = `/${name} `;
  const next = value.slice(0, token.start) + tag + value.slice(token.end);
  return { value: next, cursor: token.start + tag.length };
}

/**
 * Expands every "/name" tag in `value` that names a real skill into its
 * directive sentence, leaving anything else beginning with "/" untouched —
 * a path, a URL, "and/or", an unrecognised name typed and abandoned. Matches
 * the same "starts at a word boundary" rule as `findSkillMentionToken`, but
 * scans the whole string rather than just the token at the cursor, since by
 * send time the cursor may have moved on.
 */
export function expandSkillMentions(value: string, skillNames: ReadonlySet<string> | readonly string[]): string {
  const names = skillNames instanceof Set ? skillNames : new Set(skillNames);
  return value.replace(
    /(^|\s)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\s|$)/g,
    (match: string, boundary: string, name: string) =>
      names.has(name) ? `${boundary}${skillMentionDirective(name)}` : match,
  );
}
