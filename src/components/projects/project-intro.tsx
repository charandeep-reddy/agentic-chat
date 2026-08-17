"use client";

import Link from "next/link";
import { IconFolder, IconMessage, IconSliders } from "../icons";

export interface ProjectChat {
  id: string;
  title: string;
  updatedAt: string;
}

/**
 * The opening screen of a project.
 *
 * This is what makes `/projects/[id]` somewhere to work rather than a settings
 * form: the composer is already live below it, so landing here and typing
 * starts a chat *inside* the project. Previously the page offered a "New chat"
 * button that navigated away — you had to leave the project in order to use it.
 *
 * What it shows is the two things a person needs on arrival: what the project
 * tells the model, and what they were last doing in it. Editing lives one click
 * away, under Settings, because configuring is the rare action.
 */
export function ProjectIntro({
  name,
  description,
  instructions,
  chats,
  settingsHref,
}: {
  name: string;
  description: string | null;
  instructions: string | null;
  chats: ProjectChat[];
  settingsHref: string;
}) {
  return (
    <div className="py-6">
      <div className="mb-6 flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <IconFolder size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold tracking-tight text-text">{name}</h2>
          {description && (
            <p className="mt-1 text-dense leading-relaxed text-text-muted">{description}</p>
          )}
        </div>
        <Link
          href={settingsHref}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border-subtle px-2.5 py-1.5 text-dense text-text-muted transition-colors hover:border-border hover:text-text"
        >
          <IconSliders size={13} />
          Settings
        </Link>
      </div>

      {instructions ? (
        <div className="mb-6 rounded-xl border border-border-subtle bg-surface/40 p-4">
          <h3 className="mb-2 text-micro font-medium uppercase tracking-wider text-text-faint">
            Instructions in effect
          </h3>
          {/*
            Shown rather than summarised, but clamped: these are the rules the
            answers below will follow, and a user who cannot see them has no way
            to tell a project instruction from the model's own judgement. Long
            ones scroll inside the card instead of pushing the composer off the
            screen.
          */}
          <p className="scroll-thin max-h-32 overflow-y-auto whitespace-pre-wrap text-dense leading-relaxed text-text-secondary">
            {instructions}
          </p>
        </div>
      ) : (
        <div className="mb-6 rounded-xl border border-dashed border-border-subtle p-4">
          <p className="text-dense leading-relaxed text-text-faint">
            No instructions yet.{" "}
            <Link href={settingsHref} className="text-accent hover:underline">
              Add some
            </Link>{" "}
            and every chat in this project will follow them.
          </p>
        </div>
      )}

      {chats.length > 0 && (
        <div>
          <h3 className="mb-1.5 px-1 text-micro font-medium uppercase tracking-wider text-text-faint">
            In this project
          </h3>
          <div className="space-y-0.5">
            {chats.map((chat) => (
              <Link
                key={chat.id}
                href={`/c/${chat.id}`}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-dense text-text-muted transition-colors hover:bg-surface hover:text-text"
              >
                <IconMessage size={13} className="shrink-0 text-text-faint" />
                <span className="truncate">{chat.title}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <p className="mt-6 text-dense leading-relaxed text-text-faint">
        Type below to start a new chat in {name}.
      </p>
    </div>
  );
}
