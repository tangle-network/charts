import { describe, expect, it } from "vitest";
import { heatmap, isRefusal, latencyRange, metricBars, phaseWaterfall, timeSeries } from "./index.js";

describe("operational latency figures", () => {
  it("keeps every measured and missing matrix cell visible, including a measured zero", () => {
    const figure = heatmap([{ id: "create", label: "Create cold" }, { id: "resume", label: "Resume" }], [
      { id: "pi", label: "pi", cells: [{ status: "pass", value: 0 }, { status: "no-data", value: null }] },
      { id: "codex", label: "codex", cells: [{ status: "breach", value: 29 }, { status: "pass", value: 3.5 }] },
    ], { measure: "p95 latency", unit: "s", statusRule: "5 s SLO" });
    expect(isRefusal(figure)).toBe(false);
    if (isRefusal(figure)) return;
    expect(figure.svg.wide).toContain("tgc-heat-breach");
    expect(figure.svg.narrow).toContain("Create cold");
    expect(figure.table).toContain("0 s · pass");
    expect(figure.table).toContain("No data");
    expect(figure.note.exclusions).toContain("1 cells have no data.");
  });

  it("refuses a measured state without a value and a missing state with a value", () => {
    const columns = [{ id: "a", label: "A" }];
    const options = { measure: "latency", unit: "s", statusRule: "5 s SLO" };
    for (const cell of [{ status: "pass" as const, value: null }, { status: "no-data" as const, value: 0 }]) {
      expect(isRefusal(heatmap(columns, [{ id: "r", label: "R", cells: [cell] }], options))).toBe(true);
    }
  });

  it("draws p50 and p95 with their confidence bands and every fact on hover", () => {
    const rows = [
      { id: "fast", label: "Fast", p50Ms: 49, p95Ms: 57, n: 100 },
      { id: "tangle", label: "Tangle", p50Ms: 5161, p95Ms: 14388, n: 100 },
    ];
    const banded = rows.map((r) => ({ ...r, p50Band: [r.p50Ms * 0.9, r.p50Ms * 1.1] as const, p95Band: [r.p95Ms! * 0.9, r.p95Ms! * 1.1] as const, facts: ["Failed: 1 of 30"] }));
    const figure = latencyRange(banded, { measure: "time to interactive", minN: 1, width: 436 });
    expect(isRefusal(figure)).toBe(false);
    if (isRefusal(figure)) return;
    expect(figure.svg.wide).toContain('width="436"');
    expect(figure.svg.wide).toContain("tgc-row-band");
    expect(figure.svg.wide).toContain("tgc-row-band-p95");
    expect(figure.svg.wide).toContain("Failed");
    expect(isRefusal(latencyRange([{ ...banded[0]!, p50Band: [1, 2] }], { measure: "time", minN: 1 }))).toBe(true);
  });

  it("draws a single value when too few samples support a p95", () => {
    const figure = latencyRange([{ id: "a", label: "A", p50Ms: 11_000, p95Ms: null, n: 1 }], { measure: "first text", minN: 1, scale: "linear" });
    expect(isRefusal(figure)).toBe(false);
  });

  it("draws p50, p95, and an SLO, and refuses underpowered rows", () => {
    const options = { measure: "create latency", sloMs: 5000, minN: 5 };
    const rows = [{ id: "a", label: "A", p50Ms: 3000, p95Ms: 6500, n: 9 }];
    const figure = latencyRange(rows, options);
    expect(isRefusal(figure)).toBe(false);
    if (isRefusal(figure)) return;
    expect(figure.svg.wide).toContain("tgc-range-dot-breach");
    expect(figure.svg.wide).toContain("tgc-threshold");
    expect(figure.read).toContain("95% confidence interval");
    expect(figure.table).toContain("6.5s");
    expect(isRefusal(latencyRange([{ ...rows[0]!, n: 4 }], options))).toBe(true);
    expect(isRefusal(latencyRange([{ ...rows[0]!, p95Ms: 2000 }], options))).toBe(true);
    expect(isRefusal(latencyRange([{ ...rows[0]!, p50Ms: 0 }], options))).toBe(true);
  });

  it("preserves phase order and accounts for the unexplained tail", () => {
    const figure = phaseWaterfall([{ id: "a", label: "Route", ms: 20 }, { id: "b", label: "Restore", ms: 60, kind: "unaccounted" }], { measure: "create", totalMs: 100 });
    expect(isRefusal(figure)).toBe(false);
    if (isRefusal(figure)) return;
    expect(figure.table).toMatch(/Route[\s\S]*Restore[\s\S]*Unassigned remainder/);
    expect(figure.svg.wide).toContain("tgc-waterfall-unaccounted");
    expect(figure.lede).toContain("0.06 s producer-labelled unaccounted and 0.02 s unassigned remainder");
    expect(isRefusal(phaseWaterfall([{ id: "a", label: "A", ms: 101 }], { measure: "create", totalMs: 100 }))).toBe(true);
  });

  it("fits a dashboard cell: whole names, a tooltip that holds its facts, and a shorter trend", () => {
    const names = ["OpenCode", "OpenClaw", "Factory Droid", "Prime Agent", "Kimi Code", "Claude Code", "Hermes", "Codex", "ACP", "Pi"];
    const columns = metricBars(names.map((label, i) => ({ id: label, label, value: i + 1, observations: { count: 5, label: "runs" }, interval: { lower: i, upper: i + 2, level: 0.95, method: "student-t" as const } })), { measure: "MB", unit: "", domain: [0, 20], width: 667 });
    if (isRefusal(columns)) throw new Error(columns.refused);
    for (const svg of [columns.svg.wide, columns.svg.narrow]) {
      expect(svg).not.toContain("\u2026");
      expect(svg).toContain("OpenCode");
    }
    const tip = /class="tgc-column-tip"[^>]*>.*?<rect[^>]* width="([\d.]+)"/.exec(columns.svg.wide);
    expect(Number(tip![1])).toBeGreaterThan(250);
    const draw = (dense: boolean) => {
      const figure = timeSeries([{ id: "p50", label: "p50", points: [{ x: 0, y: 2 }, { x: 1, y: 3 }] }], { dense, x: { label: "Day axis", domain: [0, 1] }, y: { label: "Time axis", unit: "s", domain: [1, 4] } });
      if (isRefusal(figure)) throw new Error(figure.refused);
      return figure.svg.wide;
    };
    const height = (svg: string) => Number(/ height="(\d+)"/.exec(svg)![1]);
    expect(height(draw(true))).toBeLessThan(height(draw(false)) - 80);
    expect(draw(false)).toContain("Time axis");
    expect(draw(true)).not.toContain(">Time axis<");
  });
});
