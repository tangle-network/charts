import { describe, expect, it } from "vitest";
import { comparisonIntervals, isRefusal, type ComparisonRow } from "./index.js";

const retained: ComparisonRow = {
  favored: "terra", other: "luna", pairs: 26, minimumEffect: 0.4,
  interval: { lower: -0.153846, upper: 0.076923, level: 0.95, method: "task-cluster-bootstrap" },
  exactInterval: { lower: -0.113445, upper: 0.093623, level: 0.95, method: "mcnemar-exact" },
};
const setups = [{ id: "terra", label: "Terra", rank: null }, { id: "luna", label: "Luna", rank: null }];

describe("comparison difference labels", () => {
  it("does not describe an unsupported registered direction as a winner", () => {
    const figure = comparisonIntervals([retained], setups, { measure: "solve rate" });
    if (isRefusal(figure)) throw new Error(figure.refused);
    for (const content of [figure.table, figure.svg.wide, figure.svg.narrow!]) {
      expect(content).toContain("Terra − Luna");
      expect(content).not.toContain("Terra over Luna");
    }
    expect(figure.finding).toBe("No step clears its registered minimum effect.");
    expect(figure.table).toContain("26");
    expect(figure.table).toContain("40");
    expect(retained.interval).toEqual({ lower: -0.153846, upper: 0.076923, level: 0.95, method: "task-cluster-bootstrap" });
  });

  it("keeps supported conclusions in the finding while labels name the same difference", () => {
    const supported = { ...retained, interval: { ...retained.interval!, lower: 0.6, upper: 0.8 }, exactInterval: { ...retained.exactInterval!, lower: 0.55, upper: 0.85 } };
    const figure = comparisonIntervals([supported], setups, { measure: "solve rate" });
    if (isRefusal(figure)) throw new Error(figure.refused);
    expect(figure.finding).toBe("The step clears its registered minimum effect.");
    expect(figure.table).toContain("Terra − Luna");
  });
});
