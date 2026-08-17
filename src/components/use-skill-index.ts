"use client";

import { useEffect, useState } from "react";

export interface SkillMention {
  name: string;
  description: string;
}

/**
 * Module-level cache: the composer remounts on every chat switch (see the
 * comment in chat.tsx), but the skill library doesn't change that often —
 * fetching it fresh on every switch would mean a network round-trip before
 * "/" ever becomes usable. One in-flight request is shared by every mounted
 * composer; a later `refreshSkillIndex` (from the skills page, once it
 * exists) can invalidate it.
 */
let cache: Promise<SkillMention[]> | null = null;

/**
 * Never rejects: a network error reads the same as "no skills" to the caller.
 * On failure the module cache is reset rather than left holding the empty
 * result, so the next composer mount retries instead of leaving "/" silently
 * empty for the rest of the session.
 */
async function fetchSkills(): Promise<SkillMention[]> {
  try {
    const res = await fetch("/api/skills");
    if (!res.ok) throw new Error(`skills fetch failed: ${res.status}`);
    const data = (await res.json()) as {
      skills?: Array<{ name: string; description: string; enabled: boolean }>;
    };
    return (data.skills ?? [])
      .filter((s) => s.enabled)
      .map((s) => ({ name: s.name, description: s.description }));
  } catch {
    cache = null;
    return [];
  }
}

/** Enabled skills only — same set the model's system prompt is built from. */
export function useSkillIndex(): SkillMention[] {
  const [skills, setSkills] = useState<SkillMention[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!cache) cache = fetchSkills();
    void cache.then((result) => {
      if (!cancelled) setSkills(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return skills;
}
