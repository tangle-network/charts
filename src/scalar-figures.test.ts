import { describe, expect, it } from "vitest";
import { metricBars } from "./metric-bars.js";
import { timeSeries } from "./time-series.js";
import { isRefusal, type Figure, type Interval } from "./types.js";

function figure(value: ReturnType<typeof metricBars>): Figure {
  if (isRefusal(value)) throw new Error(value.refused);
  return value;
}
const bars = { measure: "mean composite score", unit: "score", domain: [0, 1] as [number, number] };
const trajectory = { x: { label: "shot", domain: [1, 4] as [number, number] }, y: { label: "mean composite score", unit: "score", domain: [0, 1] as [number, number] } };
const interval: Interval = { lower: 0.1, upper: 0.4, level: 0.95, method: "task-cluster-bootstrap" };

describe("recorded scalar bars", () => {
  it("preserves input order, observed zero and missingness without positive minimums or ranks", () => {
    const f = figure(metricBars([
      { id: "zero", label: "Observed zero", value: 0, observations: { count: 13, label: "tasks" } },
      { id: "missing", label: "No fair attempts", value: null, observations: { count: 0, label: "tasks" } },
      { id: "low", label: "Small observed score", value: 0.01, observations: { count: 2, label: "tasks" } },
    ], bars));
    expect(f.svg.wide.match(/class="tgc-vertical-bar"/g)).toHaveLength(1);
    expect(f.svg.wide).toContain('height="2.6"');
    expect(f.table).toContain('0 score');
    expect(f.table).toContain('not measured');
    expect(f.table.indexOf('Observed zero')).toBeLessThan(f.table.indexOf('No fair attempts'));
    expect(f.table.indexOf('No fair attempts')).toBeLessThan(f.table.indexOf('Small observed score'));
    expect(f.svg.wide).not.toContain('rank ');
    expect(f.svg.wide).not.toContain('tgc-whisker');
    expect(f.svg.wide).toContain('mean composite score: 0 score · 13 tasks');
  });
  it("keeps tiny recorded values distinct from zero and full values in accessible data", () => {
    const f = figure(metricBars([{ id: "a", label: "A", value: 1e-9, observations: { count: 13, label: "tasks" } }], bars));
    expect(f.table).toContain("1e-9 score");
    expect(f.svg.wide).toContain("mean composite score: 1e-9 score");
    const full = figure(metricBars([{ id: "a", label: "A", value: 0.1234567890123456 }], bars));
    expect(full.table).toContain("0.1234567890123456 score");
    expect(full.svg.wide).toContain("mean composite score: 0.1234567890123456 score");
    expect(full.svg.wide).toContain("…");
  });
  it("draws only the supplied interval, preserving bounds and method in data", () => {
    const f = figure(metricBars([{ id: "a", label: "A", value: 0.25, interval, observations: { count: 13, label: "tasks" } }], bars));
    expect(f.table).toContain('0.1 score–0.4 score (95% task-clustered bootstrap)');
    expect(f.svg.wide).toContain('y1="276"');
    expect(f.svg.wide).toContain('y2="198"');
  });
  it.each([-0.01, 1.01, Infinity, NaN])("refuses out-of-domain value %s instead of clamping", (value) => {
    expect(isRefusal(metricBars([{ id: "a", label: "A", value }], bars))).toBe(true);
  });
  it("refuses measured values with zero observations, malformed intervals and duplicate ids", () => {
    expect(isRefusal(metricBars([{ id: "a", label: "A", value: 0, observations: { count: 0, label: "tasks" } }], bars))).toBe(true);
    expect(isRefusal(metricBars([{ id: "a", label: "A", value: null, interval }], bars))).toBe(true);
    expect(isRefusal(metricBars([{ id: "a", label: "A", value: 0.2, interval: { ...interval, upper: 1.1 } }], bars))).toBe(true);
    expect(isRefusal(metricBars([{ id: "a", label: "A", value: 0 }, { id: "a", label: "B", value: 1 }], bars))).toBe(true);
    expect(isRefusal(metricBars([{ id: "a", label: "A", value: 0 }], { ...bars, domain: [0.1, 1] }))).toBe(true);
  });
  it("preserves fractional recorded confidence without rounding to 100%", () => {
    for (const [level, label] of [[0.999, "99.9%"], [0.955, "95.5%"], [1e-7, "0.00001%"]] as const) {
      const f = figure(metricBars([{ id: "a", label: "A", value: 0.25, interval: { ...interval, level } }], bars));
      expect(f.table).toContain(`${label} task-clustered bootstrap`);
      expect(f.svg.wide).toContain(`${label} task-clustered bootstrap`);
      expect(f.table).not.toContain("100%");
    }
  });
  it("refuses a serialized unsupported interval method without accepting prototype keys", () => {
    const row = JSON.parse(JSON.stringify({ id: "a", label: "A", value: 0.25, interval: { ...interval, method: "toString" } }));
    expect(isRefusal(metricBars([row], bars))).toBe(true);
  });
  it("wraps long identities while retaining their full accessible facts and escapes markup", () => {
    const label = 'Long model identity '.repeat(12) + '<script>bad</script>';
    const f = figure(metricBars([{ id: "a", label, value: 0.2 }], { ...bars, identities: { a: { model: { label, src: '/assets/model.svg' } } } }));
    expect(f.svg.narrow).toContain('min-width:176px');
    expect(f.svg.narrow).toContain('&lt;script&gt;bad&lt;/script&gt;');
    expect(f.svg.narrow).not.toContain('<script>');
    if (f.svg.narrow === null) throw new Error("Missing narrow scalar render");
    expect(f.svg.narrow.match(/<tspan/g)!.length).toBeGreaterThan(1);
    expect(isRefusal(metricBars([{ id: "a", label: "A", value: 0.2 }], { ...bars, identities: { a: { model: { label: 'A', src: 'javascript:alert(1)' } } } }))).toBe(true);
  });
});

describe("recorded scalar trajectories", () => {
  it("breaks every explicit gap, preserves zero and per-shot observation counts", () => {
    const f = figure(timeSeries([{ id: "a", label: "A", points: [
      { x: 1, y: 0, observations: { count: 3, label: "tasks" } },
      { x: 2, y: null, observations: { count: 0, label: "tasks" } },
      { x: 3, y: 0.5, observations: { count: 2, label: "tasks" } },
      { x: 4, y: 0.75, observations: { count: 1, label: "tasks" }, annotation: 'all checks passed' },
    ] }], trajectory));
    expect(f.svg.wide.match(/<polyline/g)).toHaveLength(1);
    expect(f.svg.wide).toContain('points="485.33,148 696,92"');
    expect(f.svg.wide).toContain('cy="260"');
    expect(f.svg.wide).toContain('shot: 1 · mean composite score: 0 score · 3 tasks');
    expect(f.table).toContain('not measured');
    expect(f.table).toContain('0 tasks');
    expect(f.table).toContain('all checks passed');
    expect(f.svg.wide).not.toContain('tgc-threshold');
    expect(f.svg.wide).not.toContain('tgc-whisker');
  });
  it("never joins two isolated observations across multiple gaps", () => {
    const f = figure(timeSeries([{ id: "a", label: "A", points: [{ x: 1, y: 0.4 }, { x: 2, y: null }, { x: 3, y: null }, { x: 4, y: 0.8 }] }], trajectory));
    expect(f.svg.wide).not.toContain('<polyline');
    expect(f.svg.wide.match(/class="tgc-series-point"/g)).toHaveLength(2);
  });
  it.each([[1, 1], [2, 1], [1, Infinity], [0, 2]])("refuses duplicate, nonordered or invalid x %s,%s", (first, second) => {
    expect(isRefusal(timeSeries([{ id: "a", label: "A", points: [first, second].map((x) => ({ x, y: 0.1 })) }], trajectory))).toBe(true);
  });
  it("refuses invalid y and zero-count measured observations", () => {
    expect(isRefusal(timeSeries([{ id: "a", label: "A", points: [{ x: 1, y: 1.1 }] }], trajectory))).toBe(true);
    expect(isRefusal(timeSeries([{ id: "a", label: "A", points: [{ x: 1, y: 0, observations: { count: 0, label: 'tasks' } }] }], trajectory))).toBe(true);
  });
  it("keeps each series identity, recorded intervals and escaped annotations in hover and table", () => {
    const f = figure(timeSeries([{ id: "a", label: '<b>A</b>', points: [{ x: 1, y: 0.25, interval, observations: { count: 13, label: 'tasks' }, annotation: '<img src=x>' }] }], trajectory));
    expect(f.svg.wide).toContain('&lt;b&gt;A&lt;/b&gt;');
    expect(f.svg.wide).toContain('&lt;img src=x&gt;');
    expect(f.svg.wide).toContain('tabindex="0"');
    expect(f.table).toContain('95% task-clustered bootstrap');
    expect(f.svg.wide).toContain('class="tgc-whisker"');
  });
});
