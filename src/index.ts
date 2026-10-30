export { type RenderFigureOptions, renderFigure, renderNotes, renderRefusals } from "./block.js";
export { type BreakdownOptions, breakdown } from "./breakdown.js";
export { heatmap, type HeatmapCell, type HeatmapColumn, type HeatmapOptions, type HeatmapRow, type HeatmapStatus } from "./heatmap.js";
export { latencyRange, type LatencyRangeOptions, type LatencyRangeRow } from "./latency-range.js";
export { phaseWaterfall, type PhaseWaterfallOptions, type WaterfallPhase } from "./phase-waterfall.js";
export { type ComparisonIntervalsOptions, comparisonIntervals } from "./comparison-intervals.js";
export { type CostFrontierOptions, costFrontier } from "./cost-frontier.js";
export { chartTokensCss, figureCss } from "./css.generated.js";
export { duration, formatSpanDuration, formatCost, formatCount, formatCompact, formatClock, formatUtcTime, rateOrder } from "./format.js";
export { type RateIdentity } from "./identity.js";
export { type RankedRatesOptions, rankedRates } from "./ranked-rates.js";
export { type TaskMatrixOptions, taskMatrix } from "./task-matrix.js";
export {
  type BreakdownInput,
  type ComparisonRow,
  type CostBasis,
  type Estimate,
  type Exclusion,
  type Figure,
  type Interval,
  type IntervalMethod,
  isRefusal,
  type MatrixCell,
  type RateRow,
  type Refusal,
  type Setup,
  type Tier,
  type TierCounts,
} from "./types.js";

export { metricBars, type MetricBarsOptions, type MetricRow } from "./metric-bars.js";
export { timeSeries, type TimePoint, type TimeSeriesOptions, type TimeSeriesRow } from "./time-series.js";
export { type XCategory, type YScale, type YTarget, type YTick } from "./axis.js";
export { type PointFields, type PointGlyph } from "./points.js";
export { CHECKER_HUES, checkerColor, ENDING_COLORS, ENDING_ORDER, OUTCOME_COLORS, OUTCOME_ORDER } from "./outcomes.js";
export type { RunEnding } from "./outcomes.js";
export { type BandKind, type ChartBand, type ChartMark, type MarkKind, type MarkVerdict } from "./events.js";
export { type TickOutcome, timeline, type TimelineLane, type TimelineOptions, type TimelineSpan, type TimelineTick } from "./timeline.js";
export { type MultiplePanel, smallMultiples, type SmallMultiplesOptions } from "./small-multiples.js";
export { type Observations } from "./scalar.js";
export { type DotGroup, type DotGroupRect, type UnitDotLayout, unitDotLayout, type UnitDotOptions } from "./unit-dots.js";

export { reportedCount, sumReportedCounts, type FlowMarker, type FlowOutcome, type FlowSpan, type FlowTrace } from "./flow-trace.js";
export { catalogPrice, otlpFlowTrace, type OtlpSpan, type OtlpTraceOptions, parseOtlpJsonl } from "./otlp-trace.js";
