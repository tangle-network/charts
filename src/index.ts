export { type RenderFigureOptions, renderFigure, renderNotes, renderRefusals } from "./block.js";
export { type BreakdownOptions, breakdown } from "./breakdown.js";
export { type ComparisonIntervalsOptions, comparisonIntervals } from "./comparison-intervals.js";
export { type CostFrontierOptions, costFrontier } from "./cost-frontier.js";
export { chartTokensCss, figureCss } from "./css.generated.js";
export { rateOrder } from "./format.js";
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
export { type Observations } from "./scalar.js";
