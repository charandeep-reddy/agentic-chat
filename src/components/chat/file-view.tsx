"use client";

import { useCallback, useState } from "react";
import type { FileSpec } from "@/lib/tools/generate-file";
import { WidgetShell, StatusChip, WidgetAction } from "../widget-shell";
import { IconFile, IconCopy, IconCheck, IconDownload } from "../icons";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function FileWidget({ spec }: { spec: FileSpec }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    void navigator.clipboard.writeText(spec.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }, [spec.content]);

  // Same Blob + object-URL download already used by html-view.tsx and
  // data-table.tsx's CSV export — nothing is written server-side, the
  // browser writes the file when the click happens.
  const download = useCallback(() => {
    const blob = new Blob([spec.content], { type: spec.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = spec.filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [spec.content, spec.mimeType, spec.filename]);

  return (
    <WidgetShell
      icon={<IconFile size={15} />}
      title={spec.filename}
      status={
        <StatusChip tone="info">
          {spec.format} · {formatBytes(spec.bytes)}
        </StatusChip>
      }
      actions={
        <>
          <WidgetAction onClick={copy} label={copied ? "Copied" : "Copy contents"}>
            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          </WidgetAction>
          <WidgetAction onClick={download} label={`Download ${spec.filename}`}>
            <IconDownload size={14} />
          </WidgetAction>
        </>
      }
    >
      <pre className="scroll-thin max-h-64 overflow-auto rounded-lg border border-border-subtle bg-bg-elevated p-3 font-mono text-micro leading-relaxed text-text-secondary">
        <code>{spec.content}</code>
      </pre>
    </WidgetShell>
  );
}
