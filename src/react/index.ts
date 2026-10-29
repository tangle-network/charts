// Optional React entrypoint. Never re-export this module from ../index.ts.
export {
  Sparkline, sparklineGeometry, sparklineReadings, sparklineLabel,
  sparklinePointsAttribute, formatSparklineValue,
  DEFAULT_SPARKLINE_WIDTH, DEFAULT_SPARKLINE_HEIGHT, DEFAULT_SPARKLINE_LABEL,
  DEFAULT_SPARKLINE_EMPTY_LABEL, DEFAULT_SPARKLINE_UNAVAILABLE_LABEL,
} from "./sparkline.js";
export type {
  SparklineProps, SparklineValues, SparklineDirection, SparklinePoint,
  SparklineGeometry, SparklineGeometryOptions, SparklineLabelOptions,
} from "./sparkline.js";
export { StackedBarChart } from "./stacked-bar-chart.js";
export type {
  StackedBarChartProps, StackedBarBucket, StackedBarSegment, StackedBarSeries,
} from "./stacked-bar-chart.js";
export {
  WaterfallTimeAxis, WaterfallBar, WaterfallRow, WaterfallHeader,
  waterfallSpanGeometry, waterfallTicks, formatWaterfallDuration,
} from "./waterfall.js";
export type {
  WaterfallWindow, WaterfallSpanGeometry, WaterfallTimeAxisProps,
  WaterfallBarProps, WaterfallRowProps, WaterfallHeaderProps,
} from "./waterfall.js";
export { DayBars, Events, HBars, Histogram, Lines, Meter, Spark, Gantt, LIVE_SERIES, formatCompact } from "./live.js";
export { Gap } from "./gap.js";
export type { GapBand, GapProps } from "./gap.js";
export type { LineSeries, MeterSegment } from "./live.js";
export { FigureView } from "./figure-view.js";
export type { FigureAtWidth, FigureViewProps } from "./figure-view.js";
export { TimelineView } from "./timeline-view.js";
export { DOT_MAP_CATEGORIES, DotMap } from "./dot-map.js";
export type { DotMapLabel, DotMapProps, DotMapRect } from "./dot-map.js";
export type { TimelineViewProps } from "./timeline-view.js";
// Shapes shared with the static figures; type-only, so the static root stays React-free and vice versa.
export type { BandKind, ChartBand, ChartMark, MarkKind, MarkVerdict } from "../events.js";
export type { TickOutcome, TimelineLane, TimelineOptions, TimelineSpan, TimelineTick } from "../timeline.js";
export type { MarkerShape } from "../svg.js";
export type { XCategory, YScale, YTarget, YTick } from "../axis.js";
export type { PointFields, PointGlyph } from "../points.js";
export type { Figure, Refusal } from "../types.js";

export { FlowWaterfall } from "./flow-waterfall.js";
export type { FlowWaterfallProps } from "./flow-waterfall.js";
export type { ViewWindow as FlowWaterfallWindow } from "./flow-waterfall-time.js";
export { criticalPathIds, flowWaterfallRows } from "./flow-waterfall-model.js";
export type { FlowWaterfallRow } from "./flow-waterfall-model.js";

export { toolGlyph } from './flow-waterfall-icons.js'

export { AgentGraph, type AgentGraphProps } from "./agent-graph/AgentGraph";
export type { AgentGraphNode, AgentGraphEdge, AgentGraphEvent, AgentGraphStatus, AgentGraphDirection, AgentGraphEdgeKind } from "./agent-graph/agent-graph-layout";
export type { AgentGraphTool, AgentGraphCall, AgentGraphCallKind } from "./agent-graph/agent-hub-layout";
export * as agentGraph from "./agent-graph/index";
