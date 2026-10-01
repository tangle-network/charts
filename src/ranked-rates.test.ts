import { describe, expect, it } from "vitest";
import { isRefusal, rankedRates, type Figure, type RateRow } from "./index.js";

const row = (id: string, solved: number, overrides: Partial<RateRow> = {}): RateRow => ({
  id,
  label: id,
  rank: null,
  solved,
  attempts: 10,
  rate: solved / 10,
  estimate: "bootstrap",
  interval: { lower: 0, upper: 1, level: 0.95, method: "task-cluster-bootstrap" },
  tiers: null,
  cost: { perSolvedUsd: null, basis: "unknown", receipts: null },
  medianWallMs: null,
  onFront: null,
  ...overrides,
});

function figure(input: RateRow[], order?: "input"): Figure {
  const result = rankedRates(input, { measure: "solve rate", ...(order ? { order } : {}) });
  if (isRefusal(result)) throw new Error(result.refused);
  return result;
}

function orderIn(content: string, first: string, second: string): void {
  expect(content.indexOf(first)).toBeGreaterThanOrEqual(0);
  expect(content.indexOf(first)).toBeLessThan(content.indexOf(second));
}

describe("rate figure order", () => {
  it("retains explicit input order in both plots and the data table without a ranking claim", () => {
    const rows = [row("Registered first", 2), row("Registered second", 9)];
    const result = figure(rows, "input");
    for (const content of [result.svg.wide, result.svg.narrow!, result.table]) {
      orderIn(content, rows[0]!.label, rows[1]!.label);
    }
    expect(result.finding).toBe("Solve rate by setup; no ranking is claimed.");
    expect(result.table).not.toContain(">Rank<");
    expect(result.finding).not.toMatch(/highest|first|sorted/i);
    expect(rows.map((r) => r.id)).toEqual(["Registered first", "Registered second"]);
  });

  it("follows an input permutation only when requested while the default retains observed rate order", () => {
    const low = row("Low", 2);
    const high = row("High", 9);
    orderIn(figure([high, low], "input").table, "High", "Low");
    orderIn(figure([low, high], "input").table, "Low", "High");
    const defaultFigure = figure([low, high]);
    orderIn(defaultFigure.table, "High", "Low");
    expect(defaultFigure.finding).toContain("High has the highest solve rate");
  });

  it("retains a count-only row in its input position without claiming it comes last", () => {
    const insufficient = row("Small sample", 1, { attempts: 1, rate: 1, estimate: "insufficient", interval: null });
    const result = figure([insufficient, row("Measured", 8)], "input");
    orderIn(result.table, "Small sample", "Measured");
    expect(result.lede).toContain("have too few units to draw a rate.");
    expect(result.lede).not.toContain("come last");
    expect(result.note.exclusions.join(" ")).toContain("No bar for Small sample");
  });

  it("keeps the default supported rank order and rank finding unchanged", () => {
    const result = figure([row("Second", 9, { rank: 2 }), row("First", 2, { rank: 1 })]);
    orderIn(result.table, "First", "Second");
    expect(result.finding).toContain("First ranks first");
    expect(result.table).toContain(">Rank<");
  });

  it("refuses an unknown order arriving from serialized caller options", () => {
    const options = { measure: "solve rate", ...JSON.parse('{"order":"score-descending"}') };
    expect(rankedRates([row("Measured", 9)], options)).toEqual({
      id: "ranked-rates", refused: "Unknown row order.",
    });
  });

  it("refuses input order for ranked rows rather than concealing their rank", () => {
    const result = rankedRates([row("Ranked", 9, { rank: 1 })], { measure: "solve rate", order: "input" });
    expect(result).toEqual({ id: "ranked-rates", refused: "Input order requires unranked rows." });
  });
});
