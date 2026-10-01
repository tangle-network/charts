/** Scalar bars preserve input order and draw only producer-recorded values and intervals. */
import { identityGap, type RateIdentity } from "./identity.js";
import { domainGap, observationLabel, type Observations, scalarGap, scalarIntervalLabel, scalarLabel } from "./scalar.js";
import { NARROW, WIDE } from "./svg.js";
import { table } from "./table.js";
import { capitalize } from "./text.js";
import type { Figure, Interval, Refusal } from "./types.js";
import { verticalColumns } from "./vertical-columns.js";

export interface MetricRow {
  id: string;
  label: string;
  value: number | null;
  interval?: Interval | null;
  observations?: Observations;
}

export interface MetricBarsOptions {
  measure: string;
  unit: string;
  /** Zero is the baseline; out-of-domain values are refused rather than clipped. */
  domain: [number, number];
  formatValue?: (value: number) => string;
  identities?: Readonly<Record<string, RateIdentity>>;
  id?: string;
}

export function metricBars(rows: MetricRow[], o: MetricBarsOptions): Figure | Refusal {
  const id = o.id ?? "metric-bars";
  const gap = domainGap(o.domain);
  if (gap) return { id, refused: gap };
  if (o.domain[0] !== 0) return { id, refused: "Bars require a zero baseline." };
  if (!rows.length) return { id, refused: `No ${o.measure} recorded.` };
  if (new Set(rows.map((row) => row.id)).size !== rows.length) return { id, refused: "Duplicate scalar row ids." };
  const identityProblem = identityGap(rows, o.identities);
  if (identityProblem) return { id, refused: identityProblem };
  for (const row of rows) {
    const problem = scalarGap(row.value, row.interval, row.observations, o.domain);
    if (problem) return { id, refused: `${row.label}: ${problem}` };
  }
  const label = (value: number) => scalarLabel(value, o.unit, o.formatValue);
  const columns = rows.map((row) => ({
    id: row.id,
    label: row.label,
    value: row.value,
    valueLabel: row.value === null ? "not measured" : label(row.value),
    interval: row.interval ?? null,
    identity: o.identities?.[row.id],
    facts: [row.label, `${o.measure}: ${row.value === null ? "not measured" : label(row.value)}`, observationLabel(row.observations), ...(row.interval ? [`Interval: ${scalarIntervalLabel(row.interval, o.unit, o.formatValue)}`] : [])],
  }));
  const measured = rows.filter((row) => row.value !== null);
  return {
    id,
    finding: `${capitalize(o.measure)} by setup.`,
    lede: `${measured.length} of ${rows.length} recorded values.`,
    read: "Bars start at zero. Missing values have no bar; whiskers show recorded intervals. Input order is preserved.",
    svg: { wide: verticalColumns(columns, WIDE, o.measure, o.domain, (value) => scalarLabel(value, "", o.formatValue), true), narrow: verticalColumns(columns, NARROW, o.measure, o.domain, (value) => scalarLabel(value, "", o.formatValue), true), interactive: true },
    table: table(`${capitalize(o.measure)} by setup`, [{ label: "Setup" }, { label: o.measure, numeric: true }, { label: "Observations" }, { label: "Recorded interval" }], rows.map((row) => [row.label, row.value === null ? "not measured" : label(row.value), observationLabel(row.observations), scalarIntervalLabel(row.interval, o.unit, o.formatValue)])).replace('class="tgc-table"', 'class="tgc-table tgc-scalar-table"'),
    note: { method: "Recorded scalar values, in input order. No rank, interval or statistical comparison is inferred.", n: rows.map((row) => `${row.label}: ${observationLabel(row.observations)}`).join("; "), exclusions: rows.filter((row) => row.value === null).map((row) => `${row.label}: not measured.`) },
  };
}
