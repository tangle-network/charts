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
  it("keeps the pair count below long comparison labels on a phone", () => {
    const longLabels = [
      { id: "terra", label: "opencode · gpt-5.6-terra (no-web)", rank: null },
      { id: "luna", label: "opencode · gpt-5.6-luna (no-web)", rank: null },
    ];
    const figure = comparisonIntervals([retained], longLabels, { measure: "solve rate" });
    if (isRefusal(figure) || !figure.svg.narrow) throw new Error("retained comparison should have a phone figure");
    const label = figure.svg.narrow.match(/<text\b[^>]*font-size="14"[^>]*>([\s\S]*?)<\/text>/);
    const pairs = figure.svg.narrow.match(/<text\b([^>]*)>26 pairs<\/text>/);
    if (!label || !pairs) throw new Error("the phone figure must include the label and pair count");
    const labelY = Number(label[0].match(/\by="([^"]+)"/)![1]);
    const lineOffsets = [...label[1]!.matchAll(/\bdy="([^"]+)"/g)].map((match) => Number(match[1]));
    expect(lineOffsets.length).toBeGreaterThan(1);
    const pairY = Number(pairs[1]!.match(/\by="([^"]+)"/)![1]);
    expect(pairY).toBeGreaterThan(labelY + lineOffsets.reduce((sum, offset) => sum + offset, 0));
    const zeroLine = figure.svg.narrow.match(/<line class="tgc-zero"[^>]*\by1="([^"]+)"/);
    if (!zeroLine) throw new Error("the phone figure must retain a zero reference");
    expect(Number(zeroLine[1])).toBeGreaterThanOrEqual(pairY);
  });
});
