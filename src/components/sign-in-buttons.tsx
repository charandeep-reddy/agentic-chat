"use client";

import { useState } from "react";
import { signIn } from "@/lib/auth-client";
import { IconGithub, IconGoogle, IconLoader } from "./icons";

type Provider = "google" | "github";

const LABELS: Record<Provider, string> = {
  google: "Continue with Google",
  github: "Continue with GitHub",
};

export function SignInButtons({ providers }: { providers: Provider[] }) {
  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async (provider: Provider) => {
    setPending(provider);
    setError(null);
    const { error: err } = await signIn.social({ provider, callbackURL: "/" });
    if (err) {
      setError(err.message ?? "Sign-in failed. Please try again.");
      setPending(null);
    }
    // On success the browser navigates to the provider, so no reset is needed.
  };

  return (
    <div className="space-y-2.5">
      {providers.map((provider) => (
        <button
          key={provider}
          type="button"
          disabled={pending !== null}
          onClick={() => void start(provider)}
          className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-text transition-colors hover:border-border-strong hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending === provider ? (
            <IconLoader size={16} />
          ) : provider === "google" ? (
            <IconGoogle size={16} />
          ) : (
            <IconGithub size={16} />
          )}
          {LABELS[provider]}
        </button>
      ))}

      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
