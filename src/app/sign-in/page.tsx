import { redirect } from "next/navigation";
import { enabledProviders } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { SignInButtons } from "@/components/sign-in-buttons";
import { EmailAuthForm } from "@/components/email-auth-form";
import { IconSpark } from "@/components/icons";

export const metadata = { title: "Sign in · Agentic Chat" };

export default async function SignInPage() {
  const session = await getSession();
  if (session) redirect("/");

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <IconSpark size={22} />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-text">Agentic Chat</h1>
          <p className="mt-2 text-sm text-text-muted">
            Sign in to keep your conversations, memories, and settings across devices.
          </p>
        </div>

        {enabledProviders.length > 0 && (
          <>
            <SignInButtons providers={enabledProviders} />
            <div className="my-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-border-subtle" />
              <span className="text-[11px] uppercase tracking-wide text-text-faint">or</span>
              <span className="h-px flex-1 bg-border-subtle" />
            </div>
          </>
        )}

        <EmailAuthForm />

        {enabledProviders.length === 0 && (
          <p className="mt-4 text-[11px] leading-relaxed text-text-faint">
            Social sign-in is off because no OAuth credentials are set. Add{" "}
            <code className="font-mono">GOOGLE_CLIENT_ID</code>/
            <code className="font-mono">GOOGLE_CLIENT_SECRET</code> or the GitHub equivalents to{" "}
            <code className="font-mono">.env.local</code> and restart. See{" "}
            <code className="font-mono">.env.example</code>.
          </p>
        )}

        <p className="mt-8 text-center text-[11px] leading-relaxed text-text-faint">
          Your model API key stays in your browser and is sent per-request. It is never written to
          the server.
        </p>
      </div>
    </main>
  );
}
