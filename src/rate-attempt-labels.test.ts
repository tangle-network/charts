import { describe, expect, it } from "vitest";
import { costFrontier, isRefusal, rankedRates, type RateRow } from "./index.js";

const rows: RateRow[] = [{
  id: "retained", label: "Retained", rank: null, attempts: 10, solved: 5, rate: 0.5,
  estimate: "bootstrap",
  interval: { lower: 0.2, upper: 0.8, level: 0.95, method: "task-cluster-bootstrap" },
  tiers: null, cost: { perSolvedUsd: 0.1, basis: "receipts", receipts: 10 },
  medianWallMs: 1000, onFront: true,
}];
rows.push({ ...rows[0]!, id: "second", label: "Second", cost: { perSolvedUsd: 0.2, basis: "receipts", receipts: 10 }, onFront: false });

describe("rate interval count labels", () => {
  it("names the recorded attempts rather than presenting them as independent sample n", () => {
    const rate = rankedRates(rows, { measure: "solve rate" });
    const cost = costFrontier(rows, { measure: "solve rate" });
    if (isRefusal(rate) || isRefusal(cost)) throw new Error("retained rate inputs should draw");
    for (const content of [rate.table, cost.table, cost.svg.wide, cost.svg.narrow!]) {
      expect(content).toContain("10 attempts");
      expect(content).not.toContain("n=10");
      expect(content).toContain("20");
      expect(content).toContain("80");
    }
    expect(rows[0]!.attempts).toBe(10);
    expect(rows[0]!.interval).toEqual({ lower: 0.2, upper: 0.8, level: 0.95, method: "task-cluster-bootstrap" });
  });
});
