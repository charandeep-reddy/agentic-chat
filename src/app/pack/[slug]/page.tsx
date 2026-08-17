import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getPackBySlug } from "@/lib/db/queries";
import type { PackEntry } from "@/lib/db/queries";
import { getSession } from "@/lib/session";
import { InstallPackButton } from "@/components/memory/install-pack-button";
import { IconBrain, IconLogo } from "@/components/icons";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const pack = await getPackBySlug(slug);
  return { title: pack ? `${pack.name} · Memory pack` : "Memory pack · Agentic Chat" };
}

/** The landing page for a shared memory pack link. */
export default async function PackPage({ params }: Props) {
  const { slug } = await params;
  const pack = await getPackBySlug(slug);
  if (!pack) notFound();

  const session = await getSession();
  // A private pack is only ever viewable by its owner.
  if (!pack.isPublic && session?.user.id !== pack.ownerId) notFound();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/pack/${slug}`)}`);

  const entries = pack.entries as PackEntry[];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border-subtle px-4">
        <Link href="/" className="flex items-center gap-2 text-ui font-semibold text-text">
          <IconLogo size={15} className="text-accent" />
          Agentic Chat
        </Link>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
        <div className="flex items-start gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-human-soft text-human">
            <IconBrain size={20} />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-text">{pack.name}</h1>
            <p className="mt-0.5 text-dense text-text-faint">
              {entries.length} {entries.length === 1 ? "memory" : "memories"}
              {pack.installCount > 0 && ` · installed ${pack.installCount} times`}
            </p>
          </div>
        </div>

        {pack.description && (
          <p className="mt-4 text-dense leading-relaxed text-text-muted">{pack.description}</p>
        )}

        <div className="mt-6">
          <InstallPackButton slug={pack.slug} />
        </div>

        <h2 className="mt-9 text-dense font-medium text-text-secondary">What you&apos;ll get</h2>
        <p className="mt-1 text-micro leading-relaxed text-text-faint">
          These are copied into your own memory. You can edit or delete any of them afterwards, and
          removing the pack removes exactly what it added.
        </p>
        <ul className="mt-3 space-y-1.5">
          {entries.map((entry, i) => (
            <li
              key={i}
              className="flex items-start gap-2.5 rounded-lg border border-border-subtle bg-surface/40 px-3 py-2.5"
            >
              <span className="mt-px shrink-0 rounded-full border border-border-subtle px-1.5 py-px font-mono text-micro text-text-faint">
                {entry.category}
              </span>
              <span className="text-dense leading-relaxed text-text-secondary">
                {entry.content}
              </span>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
