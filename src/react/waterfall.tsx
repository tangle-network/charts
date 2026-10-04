/**
 * Timing primitives extracted from Intelligence's TraceTree at ADC 4282a39f9f.
 * Hierarchy, span selection, attribution and inspectors remain caller-owned.
 * These components share one window: offsets are never replaced by durations.
 */
import type { CSSProperties, ReactNode } from "react";

export interface WaterfallWindow {
  readonly startMs: number;
  readonly endMs: number;
}

export interface WaterfallSpanGeometry {
  readonly offsetPct: number;
  readonly widthPct: number;
  readonly startOffsetMs: number;
  readonly durationMs: number;
  readonly clipped: boolean;
}

/** The Intelligence clipping/minimum-marker policy, applied to relative times. */
export function waterfallSpanGeometry(
  startMs: number,
  endMs: number,
  window: WaterfallWindow,
): WaterfallSpanGeometry {
  if (![startMs, endMs, window.startMs, window.endMs].every(Number.isFinite) ||
      endMs < startMs || window.endMs < window.startMs) {
    throw new RangeError("Waterfall requires finite, ordered span and window times");
  }
  const durationMs = endMs - startMs;
  const startOffsetMs = startMs - window.startMs;
  const windowMs = window.endMs - window.startMs;
  const span = windowMs === 0 ? 1 : windowMs;
  const rawOffsetPct = startOffsetMs / span * 100;
  const rawWidthPct = durationMs / span * 100;
  const endPct = rawOffsetPct + rawWidthPct;
  const fullyOutside = endPct <= 0 || rawOffsetPct >= 100;
  const offsetPct = Math.min(99, Math.max(0, rawOffsetPct));
  const widthPct = fullyOutside
    ? 0.5
    : Math.max(0.5, Math.min(100 - offsetPct, endPct - offsetPct));
  return { offsetPct, widthPct, startOffsetMs, durationMs,
    clipped: fullyOutside || rawOffsetPct < 0 || endPct > 100 };
}

function niceTickMs(spanMs: number, target = 4): number {
  if (!(spanMs > 0)) return 1;
  const rough = spanMs / target;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  const step = norm >= 5 ? 5 : norm >= 2 ? 2 : 1;
  return step * mag;
}

/** Intelligence's round-duration ticks, with the original 208px default. */
export function waterfallTicks(windowMs: number, widthPx = 208, minLabelGapPx = 64): number[] {
  if (!Number.isFinite(windowMs) || windowMs < 0 || !Number.isFinite(widthPx) ||
      widthPx <= 0 || !Number.isFinite(minLabelGapPx) || minLabelGapPx <= 0) {
    throw new RangeError("Waterfall axis requires finite, nonnegative time and positive dimensions");
  }
  if (windowMs === 0) return [];
  const target = Math.max(2, Math.floor(widthPx / minLabelGapPx));
  const step = niceTickMs(windowMs, target);
  const raw: number[] = [];
  for (let t = 0; t <= windowMs + 1e-6; t += step) raw.push(t);
  const minGapPct = minLabelGapPx / widthPx * 100;
  const kept: number[] = [];
  let lastPct = Number.NEGATIVE_INFINITY;
  for (const t of raw) {
    const pct = t / windowMs * 100;
    if (kept.length === 0 || pct - lastPct >= minGapPct) {
      kept.push(t);
      lastPct = pct;
    }
  }
  return kept;
}

export function formatWaterfallDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

const timingWidth = "var(--waterfall-timing-width, 208px)";
const timingCell: CSSProperties = { width: timingWidth, flexShrink: 0 };
const rowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "0.5rem", width: "100%", minWidth: 0 };
const labelStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "0.5rem", flex: "1 1 0%", minWidth: 0 };
const durationStyle: CSSProperties = { width: "var(--waterfall-duration-width, 4rem)", flexShrink: 0,
  textAlign: "right", fontFamily: "var(--font-mono, monospace)", fontVariantNumeric: "tabular-nums" };
const ordered = (start: number, end: number) => Number.isFinite(start) && Number.isFinite(end) && end >= start;

export interface WaterfallTimeAxisProps {
  windowMs: number;
  originMs?: number;
  widthPx?: number;
  formatDuration?: (ms: number) => string;
  className?: string;
}

export function WaterfallTimeAxis({ windowMs, originMs = 0, widthPx = 208,
  formatDuration = formatWaterfallDuration, className }: WaterfallTimeAxisProps) {
  if (!ordered(0, windowMs) || !Number.isFinite(originMs)) return null;
  const ticks = waterfallTicks(windowMs, widthPx);
  if (windowMs === 0) return null;
  return <div className={className} data-waterfall-axis="" aria-hidden="true"
    style={{ ...timingCell, position: "relative", height: "var(--waterfall-axis-height, 1.5rem)" }}>
    {ticks.map((t) => {
      const pct = t / windowMs * 100;
      return <span key={t} style={{ position: "absolute", top: 0, bottom: 0,
        left: `${pct}%`, display: "flex", flexDirection: "column", alignItems: "start" }}>
        <span style={{ height: "0.5rem", width: 1, background: "var(--intel-chart-grid, var(--color-border, #d1d3e1))" }} />
        <span style={{ marginTop: "0.25rem", whiteSpace: "nowrap", fontFamily: "var(--font-mono, monospace)",
          fontSize: "var(--waterfall-axis-font-size, 11px)", lineHeight: 1, fontVariantNumeric: "tabular-nums",
          transform: pct > 75 ? "translateX(-100%)" : undefined }}>
          {formatDuration(originMs + t)}
        </span>
      </span>;
    })}
  </div>;
}

export interface WaterfallBarProps {
  startMs: number;
  endMs: number;
  window: WaterfallWindow;
  tone?: "default" | "error" | "critical";
  formatDuration?: (ms: number) => string;
  className?: string;
}

export function WaterfallBar({ startMs, endMs, window, tone = "default",
  formatDuration = formatWaterfallDuration, className }: WaterfallBarProps) {
  if (!ordered(startMs, endMs) || !ordered(window.startMs, window.endMs)) {
    return <span className={className} data-waterfall-track="" data-unavailable="true"
      title="Timing unavailable" style={{ ...timingCell, textAlign: "center" }}>—</span>;
  }
  const geometry = waterfallSpanGeometry(startMs, endMs, window);
  const color = tone === "error" ? "var(--intel-waterfall-error, #dc2626)"
    : tone === "critical" ? "var(--intel-waterfall-critical, #0891b2)"
    : "var(--intel-waterfall-bar, #2563eb)";
  return <span className={className} data-waterfall-track="" data-tone={tone}
    title={`+${formatDuration(geometry.startOffsetMs)} · ${formatDuration(geometry.durationMs)}${tone === "critical" ? " · critical path" : ""}`}
    style={{ ...timingCell, position: "relative", height: "var(--waterfall-bar-height, 0.875rem)",
      overflow: "hidden", borderRadius: "var(--waterfall-bar-radius, 999px)",
      background: "var(--intel-waterfall-track, rgb(148 163 184 / 22%))" }}>
    <span data-waterfall-bar="" data-clipped={geometry.clipped || undefined}
      style={{ position: "absolute", top: 0, height: "100%", borderRadius: "inherit", background: color,
        left: `${geometry.offsetPct}%`, width: `${geometry.widthPct}%`,
        boxShadow: tone === "default" ? undefined : `0 0 0 1px ${color}` }} />
  </span>;
}

export interface WaterfallRowProps extends Omit<WaterfallBarProps, "className"> {
  label: ReactNode;
  attribution?: ReactNode;
  timingClassName?: string;
  durationClassName?: string;
  className?: string;
}

/** Non-interactive row body; its caller owns treeitems, buttons and selection. */
export function WaterfallRow({ label, attribution, startMs, endMs, window, tone,
  formatDuration = formatWaterfallDuration, className, timingClassName, durationClassName }: WaterfallRowProps) {
  return <span data-waterfall-row="" className={className} style={rowStyle}>
    <span data-waterfall-label="" style={labelStyle}>{label}</span>
    {attribution}
    <WaterfallBar startMs={startMs} endMs={endMs} window={window} tone={tone}
      formatDuration={formatDuration} className={timingClassName} />
    <span data-waterfall-duration="" className={durationClassName} style={durationStyle}>{ordered(startMs, endMs) ? formatDuration(endMs - startMs) : "—"}</span>
  </span>;
}

export interface WaterfallHeaderProps extends WaterfallTimeAxisProps {
  label?: ReactNode;
  attribution?: ReactNode;
  durationLabel?: ReactNode;
}

export function WaterfallHeader({ label = "Span", attribution, durationLabel = "Duration",
  ...axis }: WaterfallHeaderProps) {
  return <div data-waterfall-header="" style={rowStyle}>
    <span style={labelStyle}>{label}</span>
    {attribution}
    <WaterfallTimeAxis {...axis} />
    <span style={durationStyle}>{durationLabel}</span>
  </div>;
}
