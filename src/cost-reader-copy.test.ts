import { describe, expect, it } from "vitest";
import { costFrontier, isRefusal, type RateRow } from "./index.js";

const row = (id: string, cost: RateRow["cost"], onFront: boolean | null = null): RateRow => ({
  id, label: id, rank: null, attempts: 10, solved: 5, rate: 0.5, estimate: "bootstrap",
  interval: { lower: 0.2, upper: 0.8, level: 0.95, method: "task-cluster-bootstrap" },
  tiers: null, cost, medianWallMs: 1000, onFront,
});
const receipts = (perSolvedUsd: number) => ({ perSolvedUsd, basis: "receipts" as const, receipts: 10 });

describe("cost reader copy", () => {
  it("states the drawn cost range without narrating a missing frontier", () => {
    const figure = costFrontier([row("low", receipts(0.1)), row("high", receipts(0.2))], { measure: "solve rate" });
    if (isRefusal(figure)) throw new Error(figure.refused);
    expect(figure.lede).toBe("Cost per pass ranges from $0.100 to $0.200.");
    expect(figure.lede + figure.note.method).not.toMatch(/producer|no frontier|not compute/);
    expect(figure.svg.wide).not.toMatch(/class="tgc-pt-front"|class="tgc-front-line"/);
  });

  it("marks estimates inside the range and excludes unknown costs from its bounds", () => {
    const rows = [row("low", receipts(0.1)), row("high", receipts(0.2)),
      row("estimate", { perSolvedUsd: 0.15, basis: "estimated", receipts: null }),
      row("unknown", { perSolvedUsd: null, basis: "unknown", receipts: null })];
    const figure = costFrontier(rows, { measure: "solve rate" });
    if (isRefusal(figure)) throw new Error(figure.refused);
    expect(figure.lede).toBe("Cost per pass ranges from $0.100 to $0.200. Costs include estimates.");
    expect(figure.table).toContain("$0.150 est.");
    expect(figure.note.exclusions).toContain("Not placed: unknown (cost unknown).");
    expect(rows[2]!.cost.perSolvedUsd).toBe(0.15);
  });

  it("keeps a single shared price concise and explains recorded frontier marks", () => {
    const figure = costFrontier([row("left", receipts(0.1), true), row("right", receipts(0.1), true)], { measure: "solve rate" });
    if (isRefusal(figure)) throw new Error(figure.refused);
    expect(figure.lede).toBe("Cost per pass is $0.100.");
    expect(figure.note.method).toContain("A frontier setup has no alternative with both lower cost and higher solve rate.");
    expect(figure.note.method).not.toContain("producer");
    expect(figure.svg.wide).toContain('class="tgc-front-line"');
  });
});
