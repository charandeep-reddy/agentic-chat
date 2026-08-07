"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { ConfirmDialog } from "./confirm-dialog";
import { PageShell, Section } from "./page-shell";
import { ThemeToggle } from "./theme-toggle";
import { IconDownload, IconGithub, IconGoogle, IconKey, IconTrash, IconUser } from "./icons";

interface Settings {
  aboutUser: string;
  responseStyle: string;
  memoryEnabled: boolean;
}

const ABOUT_PLACEHOLDER =
  "I'm a backend engineer working mostly in TypeScript and Go. I care about Postgres, and I ship to Vercel.";
const STYLE_PLACEHOLDER =
  "Be direct. Lead with the answer, then the reasoning. Use code over prose when a snippet says it better. Skip the pleasantries.";

const MAX_LENGTH = 3000;

/** `credential` is Better Auth's provider id for an email/password account. */
const PROVIDER_LABELS: Record<string, string> = {
  credential: "Email and password",
  google: "Google",
  github: "GitHub",
};

function ProviderIcon({ id }: { id: string }) {
  if (id === "google") return <IconGoogle size={16} />;
  if (id === "github") return <IconGithub size={16} />;
  return <IconKey size={16} />;
}

export function ProfilePage({
  user,
  providers,
  stats,
  settings: initialSettings,
}: {
  user: { name: string; email: string; image: string | null; createdAt: string };
  providers: Array<{ id: string; connectedAt: string }>;
  stats: { chats: number; messages: number; memories: number };
  settings: Settings;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [saved, setSaved] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [danger, setDanger] = useState<"chats" | "account" | null>(null);
  const [running, setRunning] = useState(false);

  const dirty =
    settings.aboutUser !== saved.aboutUser ||
    settings.responseStyle !== saved.responseStyle ||
    settings.memoryEnabled !== saved.memoryEnabled;

  const save = async (patch: Partial<Settings> = {}) => {
    const next = { ...settings, ...patch };
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error(String(res.status));
      setSaved(next);
      setSettings(next);
    } catch (error) {
      console.error("[profile] failed to save settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const runDangerous = async () => {
    if (!danger || running) return;
    setRunning(true);
    try {
      await fetch(`/api/account?scope=${danger}`, { method: "DELETE" });
      if (danger === "account") {
        await signOut();
        router.push("/sign-in");
      } else {
        router.refresh();
      }
    } catch (error) {
      console.error("[profile] destructive action failed:", error);
    } finally {
      setDanger(null);
      setRunning(false);
    }
  };

  return (
    <PageShell
      user={{ name: user.name, email: user.email, image: user.image }}
      title="Profile & settings"
      description="How you sign in, what the model knows about you, and what happens to your data."
      tabs={[
        { href: "/profile", label: "Profile", active: true },
        { href: "/memory", label: "Memory", active: false },
        { href: "/skills", label: "Skills", active: false },
      ]}
    >
      <Section title="Account">
        <div className="flex items-center gap-4">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- avatar host varies by OAuth provider
            <img src={user.image} alt="" className="h-14 w-14 rounded-full" />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent">
              <IconUser size={22} />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium text-text">{user.name}</p>
            <p className="truncate text-[13px] text-text-muted">{user.email}</p>
            <p className="mt-0.5 text-[11px] text-text-faint">
              Joined {new Date(user.createdAt).toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-3 gap-3">
          {[
            { label: "Chats", value: stats.chats },
            { label: "Messages", value: stats.messages },
            { label: "Memories", value: stats.memories },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5"
            >
              <dt className="text-[11px] uppercase tracking-wider text-text-faint">{stat.label}</dt>
              <dd className="mt-0.5 font-mono text-lg text-text">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section
        title="Sign-in methods"
        description="Accounts linked to this profile. Signing in with a provider that shares this email links it automatically."
      >
        <ul className="space-y-2">
          {providers.map((provider) => (
            <li
              key={provider.id}
              className="flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5"
            >
              <ProviderIcon id={provider.id} />
              <span className="flex-1 text-[13px] text-text-secondary">
                {PROVIDER_LABELS[provider.id] ?? provider.id}
              </span>
              <span className="text-[11px] text-text-faint">
                since {new Date(provider.connectedAt).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Appearance"
        description="System follows your operating system and changes with it."
      >
        <div className="max-w-xs">
          <ThemeToggle />
        </div>
      </Section>

      <Section
        title="Custom instructions"
        description="Injected into every conversation. Keep it short — a few sentences beats a manifesto."
        action={
          <span className="shrink-0 text-[11px] text-text-faint">
            {saving ? "Saving…" : dirty ? "Unsaved" : "Saved"}
          </span>
        }
      >
        <div className="space-y-5">
          <div>
            <label
              htmlFor="about-user"
              className="mb-1.5 block text-[12px] font-medium text-text-secondary"
            >
              What should the model know about you?
            </label>
            <textarea
              id="about-user"
              rows={4}
              maxLength={MAX_LENGTH}
              value={settings.aboutUser}
              placeholder={ABOUT_PLACEHOLDER}
              onChange={(e) => setSettings({ ...settings, aboutUser: e.target.value })}
              className="scroll-thin w-full resize-y rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 text-[13px] leading-relaxed text-text placeholder:text-text-faint focus:border-border-strong focus:outline-none"
            />
            <p className="mt-1 text-right text-[11px] text-text-faint">
              {settings.aboutUser.length}/{MAX_LENGTH}
            </p>
          </div>

          <div>
            <label
              htmlFor="response-style"
              className="mb-1.5 block text-[12px] font-medium text-text-secondary"
            >
              How should the model respond?
            </label>
            <textarea
              id="response-style"
              rows={4}
              maxLength={MAX_LENGTH}
              value={settings.responseStyle}
              placeholder={STYLE_PLACEHOLDER}
              onChange={(e) => setSettings({ ...settings, responseStyle: e.target.value })}
              className="scroll-thin w-full resize-y rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5 text-[13px] leading-relaxed text-text placeholder:text-text-faint focus:border-border-strong focus:outline-none"
            />
            <p className="mt-1 text-right text-[11px] text-text-faint">
              {settings.responseStyle.length}/{MAX_LENGTH}
            </p>
          </div>

          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => void save()}
            className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-accent-text hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save instructions
          </button>
        </div>
      </Section>

      <Section
        title="Memory"
        description="When on, the model can save durable facts about you and recall them in later chats."
      >
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={settings.memoryEnabled}
            onChange={(e) => void save({ memoryEnabled: e.target.checked })}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          <span className="text-[13px] text-text-secondary">
            Let the model remember things across conversations
          </span>
        </label>
        <p className="mt-2 text-[11px] leading-relaxed text-text-faint">
          Turning this off hides the memory tools from the model and stops injecting saved memories.
          Nothing is deleted — manage or clear them on the{" "}
          <a href="/memory" className="text-accent underline-offset-2 hover:underline">
            memory page
          </a>
          .
        </p>
      </Section>

      <Section
        title="Your data"
        description="Everything is stored in your own Postgres. Your model API key never leaves your browser."
      >
        <a
          href="/api/account/export"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3.5 py-2 text-[13px] text-text-secondary transition-colors hover:border-border-strong hover:text-text"
        >
          <IconDownload size={14} />
          Export everything as JSON
        </a>
      </Section>

      <section className="rounded-xl border border-danger/25 bg-danger-soft/50 p-5">
        <h3 className="text-[14px] font-medium text-danger">Danger zone</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-text-faint">
          Both actions are immediate and cannot be undone. Export first if you might want the data.
        </p>

        <div className="mt-4 space-y-2">
          {(
            [
              {
                scope: "chats" as const,
                label: "Delete all chats",
                hint: "Keeps your account, memories and settings.",
              },
              {
                scope: "account" as const,
                label: "Delete my account",
                hint: "Removes everything, including your sign-in.",
              },
            ]
          ).map((action) => (
            <div
              key={action.scope}
              className="flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-text-secondary">{action.label}</p>
                <p className="text-[11px] text-text-faint">{action.hint}</p>
              </div>
              <button
                type="button"
                onClick={() => setDanger(action.scope)}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-danger/40 px-3 py-1.5 text-[12px] text-danger hover:bg-danger/10"
              >
                <IconTrash size={12} />
                Delete
              </button>
            </div>
          ))}
        </div>
      </section>

      {danger && (
        <ConfirmDialog
          title={danger === "chats" ? "Delete all chats?" : "Delete your account?"}
          description={
            danger === "chats"
              ? "Every conversation and message will be permanently removed. Memories and settings stay."
              : "Your account, chats, memories, packs and settings will be permanently removed."
          }
          confirmLabel="Delete permanently"
          confirmPhrase="delete"
          pending={running}
          onCancel={() => setDanger(null)}
          onConfirm={() => void runDangerous()}
        />
      )}
    </PageShell>
  );
}
