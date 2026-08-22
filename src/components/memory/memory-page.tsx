"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell, Section } from "../page-shell";
import { Skeleton } from "../skeleton";
import { MEMORY_CATEGORIES } from "@/lib/tools/memory";
import { IconCheck, IconPlus, IconSearch, IconShare } from "../icons";
import { MemoryRow, type MemoryItem } from "./memory-row";
import { PackCard, type PackItem } from "./pack-card";

export function MemoryPage({
  memories: initialMemories,
  ownedPacks,
  discoverPacks,
}: {
  memories: MemoryItem[];
  ownedPacks: PackItem[];
  discoverPacks: PackItem[];
}) {
  const router = useRouter();
  const [memories, setMemories] = useState(initialMemories);
  const [filter, setFilter] = useState("");
  const [draft, setDraft] = useState("");
  const [draftCategory, setDraftCategory] = useState<string>("fact");
  const [packDraft, setPackDraft] = useState<{ name: string; description: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importSlug, setImportSlug] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(0);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return memories;
    return memories.filter(
      (m) => m.content.toLowerCase().includes(q) || m.category.includes(q),
    );
  }, [memories, filter]);

  const add = async () => {
    const content = draft.trim();
    if (!content) return;
    setDraft("");
    // The id comes from the server, so the row can't be added optimistically —
    // hold a placeholder in its place rather than leaving the list unchanged
    // while the round trip completes.
    setAdding((count) => count + 1);
    try {
      const res = await fetch("/api/memories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, category: draftCategory }),
      });
      const data = (await res.json()) as { memory: MemoryItem | null };
      if (data.memory) {
        setMemories((current) =>
          current.some((m) => m.id === data.memory!.id) ? current : [data.memory!, ...current],
        );
      }
    } catch (error) {
      console.error("[memory] failed to add:", error);
    } finally {
      setAdding((count) => count - 1);
    }
  };

  const patch = async (id: string, body: Partial<MemoryItem>) => {
    const previous = memories;
    setMemories((current) => current.map((m) => (m.id === id ? { ...m, ...body } : m)));
    try {
      const res = await fetch(`/api/memories/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch (error) {
      console.error("[memory] patch failed:", error);
      setMemories(previous);
    }
  };

  const remove = async (id: string) => {
    const previous = memories;
    setMemories((current) => current.filter((m) => m.id !== id));
    setSelected((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    try {
      const res = await fetch(`/api/memories/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
    } catch (error) {
      console.error("[memory] delete failed:", error);
      setMemories(previous);
    }
  };

  const createPack = async () => {
    if (!packDraft?.name.trim()) return;
    const entries = memories
      .filter((m) => selected.has(m.id))
      .map((m) => ({ content: m.content, category: m.category }));
    if (entries.length === 0) return;

    try {
      const res = await fetch("/api/memory-packs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: packDraft.name,
          description: packDraft.description,
          entries,
          isPublic: true,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setPackDraft(null);
      setSelected(new Set());
      setNotice("Pack published — share its link from the list below.");
      router.refresh();
    } catch (error) {
      console.error("[memory] failed to create pack:", error);
      setNotice("Could not publish the pack.");
    }
  };

  const install = async (slug: string) => {
    try {
      const res = await fetch(`/api/memory-packs/${slug}/install`, { method: "POST" });
      if (!res.ok) {
        setNotice(`No pack found at "${slug}".`);
        return;
      }
      const data = (await res.json()) as { added: number; skipped: number; pack: { name: string } };
      setNotice(
        `Added ${data.added} ${data.added === 1 ? "memory" : "memories"} from ${data.pack.name}` +
          (data.skipped > 0 ? ` (${data.skipped} you already had).` : "."),
      );
      router.refresh();
    } catch (error) {
      console.error("[memory] install failed:", error);
    }
  };

  const uninstall = async (slug: string) => {
    try {
      const res = await fetch(`/api/memory-packs/${slug}/install`, { method: "DELETE" });
      const data = (await res.json()) as { removed: number };
      setNotice(`Removed ${data.removed} imported ${data.removed === 1 ? "memory" : "memories"}.`);
      router.refresh();
    } catch (error) {
      console.error("[memory] uninstall failed:", error);
    }
  };

  const deletePack = async (slug: string) => {
    if (!confirm("Delete this pack? People who already installed it keep their copies.")) return;
    try {
      await fetch(`/api/memory-packs/${slug}`, { method: "DELETE" });
      router.refresh();
    } catch (error) {
      console.error("[memory] failed to delete pack:", error);
    }
  };

  return (
    <PageShell
      title="Memory"
      description="What the model remembers about you between conversations, and packs of memories you can share or borrow."
      tabs={[
        { href: "/profile", label: "Profile", active: false },
        { href: "/memory", label: "Memory", active: true },
        { href: "/skills", label: "Skills", active: false },
      ]}
    >
      {notice && (
        <div className="flex items-start gap-2.5 rounded-lg border border-accent/25 bg-accent-soft px-3.5 py-2.5">
          <IconCheck size={14} className="mt-0.5 shrink-0 text-accent" />
          <p className="flex-1 text-dense text-text-secondary">{notice}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-micro text-text-faint hover:text-text"
          >
            Dismiss
          </button>
        </div>
      )}

      <Section
        title={`Saved memories (${memories.length})`}
        description="Uncheck one to keep it without using it. Click the text to edit it."
      >
        <div className="mb-4 flex gap-2">
          <input
            value={draft}
            maxLength={500}
            placeholder="Add a memory, e.g. 'Deploys to Fly.io, not Vercel.'"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void add();
            }}
            className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-dense text-text placeholder:text-text-faint focus:border-border-strong focus:outline-none"
          />
          <select
            value={draftCategory}
            onChange={(e) => setDraftCategory(e.target.value)}
            aria-label="Category"
            className="shrink-0 rounded-lg border border-border-subtle bg-bg-elevated px-2 py-2 text-dense text-text-secondary focus:outline-none"
          >
            {MEMORY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!draft.trim()}
            onClick={() => void add()}
            aria-label="Add memory"
            className="shrink-0 rounded-lg bg-accent px-3 text-accent-text hover:brightness-110 disabled:opacity-40"
          >
            <IconPlus size={14} />
          </button>
        </div>

        {memories.length > 6 && (
          <div className="relative mb-3">
            <IconSearch
              size={13}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint"
            />
            <input
              value={filter}
              placeholder="Filter memories"
              onChange={(e) => setFilter(e.target.value)}
              className="w-full rounded-lg border border-border-subtle bg-bg-elevated py-2 pl-8 pr-3 text-dense text-text placeholder:text-text-faint focus:border-border-strong focus:outline-none"
            />
          </div>
        )}

        {adding > 0 && (
          <ul className="mb-1.5 space-y-1.5">
            {Array.from({ length: adding }, (_, index) => (
              <li
                key={index}
                className="rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5"
              >
                <Skeleton className="h-3.5 w-[70%]" />
              </li>
            ))}
          </ul>
        )}

        {visible.length === 0 && adding === 0 ? (
          <p className="py-6 text-center text-dense text-text-faint">
            {memories.length === 0
              ? "Nothing remembered yet. Tell the model something durable about you, or add one above."
              : `Nothing matches "${filter}".`}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {visible.map((item) => (
              <MemoryRow
                key={item.id}
                item={item}
                onToggle={(id, enabled) => void patch(id, { enabled })}
                onEdit={(id, content) => void patch(id, { content })}
                onDelete={(id) => void remove(id)}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Publish a pack"
        description="Bundle some of your memories into a link anyone can install. A frozen copy is shared — editing yours afterwards does not change theirs."
      >
        {packDraft ? (
          <div className="space-y-3">
            <input
              autoFocus
              value={packDraft.name}
              maxLength={80}
              placeholder="Pack name, e.g. 'Rust reviewer defaults'"
              onChange={(e) => setPackDraft({ ...packDraft, name: e.target.value })}
              className="w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-dense text-text placeholder:text-text-faint focus:border-border-strong focus:outline-none"
            />
            <textarea
              rows={2}
              maxLength={400}
              value={packDraft.description}
              placeholder="What is this pack for? Who should install it?"
              onChange={(e) => setPackDraft({ ...packDraft, description: e.target.value })}
              className="w-full resize-none rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-dense text-text placeholder:text-text-faint focus:border-border-strong focus:outline-none"
            />

            <div className="max-h-56 overflow-y-auto rounded-lg border border-border-subtle bg-bg-elevated p-2 scroll-thin">
              {memories.length === 0 ? (
                <p className="p-2 text-dense text-text-faint">No memories to include yet.</p>
              ) : (
                memories.map((m) => (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-surface"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(m.id)}
                      onChange={(e) => {
                        setSelected((current) => {
                          const next = new Set(current);
                          if (e.target.checked) next.add(m.id);
                          else next.delete(m.id);
                          return next;
                        });
                      }}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
                    />
                    <span className="text-dense leading-relaxed text-text-secondary">
                      {m.content}
                    </span>
                  </label>
                ))
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!packDraft.name.trim() || selected.size === 0}
                onClick={() => void createPack()}
                className="rounded-lg bg-accent px-3.5 py-2 text-dense font-medium text-accent-text hover:brightness-110 disabled:opacity-40"
              >
                Publish {selected.size > 0 && `${selected.size} `}
                {selected.size === 1 ? "memory" : "memories"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPackDraft(null);
                  setSelected(new Set());
                }}
                className="rounded-lg px-3 py-2 text-dense text-text-muted hover:text-text"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={memories.length === 0}
            onClick={() => setPackDraft({ name: "", description: "" })}
            className="flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3.5 py-2 text-dense text-text-secondary transition-colors hover:border-border-strong hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconShare size={14} />
            {memories.length === 0 ? "Save a memory first" : "Create a pack"}
          </button>
        )}

        {ownedPacks.length > 0 && (
          <ul className="mt-4 space-y-2">
            {ownedPacks.map((pack) => (
              <PackCard
                key={pack.id}
                pack={pack}
                onInstall={(slug) => void install(slug)}
                onUninstall={(slug) => void uninstall(slug)}
                onDelete={(slug) => void deletePack(slug)}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Add memory from others"
        description="Paste a pack link someone sent you, or browse what people have published."
      >
        <div className="mb-4 flex gap-2">
          <input
            value={importSlug}
            placeholder="Pack link or slug"
            onChange={(e) => setImportSlug(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const slug = importSlug.trim().split("/").filter(Boolean).pop();
              if (slug) void install(slug);
              setImportSlug("");
            }}
            className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-dense text-text placeholder:text-text-faint focus:border-border-strong focus:outline-none"
          />
          <button
            type="button"
            disabled={!importSlug.trim()}
            onClick={() => {
              const slug = importSlug.trim().split("/").filter(Boolean).pop();
              if (slug) void install(slug);
              setImportSlug("");
            }}
            className="shrink-0 rounded-lg border border-border px-3 py-2 text-dense text-text-secondary hover:border-border-strong hover:text-text disabled:opacity-40"
          >
            Install
          </button>
        </div>

        {discoverPacks.length === 0 ? (
          <p className="py-4 text-center text-dense text-text-faint">
            Nobody has published a public pack yet. Be first.
          </p>
        ) : (
          <ul className="space-y-2">
            {discoverPacks.map((pack) => (
              <PackCard
                key={pack.id}
                pack={pack}
                onInstall={(slug) => void install(slug)}
                onUninstall={(slug) => void uninstall(slug)}
                onDelete={(slug) => void deletePack(slug)}
              />
            ))}
          </ul>
        )}
      </Section>
    </PageShell>
  );
}
