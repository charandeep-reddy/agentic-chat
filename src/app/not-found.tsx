import Link from "next/link";
import { IconLogo } from "@/components/icons";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <IconLogo size={22} />
      </span>
      <p className="font-mono text-micro uppercase tracking-widest text-text-faint">
        404 · page not found
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text">
        This page doesn&apos;t exist
      </h1>
      <p className="mt-3 max-w-md text-ui leading-relaxed text-text-muted">
        The link is broken, the page was moved, or it never existed in the first
        place. Either way, the agent has nothing to fetch here.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-ui font-medium text-accent-text hover:brightness-110"
      >
        <IconLogo size={15} />
        Back to a new chat
      </Link>
    </main>
  );
}
