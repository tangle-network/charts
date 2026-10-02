/**
 * Port of agent-app/src/web-react/sparkline.tsx at
 * a8947683a050394d13848bb7e4cbbe7cf08d208e. No UI or chart-library dependency.
 *
 * This glyph scales to the OBSERVED EXTENT, not zero. The sample index is the
 * x axis; missing samples retain their positions and break the stroke. A lone
 * reading is a point, equal readings sit at mid-height, and negatives are not
 * clamped. It is deliberately not animated or interactive.
 */
import type { CSSProperties, ReactElement } from "react";

export type SparklineDirection = "rising" | "falling" | "flat";
export type SparklineValues = readonly (number | null)[];
export interface SparklinePoint {
  readonly x: number;
  readonly y: number;
}
export interface SparklineGeometry {
  readonly readings: readonly number[];
  readonly points: readonly SparklinePoint[];
  /** One run per set of consecutive, finite samples. */
  readonly segments: readonly (readonly SparklinePoint[])[];
  readonly gaps: number;
  readonly min: number;
  readonly max: number;
  readonly first: number;
  readonly last: number;
  readonly direction: SparklineDirection;
}
export interface SparklineGeometryOptions {
  width?: number;
  height?: number;
  inset?: number;
}
export const DEFAULT_SPARKLINE_WIDTH = 96;
export const DEFAULT_SPARKLINE_HEIGHT = 24;
export const DEFAULT_SPARKLINE_LABEL = "Trend";
export const DEFAULT_SPARKLINE_EMPTY_LABEL = "No history yet";
export const DEFAULT_SPARKLINE_UNAVAILABLE_LABEL = "No readings available";
const DEFAULT_INSET = 2.5;
const STROKE_WIDTH = 1.5;
const DOT_RADIUS = 1.75;
const NUMBER_FORMAT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const hidden: CSSProperties = {
  position: "absolute", width: 1, height: 1, padding: 0, margin: -1,
  overflow: "hidden", clipPath: "inset(50%)", whiteSpace: "nowrap", border: 0,
};

export function formatSparklineValue(value: number): string {
  return NUMBER_FORMAT.format(value);
}
function isReading(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
export function sparklineReadings(values: SparklineValues): number[] {
  return values.filter(isReading);
}
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function sparklineGeometry(
  values: SparklineValues,
  { width = DEFAULT_SPARKLINE_WIDTH, height = DEFAULT_SPARKLINE_HEIGHT, inset = DEFAULT_INSET }: SparklineGeometryOptions = {},
): SparklineGeometry {
  if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(inset)
    || width <= 0 || height <= 0 || inset < 0 || inset * 2 > Math.min(width, height)) {
    throw new RangeError("Sparkline requires finite positive dimensions and an inset inside the viewBox");
  }
  const plotted: Array<{ index: number; value: number }> = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (isReading(value)) plotted.push({ index, value });
  }
  const readings = plotted.map(({ value }) => value);
  const gaps = values.length - readings.length;
  if (readings.length === 0) {
    return { readings, points: [], segments: [], gaps, min: 0, max: 0, first: 0, last: 0, direction: "flat" };
  }
  // Do not spread a long series into Math.min/Math.max (argument limit).
  let min = readings[0];
  let max = readings[0];
  for (const value of readings) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const first = readings[0];
  const last = readings[readings.length - 1];
  const span = max - min;
  const points = plotted.map(({ index, value }) => {
    // Divide before multiplying pixels; halve only when the finite extrema's
    // difference overflows. Ordinary agent-app geometry remains unchanged.
    const fraction = span === 0 ? 0.5 : Number.isFinite(span)
      ? (value - min) / span : (value / 2 - min / 2) / (max / 2 - min / 2);
    return {
      x: round(values.length <= 1 ? width / 2 : inset + ((width - 2 * inset) * index) / (values.length - 1)),
      y: round(height - inset - (height - 2 * inset) * fraction),
    };
  });
  const segments: SparklinePoint[][] = [];
  let run: SparklinePoint[] = [];
  let previous = Number.NEGATIVE_INFINITY;
  plotted.forEach(({ index }, position) => {
    if (index !== previous + 1 && run.length > 0) {
      segments.push(run);
      run = [];
    }
    run.push(points[position]);
    previous = index;
  });
  if (run.length > 0) segments.push(run);
  return { readings, points, segments, gaps, min, max, first, last,
    direction: last > first ? "rising" : last < first ? "falling" : "flat" };
}

export function sparklinePointsAttribute(points: readonly SparklinePoint[]): string {
  return points.map(({ x, y }) => `${x},${y}`).join(" ");
}
export interface SparklineLabelOptions {
  label?: string;
  format?: (value: number) => string;
}
export function sparklineLabel(
  values: SparklineValues,
  { label = DEFAULT_SPARKLINE_LABEL, format = formatSparklineValue }: SparklineLabelOptions = {},
): string {
  const { readings, gaps, min, max, first, last, direction } = sparklineGeometry(values);
  const missing = gaps === 0 ? "" : `, ${gaps} not available`;
  if (readings.length === 0) return gaps === 0 ? `${label}: no readings yet` : `${label}: no readings${missing}`;
  if (readings.length === 1) return `${label}: one reading${missing}, ${format(first)}`;
  if (max === min) return `${label}: ${readings.length} readings${missing}, unchanged at ${format(first)}`;
  const movement = direction === "flat" ? "net unchanged" : direction;
  return `${label}: ${readings.length} readings${missing}, range ${format(min)} to ${format(max)}, `
    + `${movement} from ${format(first)} to ${format(last)}`;
}
export interface SparklineProps extends SparklineLabelOptions {
  values: SparklineValues;
  width?: number;
  height?: number;
  emptyLabel?: string;
  unavailableLabel?: string;
  className?: string;
}
export function Sparkline({
  values, label = DEFAULT_SPARKLINE_LABEL, format = formatSparklineValue,
  width = DEFAULT_SPARKLINE_WIDTH, height = DEFAULT_SPARKLINE_HEIGHT,
  emptyLabel = DEFAULT_SPARKLINE_EMPTY_LABEL,
  unavailableLabel = DEFAULT_SPARKLINE_UNAVAILABLE_LABEL, className,
}: SparklineProps): ReactElement {
  const geometry = sparklineGeometry(values, { width, height });
  const accessibleName = sparklineLabel(values, { label, format });
  if (geometry.points.length === 0) {
    return (
      <span data-sparkline={geometry.gaps > 0 ? "unavailable" : "empty"}
        className={className}>
        <span style={hidden}>{accessibleName}</span>
        <span aria-hidden="true">{geometry.gaps > 0 ? unavailableLabel : emptyLabel}</span>
      </span>
    );
  }
  const drawsLine = geometry.segments.some((segment) => segment.length > 1);
  const end = geometry.points[geometry.points.length - 1];
  return (
    <svg role="img" aria-label={accessibleName} data-scale="extent"
      data-sparkline={drawsLine ? "line" : "point"} data-direction={geometry.direction}
      data-gaps={geometry.gaps > 0 ? geometry.gaps : undefined}
      width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      className={className} focusable="false">
      <desc>{Array.from(values, (value, index) =>
        `Sample ${index + 1}: ${isReading(value) ? format(value) : "not available"}`).join("; ")}</desc>
      {geometry.segments.map((segment, index) => {
        if (segment.length > 1) return (
          <polyline key={`segment-${index}`} points={sparklinePointsAttribute(segment)}
            fill="none" stroke="currentColor" strokeWidth={STROKE_WIDTH}
            strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        );
        const only = segment[0];
        if (only.x === end.x && only.y === end.y) return null;
        return <circle key={`segment-${index}`} cx={only.x} cy={only.y} r={DOT_RADIUS} fill="currentColor" />;
      })}
      <circle cx={end.x} cy={end.y} r={DOT_RADIUS} fill="currentColor" />
    </svg>
  );
}
