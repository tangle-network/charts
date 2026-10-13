import { describe, expect, it } from "vitest";
import { heatmap, isRefusal, latencyRange, phaseWaterfall } from "./index.js";

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

  it("draws p50, p95, and an SLO, and refuses underpowered rows", () => {
    const options = { measure: "create latency", sloMs: 5000, minN: 5 };
    const rows = [{ id: "a", label: "A", p50Ms: 3000, p95Ms: 6500, n: 9 }];
    const figure = latencyRange(rows, options);
    expect(isRefusal(figure)).toBe(false);
    if (isRefusal(figure)) return;
    expect(figure.svg.wide).toContain("tgc-range-dot-breach");
    expect(figure.svg.wide).toContain("tgc-threshold");
    expect(figure.read).toContain("logarithmic");
    expect(figure.table).toContain("6.5 s");
    expect(isRefusal(latencyRange([{ ...rows[0]!, n: 4 }], options))).toBe(true);
    expect(isRefusal(latencyRange([{ ...rows[0]!, p95Ms: 2000 }], options))).toBe(true);
    expect(isRefusal(latencyRange([{ ...rows[0]!, p50Ms: 0 }], options))).toBe(true);
  });

  it("preserves phase order and accounts for the unexplained tail", () => {
    const figure = phaseWaterfall([{ id: "a", label: "Route", ms: 20 }, { id: "b", label: "Restore", ms: 60 }], { measure: "create", totalMs: 100 });
    expect(isRefusal(figure)).toBe(false);
    if (isRefusal(figure)) return;
    expect(figure.table).toMatch(/Route[\s\S]*Restore[\s\S]*Unaccounted time/);
    expect(figure.svg.wide).toContain("tgc-waterfall-unaccounted");
    expect(figure.lede).toContain("0.02 s unaccounted");
    expect(isRefusal(phaseWaterfall([{ id: "a", label: "A", ms: 101 }], { measure: "create", totalMs: 100 }))).toBe(true);
  });
});
