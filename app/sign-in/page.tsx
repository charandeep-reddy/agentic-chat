import { redirect } from "next/navigation";
import { enabledProviders } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { SignInButtons } from "@/components/sign-in-buttons";
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

        {enabledProviders.length === 0 ? (
          <div className="rounded-xl border border-warn/30 bg-warn-soft p-4 text-sm text-warn">
            <p className="font-medium">No OAuth provider is configured.</p>
            <p className="mt-1.5 text-[13px] leading-relaxed opacity-90">
              Add <code className="font-mono">GOOGLE_CLIENT_ID</code>/
              <code className="font-mono">GOOGLE_CLIENT_SECRET</code> or the GitHub equivalents to{" "}
              <code className="font-mono">.env.local</code> and restart the dev server. See{" "}
              <code className="font-mono">.env.example</code>.
            </p>
          </div>
        ) : (
          <SignInButtons providers={enabledProviders} />
        )}

        <p className="mt-8 text-center text-[11px] leading-relaxed text-text-faint">
          Your model API key stays in your browser and is sent per-request. It is never written to
          the server.
        </p>
      </div>
    </main>
  );
}
