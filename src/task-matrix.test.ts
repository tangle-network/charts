import { describe, expect, it } from "vitest";
import { isRefusal, renderFigure, taskMatrix, type MatrixCell } from "./index.js";

const setups = [{ id: "setup", label: "Agent", rank: null }];
const cell = (overrides: Partial<MatrixCell> = {}): MatrixCell => ({
  task: "task",
  setup: "setup",
  attempts: 3,
  solved: 1,
  tiers: null,
  mean: null,
  costUsd: null,
  ...overrides,
});

describe("task matrix observation states", () => {
  it("preserves unmeasured attempts in the plot, table, and method without calling them failures", () => {
    const figure = taskMatrix(["task"], setups, [cell({ unmeasured: 2 })]);
    expect(isRefusal(figure)).toBe(false);
    if (isRefusal(figure)) throw new Error(figure.refused);
    expect(figure.svg.wide).toContain('class="tgc-open tgc-dashed"');
    expect(figure.svg.narrow).toContain('class="tgc-open tgc-dashed"');
    expect(figure.table).toContain("1/3 · 2U");
    expect(figure.note.method).toContain("could not measure");
    expect(figure.read).toContain("plain outline");
    expect(figure.svg.wide).not.toContain(">did not pass<");
    expect(renderFigure(figure, 1)).toContain("1/3 · 2U");
  });

  it("keeps flagged attempts distinct when there is no tier measurement", () => {
    const figure = taskMatrix(["task"], setups, [cell({ flagged: 1, unmeasured: 1 })]);
    if (isRefusal(figure)) throw new Error(figure.refused);
    expect(figure.svg.wide).toContain("tgc-strike");
    expect(figure.table).toContain("1/3 · 1 flagged 1U");
    expect(figure.note.method).toContain("never counts as a pass");
    expect(figure.svg.wide).not.toContain(">did not pass<");
  });

  it("shows ungraded and unmeasured attempts separately when no pass rule applies", () => {
    const figure = taskMatrix(["task"], setups, [cell({ solved: null, flagged: 1, unmeasured: 1 })]);
    if (isRefusal(figure)) throw new Error(figure.refused);
    expect(figure.table).toContain("3 · 1 flagged 1U");
    expect(figure.svg.wide).toContain("tgc-dot");
    expect(figure.svg.wide).toContain("tgc-strike");
    expect(figure.svg.wide).toContain("tgc-open tgc-dashed");
  });

  it("refuses passes that overlap absent or flagged observations", () => {
    for (const overrides of [{ solved: 2, unmeasured: 2 }, { solved: 3, flagged: 1 }]) {
      expect(isRefusal(taskMatrix(["task"], setups, [cell(overrides)]))).toBe(true);
    }
  });

  it("preserves an observed zero cost rather than labeling it unknown", () => {
    const figure = taskMatrix(["task"], setups, [cell({ costUsd: 0 })]);
    if (isRefusal(figure)) throw new Error(figure.refused);
    expect(figure.table).not.toContain("cost unknown");
    expect(figure.table).toContain("$0");
  });

  it("retains measured non-passes and measured zero without an absent marker", () => {
    const figure = taskMatrix(["task"], setups, [cell({ solved: 0 })]);
    if (isRefusal(figure)) throw new Error(figure.refused);
    expect(figure.table).toContain("0/3");
    expect(figure.svg.wide).toContain(">did not pass<");
    expect(figure.svg.wide).not.toContain("tgc-open tgc-dashed");
  });
});
