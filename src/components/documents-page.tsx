"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { PageShell, Section } from "./page-shell";
import type { SidebarUser } from "./sidebar";
import { KEY_STORAGE } from "./settings-panel";
import { getStorage, subscribeStorage } from "@/lib/local-storage";
import { IconAlert, IconCheck, IconLoader, IconPlus, IconRefresh, IconTrash } from "./icons";

export interface DocumentItem {
  id: string;
  title: string;
  source: string;
  status: string;
  error: string | null;
  chunkCount: number;
  enabled: boolean;
  createdAt: string;
}

/**
 * PDF and DOCX are extracted by the Python service; everything else is decoded
 * as text. Legacy .doc is deliberately absent — it needs a converter, and the
 * service returns a clear error rather than garbage if one slips through.
 */
const ACCEPT =
  ".txt,.md,.markdown,.csv,.json,.log,.pdf,.docx,text/plain,text/markdown,text/csv,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Binary formats go to the service as-is; text is read in the browser. */
function isBinary(file: File): boolean {
  return /\.(pdf|docx)$/i.test(file.name);
}

function StatusBadge({ document }: { document: DocumentItem }) {
  if (document.status === "ready") {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-text-faint">
        <IconCheck size={12} className="text-accent" />
        {document.chunkCount} chunk{document.chunkCount === 1 ? "" : "s"}
      </span>
    );
  }
  if (document.status === "failed") {
    return (
      <span
        className="inline-flex items-center gap-1 text-[12px] text-danger"
        title={document.error ?? undefined}
      >
        <IconAlert size={12} />
        Indexing failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-text-faint">
      <IconLoader size={12} className="animate-spin" />
      Indexing
    </span>
  );
}

export function DocumentsPage({
  user,
  documents: initial,
}: {
  user: SidebarUser;
  documents: DocumentItem[];
}) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initial);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [source, setSource] = useState("pasted");
  /** A PDF or DOCX waiting to be uploaded; its text only exists server-side. */
  const [pending, setPending] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Embedding is billed to the user's own key, the same one the chat uses, so
  // uploading without a key configured cannot work — the form says so rather
  // than failing at the provider.
  const apiKey = useSyncExternalStore(
    (cb) => subscribeStorage(KEY_STORAGE, cb),
    () => getStorage(KEY_STORAGE),
    () => "",
  );

  const headers = (): HeadersInit => ({
    "content-type": "application/json",
    ...(apiKey ? { "x-model-key": apiKey } : {}),
  });

  const onFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
    setSource(file.name);
    // A PDF is not readable here — it is uploaded whole and extracted by the
    // service. Text files are still shown so the paste box stays editable.
    setPending(isBinary(file) ? file : null);
    setContent(isBinary(file) ? "" : await file.text());
  };

  const upload = async () => {
    const body = content.trim();
    if (!body && !pending) {
      setError("Paste some text or choose a file first.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // Multipart for binaries so the bytes stream through untouched; JSON for
      // text, which is already a string on both sides.
      let request: RequestInit;
      if (pending) {
        const form = new FormData();
        form.set("file", pending, pending.name);
        form.set("title", title.trim() || pending.name);
        request = {
          method: "POST",
          // No content-type: the browser sets it with the multipart boundary.
          headers: apiKey ? { "x-model-key": apiKey } : {},
          body: form,
        };
      } else {
        request = {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ title: title.trim() || source, content: body, source }),
        };
      }

      const res = await fetch("/api/documents", request);
      const data = (await res.json()) as {
        document?: DocumentItem;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.message ?? "Upload failed.");
        return;
      }
      // The document row exists even when indexing failed, so it is listed
      // either way — with the error and a retry, rather than silently dropped.
      if (data.message) setError(data.message);
      setTitle("");
      setContent("");
      setSource("pasted");
      setPending(null);
      if (fileInput.current) fileInput.current.value = "";
      router.refresh();
      if (data.document) setDocuments((list) => [data.document as DocumentItem, ...list]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const reindex = async (id: string) => {
    setError(null);
    setDocuments((list) =>
      list.map((d) => (d.id === id ? { ...d, status: "pending", error: null } : d)),
    );
    const res = await fetch(`/api/documents/${id}`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ reindex: true }),
    });
    const data = (await res.json()) as { chunkCount?: number; message?: string };
    if (!res.ok) {
      setError(data.message ?? "Re-indexing failed.");
      setDocuments((list) =>
        list.map((d) =>
          d.id === id ? { ...d, status: "failed", error: data.message ?? null } : d,
        ),
      );
      return;
    }
    setDocuments((list) =>
      list.map((d) =>
        d.id === id
          ? { ...d, status: "ready", error: null, chunkCount: data.chunkCount ?? d.chunkCount }
          : d,
      ),
    );
    router.refresh();
  };

  const toggle = async (id: string, enabled: boolean) => {
    setDocuments((list) => list.map((d) => (d.id === id ? { ...d, enabled } : d)));
    await fetch(`/api/documents/${id}`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ enabled }),
    });
    router.refresh();
  };

  const remove = async (id: string) => {
    setDocuments((list) => list.filter((d) => d.id !== id));
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    router.refresh();
  };

  const readyCount = documents.filter((d) => d.enabled && d.status === "ready").length;

  return (
    <PageShell
      user={user}
      title="Documents"
      description="Text the model can search before it answers. Each document is split into passages, each passage is stored as a vector, and the model retrieves the few that match your question — so a long document costs nothing until it is relevant."
      tabs={[
        { href: "/profile", label: "Profile", active: false },
        { href: "/memory", label: "Memory", active: false },
        { href: "/skills", label: "Skills", active: false },
        { href: "/documents", label: "Documents", active: true },
      ]}
    >
      <Section
        title="Add a document"
        description="PDF, DOCX, Markdown, plain text, CSV or JSON. Headings are used as split points, so structured documents retrieve best — in a PDF, each page becomes one."
      >
        <div className="space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title — what the model sees in its list of your documents"
            className="w-full rounded-md border border-border-subtle bg-bg px-3 py-2 text-[13px] text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
          />

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            disabled={pending !== null}
            placeholder={
              pending
                ? `${pending.name} will be extracted on upload.`
                : "Paste the text here, or choose a file below."
            }
            className="scroll-thin w-full resize-y rounded-md border border-border-subtle bg-bg px-3 py-2 font-mono text-[12px] leading-relaxed text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
          />

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              onChange={(e) => void onFiles(e.target.files)}
              className="text-[12px] text-text-muted file:mr-3 file:rounded-md file:border file:border-border-subtle file:bg-surface file:px-3 file:py-1.5 file:text-[12px] file:text-text-secondary hover:file:bg-surface-hover"
            />
            <span className="text-[12px] text-text-faint">
              {pending
                ? `${pending.name} · ${Math.round(pending.size / 1024).toLocaleString()} KB — text is extracted on the server`
                : content
                  ? `${content.length.toLocaleString()} characters`
                  : ""}
            </span>
            <button
              type="button"
              onClick={() => void upload()}
              disabled={busy || (!content.trim() && !pending) || !apiKey}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-fg disabled:opacity-50"
            >
              {busy ? <IconLoader size={14} className="animate-spin" /> : <IconPlus size={14} />}
              {busy ? "Indexing…" : "Add document"}
            </button>
          </div>

          {!apiKey && (
            <p className="text-[12px] text-text-faint">
              Indexing embeds the text with your model key. Add one in Settings first.
            </p>
          )}
          {error && <p className="text-[12px] text-danger">{error}</p>}
        </div>
      </Section>

      <Section
        title="Your documents"
        description={
          documents.length > 0
            ? `${readyCount} of ${documents.length} searchable. Disabled documents stay stored but are hidden from the model.`
            : undefined
        }
      >
        {documents.length === 0 ? (
          <p className="text-[13px] text-text-faint">
            Nothing indexed yet. Add a document above and the model gains a `search_documents` tool.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-text">{doc.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-3">
                    <StatusBadge document={doc} />
                    {doc.source !== "pasted" && (
                      <span className="truncate text-[12px] text-text-faint">{doc.source}</span>
                    )}
                  </div>
                  {doc.status === "failed" && doc.error && (
                    <p className="mt-1 text-[12px] text-danger">{doc.error}</p>
                  )}
                </div>

                <label className="flex shrink-0 items-center gap-1.5 text-[12px] text-text-muted">
                  <input
                    type="checkbox"
                    checked={doc.enabled}
                    onChange={(e) => void toggle(doc.id, e.target.checked)}
                    className="accent-accent"
                  />
                  Enabled
                </label>

                <button
                  type="button"
                  onClick={() => void reindex(doc.id)}
                  title="Re-chunk and re-embed this document"
                  aria-label={`Re-index ${doc.title}`}
                  className="shrink-0 rounded-md p-1.5 text-text-faint hover:bg-surface hover:text-text"
                >
                  <IconRefresh size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => void remove(doc.id)}
                  aria-label={`Delete ${doc.title}`}
                  className="shrink-0 rounded-md p-1.5 text-text-faint hover:bg-surface hover:text-danger"
                >
                  <IconTrash size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </PageShell>
  );
}
