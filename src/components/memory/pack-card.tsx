"use client";

import { useState } from "react";
import { IconBrain, IconCheck, IconCopy, IconDownload, IconTrash } from "../icons";

export interface PackItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  entryCount: number;
  isPublic: boolean;
  installCount: number;
  installed: boolean;
  mine: boolean;
}

export function PackCard({
  pack,
  onInstall,
  onUninstall,
  onDelete,
}: {
  pack: PackItem;
  onInstall: (slug: string) => void;
  onUninstall: (slug: string) => void;
  onDelete: (slug: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <li className="rounded-lg border border-border-subtle bg-bg-elevated p-3.5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-human-soft text-human">
          <IconBrain size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-dense font-medium text-text">{pack.name}</p>
          {pack.description && (
            <p className="mt-0.5 line-clamp-2 text-dense leading-relaxed text-text-muted">
              {pack.description}
            </p>
          )}
          <p className="mt-1 text-micro text-text-faint">
            {pack.entryCount} {pack.entryCount === 1 ? "memory" : "memories"}
            {pack.installCount > 0 && ` · ${pack.installCount} installs`}
            {pack.mine && (pack.isPublic ? " · public" : " · private")}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {pack.installed ? (
          <button
            type="button"
            onClick={() => onUninstall(pack.slug)}
            className="rounded-lg border border-border px-2.5 py-1.5 text-dense text-text-muted hover:border-danger/40 hover:text-danger"
          >
            Remove its memories
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onInstall(pack.slug)}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-dense font-medium text-accent-text hover:brightness-110"
          >
            <IconDownload size={12} />
            Add to my memory
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            void navigator.clipboard
              .writeText(`${window.location.origin}/pack/${pack.slug}`)
              .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              });
          }}
          className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-dense text-text-muted hover:border-border-strong hover:text-text"
        >
          {copied ? <IconCheck size={12} className="text-accent" /> : <IconCopy size={12} />}
          {copied ? "Copied" : "Share link"}
        </button>

        {pack.mine && (
          <button
            type="button"
            onClick={() => onDelete(pack.slug)}
            aria-label="Delete pack"
            className="ml-auto rounded-md p-1.5 text-text-faint hover:bg-danger-soft hover:text-danger"
          >
            <IconTrash size={13} />
          </button>
        )}
      </div>
    </li>
  );
}
