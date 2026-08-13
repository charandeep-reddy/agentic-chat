"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import mermaid from "mermaid";
import type { FlowSpec } from "@/lib/tools/render-flow";
import { WidgetShell, WidgetAction } from "./widget-shell";
import { IconFlow, IconExpand } from "./icons";
import { useMenu } from "./use-menu";
import { useTheme } from "./theme-provider";
import type { ResolvedTheme } from "@/lib/theme";

/**
 * Mermaid's config is global and read at render time, not at init time, so the
 * theme has to be re-applied before each render rather than once at module
 * load. Every diagram on the page shares the app's one theme, so the fact that
 * this is global state is not a hazard here.
 */
function configureMermaid(theme: ResolvedTheme) {
  mermaid.initialize({
    startOnLoad: false,
    theme: theme === "light" ? "default" : "dark",
    securityLevel: "loose",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    themeVariables: {
      background: theme === "light" ? "#ffffff" : "#09090b",
      fontSize: "13px",
    },
    /**
     * Narrower nodes, tighter ranks.
     *
     * The reason a diagram renders small is almost never the container — it is
     * that mermaid laid it out wider than any column we have, and something has
     * to shrink to fit. Mermaid's defaults are generous: labels run to 200px
     * before wrapping, so five siblings on one rank need roughly 1300px before
     * the first arrow is drawn. Wrapping sooner spends height, which a
     * conversation scrolls anyway, to buy width, which it does not have — and a
     * diagram that fits at 1:1 is one nobody has to zoom.
     */
    flowchart: {
      wrappingWidth: 140,
      nodeSpacing: 30,
      rankSpacing: 45,
    },
    // Without this, a diagram mermaid can't parse is answered with its own
    // "Syntax error in text / mermaid version …" graphic, drawn straight into
    // the page. We'd rather show the reason and the source the model produced.
    suppressErrorRendering: true,
  });
}

/**
 * Below this, the preview is too small to read and is only an illustration of
 * shape — which is when the "expand" affordance stops being optional.
 */
const LEGIBLE_SCALE = 0.85;

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

interface Rendered {
  /** As mermaid produced it: `width="100%"` with a px `max-width`, so it fits. */
  preview: string;
  /** The same diagram pinned to its laid-out size, for the viewer to scale. */
  full: string;
  /** The size mermaid laid it out at, in CSS px. */
  width: number;
  height: number;
  /** What produced this markup, so a stale render is never shown. */
  diagram: string;
  theme: ResolvedTheme;
}

/**
 * Measures the diagram, and produces the viewer's copy of it.
 *
 * Mermaid's `useMaxWidth` default emits `width="100%"` with a `max-width` in
 * px. That is exactly right for the preview — the diagram shrinks to whatever
 * column it is in and is never clipped — but it makes zooming impossible,
 * because the SVG will not grow past its own container. The viewer gets a copy
 * with an explicit size instead, which a transform can then scale freely.
 *
 * Done here rather than through mermaid config because `useMaxWidth` is a
 * per-diagram-type setting — nineteen of them — while the viewBox is written by
 * every type.
 */
function measure(source: string): Omit<Rendered, "diagram" | "theme"> {
  // Parsed as HTML rather than with `DOMParser`, on purpose. `image/svg+xml` is
  // a strict XML parse, and mermaid's `foreignObject` labels carry HTML
  // entities — a single `&nbsp;` would fail the whole document. This is also
  // the exact path the markup takes when React inserts it below, so anything
  // that survives here renders identically.
  const holder = document.createElement("div");
  holder.innerHTML = source;
  const svg = holder.querySelector("svg");
  const box = svg
    ?.getAttribute("viewBox")
    ?.split(/[\s,]+/)
    .map(Number);

  // Unmeasurable markup still previews fine; it just cannot be zoomed.
  if (!svg || box?.length !== 4 || box.some((n) => !Number.isFinite(n))) {
    return { preview: source, full: source, width: 0, height: 0 };
  }

  const [, , width, height] = box;
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.style.maxWidth = "none";
  return { preview: source, full: holder.innerHTML, width, height };
}

/**
 * Mermaid scopes the stylesheet it embeds with `#mermaid-<id>` selectors, so
 * showing the same diagram twice needs the copy renamed — otherwise the page
 * carries a duplicate id and two rule sets fighting over both nodes. Only the
 * full `mermaid-` prefixed token is rewritten, which no label can collide with.
 */
function withSuffixedIds(markup: string, id: string): string {
  return markup.replaceAll(`mermaid-${id}`, `mermaid-${id}-full`);
}

function Diagram({
  markup,
  className,
  style,
}: {
  markup: string;
  className?: string;
  style?: CSSProperties;
}) {
  return <div className={className} style={style} dangerouslySetInnerHTML={{ __html: markup }} />;
}

export function FlowWidget({ spec }: { spec: FlowSpec }) {
  const id = useId().replace(/[:]/g, "");
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const previewRef = useRef<HTMLButtonElement>(null);
  const [previewWidth, setPreviewWidth] = useState(0);
  const { theme } = useTheme();

  // Stamped with what produced it rather than cleared in the effect: clearing
  // would be a synchronous setState during an effect, and this also means the
  // previous diagram is never shown for a frame in the new one's place.
  const current =
    rendered && rendered.diagram === spec.diagram && rendered.theme === theme ? rendered : null;

  useEffect(() => {
    let cancelled = false;
    configureMermaid(theme);
    mermaid
      .render(`mermaid-${id}`, spec.diagram)
      .then(({ svg }) => {
        if (cancelled) return;
        setError(null);
        setRendered({ ...measure(svg), diagram: spec.diagram, theme });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to render diagram.");
      });
    return () => {
      cancelled = true;
    };
  }, [id, spec.diagram, theme]);

  // How far the preview had to shrink. Watched rather than measured once: the
  // sidebar collapsing changes it without anything re-rendering here.
  useEffect(() => {
    const node = previewRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      setPreviewWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [current]);

  const shrunk = current !== null && current.width > 0 && previewWidth > 0 && previewWidth < current.width * LEGIBLE_SCALE;

  return (
    <>
      <WidgetShell
        icon={<IconFlow size={15} />}
        title={`Diagram · ${spec.type}`}
        actions={
          current && (
            <WidgetAction onClick={() => setOpen(true)} label="Expand diagram">
              <IconExpand size={14} />
            </WidgetAction>
          )
        }
      >
        {error ? (
          <div className="space-y-2">
            <p className="text-ui text-danger">Could not render this diagram.</p>
            <p className="font-mono text-dense leading-relaxed text-text-faint">{error}</p>
            <pre className="scroll-thin overflow-x-auto whitespace-pre rounded-md border border-border-subtle bg-surface p-3 font-mono text-dense text-text-muted">
              {spec.diagram}
            </pre>
          </div>
        ) : !current ? (
          <div className="flex h-32 items-center justify-center text-ui text-text-faint">
            Rendering diagram…
          </div>
        ) : (
          /*
            The preview always fits. It never scrolls sideways and is never
            clipped — a diagram with its edges cut off reads as broken, and a
            horizontal scroller inside a message steals the swipe that was meant
            for the page. When fitting makes it too small to read, it stops
            pretending to be readable and becomes a labelled way into the viewer.
          */
          <button
            ref={previewRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Expand ${spec.title ?? spec.type ?? "diagram"}`}
            className="group/flow relative block w-full cursor-zoom-in"
          >
            {/* `mx-auto` centres a diagram narrower than the card; the height
                cap keeps a tall one from taking over the transcript. */}
            <Diagram markup={current.preview} className="[&>svg]:mx-auto [&>svg]:max-h-[70vh]" />

            {/*
              Only shown once the diagram is genuinely too small — an affordance
              on something already readable is noise, and on a phone this is the
              whole instruction.
            */}
            {shrunk && (
              <span className="absolute bottom-1 right-1 flex items-center gap-1.5 rounded-md border border-border-subtle bg-bg-elevated/90 px-2 py-1 text-micro text-text-muted backdrop-blur transition-colors group-hover/flow:text-text">
                <IconExpand size={12} />
                <span className="pointer-coarse:hidden">Click to zoom</span>
                <span className="hidden pointer-coarse:inline">Tap to zoom</span>
              </span>
            )}
          </button>
        )}
      </WidgetShell>

      {open && current && (
        <DiagramViewer
          markup={withSuffixedIds(current.full, id)}
          width={current.width}
          height={current.height}
          title={spec.title ?? `Diagram · ${spec.type}`}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/**
 * The reading view: the whole screen, zoomable, and pannable by dragging.
 *
 * It opens at 1:1 rather than fitted. Someone who opened this did so because
 * the preview was too small, so fitting it to a phone would hand back the same
 * problem in a bigger frame; "Fit" is one tap away for the overview instead.
 */
function DiagramViewer({
  markup,
  width,
  height,
  title,
  onClose,
}: {
  markup: string;
  width: number;
  height: number;
  title: string;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [fitted, setFitted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const overlayRef = useMenu<HTMLDivElement>({ open: true, onClose, trap: true });

  const fit = useCallback(() => {
    const node = scrollRef.current;
    if (!node || width === 0) return;
    const scale = Math.min((node.clientWidth - 24) / width, (node.clientHeight - 24) / height, 1);
    setZoom(Math.max(ZOOM_MIN, scale));
    setFitted(true);
  }, [width, height]);

  const setZoomTo = useCallback((next: (z: number) => number) => {
    setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next(z))));
    setFitted(false);
  }, []);

  /**
   * Drag to pan, for mice only — a touch drag is already how you scroll, and
   * taking it over would break momentum and rubber-banding for no gain.
   */
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const node = scrollRef.current;
    if (e.pointerType !== "mouse" || e.button !== 0 || !node) return;
    drag.current = { x: e.clientX, y: e.clientY, left: node.scrollLeft, top: node.scrollTop };
    node.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const node = scrollRef.current;
    const start = drag.current;
    if (!start || !node) return;
    node.scrollLeft = start.left - (e.clientX - start.x);
    node.scrollTop = start.top - (e.clientY - start.y);
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    scrollRef.current?.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex flex-col bg-black/80 p-2 backdrop-blur-sm sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border bg-surface">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
          <IconFlow size={14} className="shrink-0 text-accent" />
          <h3 className="truncate text-dense font-medium text-text">{title}</h3>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <div className="flex items-center rounded-lg border border-border-subtle">
              <ZoomButton
                label="Zoom out"
                disabled={zoom <= ZOOM_MIN}
                onClick={() => setZoomTo((z) => z - ZOOM_STEP)}
              >
                −
              </ZoomButton>
              {/* One button, because "fit" and "actual size" are the only two
                  positions anyone actually wants to return to. */}
              <button
                type="button"
                onClick={fitted ? () => setZoomTo(() => 1) : fit}
                className="w-16 py-1 font-mono text-micro text-text-muted tabular-nums hover:text-text"
              >
                {fitted ? "100%" : "Fit"}
              </button>
              <ZoomButton
                label="Zoom in"
                disabled={zoom >= ZOOM_MAX}
                onClick={() => setZoomTo((z) => z + ZOOM_STEP)}
              >
                +
              </ZoomButton>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-dense text-text-muted hover:bg-surface-raised hover:text-text"
            >
              {/* The button stays; only the key it doubles for goes. */}
              Close <kbd className="ml-1 hidden font-mono text-micro pointer-fine:inline">esc</kbd>
            </button>
          </div>
        </header>

        <div
          ref={scrollRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="scroll-thin min-h-0 flex-1 overflow-auto p-3 pointer-fine:cursor-grab pointer-fine:active:cursor-grabbing"
        >
          {/* The transform does the zooming; this box carries the scaled size,
              because that is what the scrollbars measure. `mx-auto` keeps a
              diagram smaller than the frame centred rather than in a corner. */}
          <div className="mx-auto" style={{ width: width * zoom, height: height * zoom }}>
            <Diagram
              markup={markup}
              className="origin-top-left"
              style={{ transform: `scale(${zoom})` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ZoomButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="px-2.5 py-1 font-mono text-ui leading-none text-text-muted hover:text-text disabled:opacity-30 disabled:hover:text-text-muted"
    >
      {children}
    </button>
  );
}
