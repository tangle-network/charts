/**
 * Renderer extracted from ADC PR #8746, a1c3958fd73a3894d4515f9dc476dae9ace30ce0:
 * products/platform/web/src/client/components/UsageChartSvg.tsx.
 * Keeps its viewBox, hit targets, actual-stack highlight and select-never-toggle
 * interaction. Product/category mapping, aggregation, currency and the portal
 * tooltip formatting remain caller-owned; no React DOM dependency is needed here.
 */
import { Fragment, useId, useRef, useState } from "react";

export interface StackedBarSeries {
  readonly id: string;
  readonly label: string;
  /** Caller-owned CSS color, e.g. a brand token. Never inferred from an ID. */
  readonly color: string;
}
export interface StackedBarSegment {
  readonly seriesId: string;
  readonly value: number | null;
}
export interface StackedBarBucket {
  readonly id: string;
  readonly label: string;
  /** Pre-aggregated by the caller. Null/nonfinite readings are gaps, not zero. */
  readonly total: number | null;
  /** Stack order is input order. Charts neither groups nor sorts. */
  readonly segments: readonly StackedBarSegment[];
}
export interface StackedBarChartProps {
  label: string;
  series: readonly StackedBarSeries[];
  buckets: readonly StackedBarBucket[];
  /** Explicit [0, maxValue] domain. Zero is valid only for zero-valued data. */
  maxValue: number;
  formatValue: (value: number) => string;
  selectedBucketId: string | null;
  onSelectionChange: (bucketId: string | null) => void;
  emptyLabel?: string;
  unavailableLabel?: string;
  className?: string;
}

function isValue(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}
function hasGap(bucket: StackedBarBucket): boolean {
  return !isValue(bucket.total) || bucket.segments.some(({ value }) => !isValue(value));
}
function validate({ series, buckets, maxValue }: StackedBarChartProps): void {
  if (!Number.isFinite(maxValue) || maxValue < 0) {
    throw new RangeError("StackedBarChart maxValue must be finite and nonnegative");
  }
  const seriesIds = new Set<string>();
  for (const { id } of series) {
    if (!id || seriesIds.has(id)) throw new RangeError("StackedBarChart requires unique, nonempty series IDs");
    seriesIds.add(id);
  }
  const bucketIds = new Set<string>();
  for (const bucket of buckets) {
    if (!bucket.id || bucketIds.has(bucket.id)) throw new RangeError("StackedBarChart requires unique, nonempty bucket IDs");
    bucketIds.add(bucket.id);
    const segments = new Set<string>();
    let sum = 0;
    for (const { seriesId, value } of bucket.segments) {
      if (!seriesIds.has(seriesId) || segments.has(seriesId)) {
        throw new RangeError("StackedBarChart segments require distinct, declared series IDs");
      }
      segments.add(seriesId);
      if (isValue(value)) {
        if (value < 0 || value > maxValue) throw new RangeError("StackedBarChart values must lie in [0, maxValue]");
        sum += value;
      }
    }
    if (isValue(bucket.total) && (bucket.total < 0 || bucket.total > maxValue)) {
      throw new RangeError("StackedBarChart totals must lie in [0, maxValue]");
    }
    // Validate, never manufacture, the producer's aggregate. Do not plot a
    // partial stack as a complete total when a segment is missing.
    if (!hasGap(bucket)) {
      const total = bucket.total as number;
      const tolerance = Number.EPSILON * 8 * Math.max(Math.abs(sum), Math.abs(total), Number.MIN_VALUE);
      if (!Number.isFinite(sum) || Math.abs(sum - total) > tolerance) {
        throw new RangeError("StackedBarChart total must match its supplied segments");
      }
    }
  }
}

export function StackedBarChart(props: StackedBarChartProps) {
  const {
    label, series, buckets, maxValue, formatValue, selectedBucketId,
    onSelectionChange, emptyLabel = "No data yet", unavailableLabel = "Not available", className,
  } = props;
  const readoutId = useId();
  const touchInteraction = useRef(false);
  const [pointerBucketId, setPointerBucketId] = useState<string | null>(null);
  const pointerPosition = useRef({ x: 0, y: 0 });
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const positionTooltip = (element: HTMLDivElement) => {
    const viewport = element.ownerDocument.defaultView;
    if (!viewport) return;
    const { width, height } = element.getBoundingClientRect();
    const { x, y } = pointerPosition.current;
    // Flip beside the pointer at viewport edges, then clamp within the window.
    const left = x + 14 + width <= viewport.innerWidth - 8 ? x + 14 : x - width - 14;
    const top = y + 14 + height <= viewport.innerHeight - 8 ? y + 14 : y - height - 14;
    element.style.transform = `translate(${Math.max(8, Math.min(left, viewport.innerWidth - width - 8))}px, ${Math.max(8, Math.min(top, viewport.innerHeight - height - 8))}px)`;
  };
  const trackPointer = (event: { clientX: number; clientY: number }, bucketId: string) => {
    pointerPosition.current = { x: event.clientX, y: event.clientY };
    if (pointerBucketId !== bucketId) setPointerBucketId(bucketId);
    // Pointer movement changes only the overlay transform, not chart rendering.
    if (tooltipRef.current) positionTooltip(tooltipRef.current);
  };
  validate(props);
  const bySeries = new Map(series.map((entry) => [entry.id, entry]));
  const formatted = (value: number | null) => isValue(value) ? formatValue(value) : unavailableLabel;
  const summary = (bucket: StackedBarBucket) => `${bucket.label}: total ${formatted(bucket.total)}`
    + (hasGap(bucket) ? ` — ${unavailableLabel}` : "")
    + (bucket.segments.length ? ` — ${bucket.segments.map((segment) =>
      `${bySeries.get(segment.seriesId)!.label} ${formatted(segment.value)}`).join(", ")}` : "");
  const activeIndex = selectedBucketId === null ? -1 : buckets.findIndex(({ id }) => id === selectedBucketId);
  const activeBucket = activeIndex >= 0 ? buckets[activeIndex] : null;

  // Original stabilized Platform geometry: viewBox scales with the container;
  // a 400px minimum keeps the original narrow-container scroll behavior.
  const marginTop = 12, marginRight = 16, marginBottom = 32, marginLeft = 56;
  const chartHeight = 220;
  const innerHeight = chartHeight - marginTop - marginBottom;
  const barGap = 6;
  const barWidth = Math.max(8, Math.min(36, (720 - marginLeft - marginRight) / Math.max(1, buckets.length) - barGap));
  const viewWidth = Math.max(buckets.length * (barWidth + barGap) + marginLeft + marginRight, 400);
  const denseLabels = buckets.length > 14;

  if (buckets.length === 0) return <p className={className}>{label}: {emptyLabel}</p>;
  return (
    <div className={className} data-stacked-bar-chart="" data-scale="zero">
      <section tabIndex={0} aria-label={`${label} chart`} style={{ overflowX: "auto" }}>
        {/* Do not flatten the interactive subtree with role="img". */}
        <svg aria-label={label} width="100%" viewBox={`0 0 ${viewWidth} ${chartHeight}`}
          style={{ display: "block", minWidth: 400, maxWidth: "100%", maxHeight: 300 }}
          preserveAspectRatio="xMinYMin meet">
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const y = marginTop + innerHeight - fraction * innerHeight;
            return <g key={fraction} aria-hidden="true">
              <line x1={marginLeft} y1={y} x2={viewWidth - marginRight} y2={y}
                stroke="currentColor" strokeDasharray={fraction === 0 ? "0" : "3 3"}
                opacity={fraction === 0 ? 0.4 : 0.2} />
              <text x={marginLeft - 8} y={y} dy="0.32em" textAnchor="end"
                fontSize="11" fill="currentColor" fontFamily="inherit">{formatValue(maxValue * fraction)}</text>
            </g>;
          })}
          {buckets.map((bucket, index) => {
            const x = marginLeft + index * (barWidth + barGap) + barGap / 2;
            const isActive = index === activeIndex;
            const gap = hasGap(bucket);
            const stackHeight = !gap && maxValue > 0 ? (bucket.total as number) / maxValue * innerHeight : 0;
            let yOffset = 0;
            const select = () => onSelectionChange(bucket.id);
            const clear = () => { if (isActive) onSelectionChange(null); };
            return (
              <g key={bucket.id} role="button" tabIndex={0} data-bucket-id={bucket.id}
                data-gap={gap || undefined} aria-label={summary(bucket)}
                aria-describedby={isActive ? readoutId : undefined}
                onPointerEnter={(event) => {
                  touchInteraction.current = event.pointerType === "touch";
                  if (!touchInteraction.current) { trackPointer(event, bucket.id); select(); }
                }}
                onPointerLeave={() => {
                  if (!touchInteraction.current) { setPointerBucketId(null); clear(); }
                }}
                onPointerDown={(event) => {
                  touchInteraction.current = event.pointerType === "touch";
                  if (touchInteraction.current) setPointerBucketId(null);
                }}
                onPointerMove={(event) => {
                  touchInteraction.current = event.pointerType === "touch";
                  if (!touchInteraction.current) {
                    trackPointer(event, bucket.id);
                    if (selectedBucketId !== bucket.id) select();
                  }
                }}
                onMouseEnter={(event) => {
                  if (!touchInteraction.current) {
                    trackPointer(event, bucket.id);
                    select();
                  }
                }}
                onMouseMove={(event) => { if (!touchInteraction.current) {
                    trackPointer(event, bucket.id);
                    if (selectedBucketId !== bucket.id) select();
                  } }}
                onMouseLeave={() => {
                  if (!touchInteraction.current) {
                    setPointerBucketId(null);
                    clear();
                  }
                }}
                onFocus={select} onBlur={clear} onClick={select}
                onKeyDown={(event) => {
                  setPointerBucketId(null);
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    select(); // Select, never toggle after focus/hover/tap.
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    clear();
                  }
                }}
                style={{ cursor: "pointer" }}>
                {/* Full-height hit area; selection highlight follows the stack. */}
                <rect data-hit-target="" x={x} y={marginTop} width={barWidth}
                  height={innerHeight} fill="transparent" stroke="none" rx={3} />
                {!gap && bucket.segments.map((segment, segmentIndex) => {
                  const height = maxValue > 0 ? (segment.value as number) / maxValue * innerHeight : 0;
                  const y = marginTop + innerHeight - yOffset - height;
                  yOffset += height;
                  return <rect key={segment.seriesId} data-series-id={segment.seriesId}
                    x={x} y={y} width={barWidth} height={Math.max(height, height > 0 ? 1 : 0)}
                    rx={segmentIndex === bucket.segments.length - 1 ? 3 : 0}
                    fill={bySeries.get(segment.seriesId)!.color} opacity={isActive ? 1 : 0.92}
                    pointerEvents="none" />;
                })}
                {gap && <text x={x + barWidth / 2} y={marginTop + innerHeight - 4}
                  textAnchor="middle" fill="currentColor" aria-hidden="true" pointerEvents="none">—</text>}
                {isActive && <rect data-selection="" x={x}
                  y={marginTop + innerHeight - Math.max(1, stackHeight)} width={barWidth}
                  height={Math.max(1, stackHeight)} fill="none" stroke="currentColor"
                  strokeWidth={1.5} rx={3} pointerEvents="none" />}
                <text x={x + barWidth / 2} y={chartHeight - marginBottom + 16}
                  textAnchor={denseLabels ? "end" : "middle"} fontSize="10"
                  fill="currentColor" fontFamily="inherit" pointerEvents="none" aria-hidden="true"
                  transform={denseLabels ? `rotate(-40, ${x + barWidth / 2}, ${chartHeight - marginBottom + 16})` : undefined}>
                  {bucket.label}
                </text>
              </g>
            );
          })}
        </svg>
      </section>
      {activeBucket && pointerBucketId === activeBucket.id && !touchInteraction.current && (
        <div data-chart-tooltip="" role="tooltip" aria-hidden="true" popover="manual"
          ref={(element) => {
            tooltipRef.current = element;
            if (element) {
              // Native popovers escape clipping and transformed containing blocks.
              // The fixed-position fallback supports browsers without popovers.
              if (typeof element.showPopover === "function") element.showPopover();
              positionTooltip(element);
            }
          }}
          style={{
            position: "fixed", inset: "auto", margin: 0, left: 0, top: 0, zIndex: 1000, pointerEvents: "none",
            width: "max-content", maxWidth: "min(280px, calc(100vw - 16px))",
            padding: "10px 12px", borderRadius: "var(--radius-md, 8px)",
            background: "var(--md3-surface-container-highest, #3b3b3b)",
            color: "var(--md3-on-surface, #e6e6e6)",
            border: "1px solid var(--md3-outline-variant, #4c4c4c)",
            fontFamily: "inherit", fontSize: "0.75rem", lineHeight: 1.5,
            overflowWrap: "anywhere",
          }}>
          <strong>{activeBucket.label}</strong>
          <div>Total {formatted(activeBucket.total)}</div>
          {activeBucket.segments.map((segment) => (
            <div key={segment.seriesId}>{bySeries.get(segment.seriesId)!.label}: {formatted(segment.value)}</div>
          ))}
        </div>
      )}
      {/* The persistent readout and table expose full values to keyboard and
          touch users; the pointer overlay repeats them without another announcement. */}
      <div id={readoutId} role="status" aria-live="polite" aria-atomic="true">
        {activeBucket ? summary(activeBucket) : "Hover, tap, or focus a bar to see its breakdown."}
      </div>
      <details>
        <summary>View data</summary>
        <table>
          <caption>{label}</caption>
          <thead><tr><th scope="col">Bucket</th><th scope="col">Series</th><th scope="col">Value</th></tr></thead>
          <tbody>{buckets.map((bucket) => <Fragment key={bucket.id}>
            <tr><th scope="row">{bucket.label}</th><td>Total</td><td>{formatted(bucket.total)}</td></tr>
            {bucket.segments.map((segment) => <tr key={segment.seriesId}>
              <th scope="row">{bucket.label}</th><td>{bySeries.get(segment.seriesId)!.label}</td><td>{formatted(segment.value)}</td>
            </tr>)}
          </Fragment>)}</tbody>
        </table>
      </details>
    </div>
  );
}
