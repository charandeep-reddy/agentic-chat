"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signUp } from "@/lib/auth-client";
import {
  authErrorMessage,
  MIN_PASSWORD_LENGTH,
  validateEmail,
  validateName,
  validatePassword,
} from "@/lib/credentials";
import { IconEye, IconEyeOff, IconLoader } from "../icons";

type Mode = "signin" | "signup";

export function EmailAuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Always starts hidden: revealing is a deliberate act, since the point is to
  // proofread a password that can't be reset if it's typed wrong.
  const [revealed, setRevealed] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setRevealed(false);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;

    const problem =
      (mode === "signup" ? validateName(name) : null) ??
      validateEmail(email) ??
      validatePassword(password);
    if (problem) {
      setError(problem);
      return;
    }

    setPending(true);
    setError(null);

    const credentials = { email: email.trim(), password };
    const { error: err } =
      mode === "signup"
        ? await signUp.email({ ...credentials, name: name.trim() })
        : await signIn.email(credentials);

    if (err) {
      setError(authErrorMessage(err));
      setPending(false);
      return;
    }

    // `autoSignIn` means a successful sign-up already has a session. Refresh so
    // the server components re-read it, then land on the chat.
    router.replace("/");
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex rounded-xl border border-border bg-surface p-1">
        {(["signin", "signup"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => switchMode(value)}
            aria-pressed={mode === value}
            className={`flex-1 rounded-lg px-3 py-1.5 text-dense font-medium transition-colors ${
              mode === value
                ? "bg-surface-raised text-text"
                : "text-text-muted hover:text-text"
            }`}
          >
            {value === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      {mode === "signup" && (
        <Field
          label="Name"
          type="text"
          value={name}
          onChange={setName}
          autoComplete="name"
          placeholder="Ada Lovelace"
        />
      )}

      <Field
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        placeholder="you@example.com"
      />

      <Field
        label="Password"
        type={revealed ? "text" : "password"}
        value={password}
        onChange={setPassword}
        autoComplete={mode === "signup" ? "new-password" : "current-password"}
        placeholder={mode === "signup" ? `At least ${MIN_PASSWORD_LENGTH} characters` : "••••••••"}
        trailing={
          <button
            type="button"
            onClick={() => setRevealed((current) => !current)}
            aria-pressed={revealed}
            aria-label={revealed ? "Hide password" : "Show password"}
            title={revealed ? "Hide password" : "Show password"}
            className="text-text-faint transition-colors hover:text-text"
          >
            {revealed ? <IconEyeOff size={16} /> : <IconEye size={16} />}
          </button>
        }
      />

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-ui font-medium text-accent-text transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending && <IconLoader size={16} />}
        {mode === "signup" ? "Create account" : "Sign in"}
      </button>

      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-dense text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
  placeholder,
  trailing,
}: {
  label: string;
  type: "text" | "email" | "password";
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder: string;
  /** Control rendered inside the input's right edge. */
  trailing?: React.ReactNode;
}) {
  // The trailing control is a button, so the field can't be wrapped in a
  // <label> — a click on it would be forwarded to the input instead.
  const id = useId();

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-micro font-medium uppercase tracking-wide text-text-faint"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className={`w-full rounded-xl border border-border bg-surface py-2.5 pl-3.5 text-ui text-text placeholder:text-text-faint focus:border-border-strong focus:outline-none ${
            trailing ? "pr-11" : "pr-3.5"
          }`}
        />
        {trailing && (
          <span className="absolute inset-y-0 right-0 flex items-center pr-3.5">{trailing}</span>
        )}
      </div>
    </div>
  );
}
