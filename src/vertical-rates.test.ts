import { describe, expect, it } from "vitest";
import { isRefusal, rankedRates, renderFigure, renderNotes, type Figure, type RateRow } from "./index.js";

const row = (id: string, solved: number, patch: Partial<RateRow> = {}): RateRow => ({
  id, label: id, rank: null, solved, attempts: 26, rate: solved / 26,
  estimate: "bootstrap", interval: { lower: 0, upper: 10 / 26, level: 0.95, method: "task-cluster-bootstrap" },
  tiers: null, cost: { perSolvedUsd: 0.593, basis: "estimated", receipts: null }, medianWallMs: 1500, onFront: null, ...patch,
});
const figure = (value: ReturnType<typeof rankedRates>): Figure => {
  if (isRefusal(value)) throw new Error(value.refused);
  return value;
};
const options = { measure: "pass rate", orientation: "vertical" as const, order: "input" as const };

describe("vertical rate view", () => {
  it("draws the actual low rates on a full axis without changing tables or conclusions", () => {
    const rows = [row("Luna", 1), row("Terra", 5)];
    const result = figure(rankedRates(rows, options));
    const horizontal = figure(rankedRates(rows, { measure: "pass rate", order: "input" }));
    expect(result.table).toBe(horizontal.table);
    expect(result.finding).toBe(horizontal.finding);
    expect(result.note).toEqual(horizontal.note);
    for (const svg of [result.svg.wide, result.svg.narrow!]) {
      expect(svg).toContain('height="10" rx="5"');
      expect(svg).toContain('height="50" rx="5"');
      for (const tick of ["0%", "20%", "40%", "60%", "80%", "100%"]) expect(svg).toContain(`>${tick}</text>`);
      expect(svg.indexOf('aria-label="Luna')).toBeLessThan(svg.indexOf('aria-label="Terra'));
      expect(svg).toContain('x2="');
      expect(svg).toContain('y1="202"'); // Actual upper CI 10/26 on the 260px scale.
      expect(svg).toContain('3.8%');
      expect(svg).toContain('19.2%');
    }
    expect(result.svg.interactive).toBe(true);
    expect(result.svg.wide).not.toContain("viewBox");
    expect(result.svg.wide).toContain('style="height:408px;min-width:288px"');
    expect(result.svg.wide).toContain('x2="100%"');
    expect(rows.map((r) => r.id)).toEqual(["Luna", "Terra"]);
  });

  it("does not turn a zero or an ineligible row into a visible positive bar", () => {
    const result = figure(rankedRates([row("Zero", 0, { interval: null }), row("Too few", 0, { estimate: "insufficient", interval: null })], options));
    expect(result.svg.wide).not.toContain('class="tgc-vertical-bar"');
    expect(result.svg.wide).not.toContain('class="tgc-whisker"');
    expect(result.svg.wide).toContain('>0%</text>');
    expect(result.note.exclusions.join(" ")).toContain("No bar for Too few");
  });

  it("puts a 100% bar at the real upper boundary and keeps missing CI absent", () => {
    const result = figure(rankedRates([row("Full", 26, { interval: null })], options));
    expect(result.svg.wide).toMatch(/y="42" width="61.6" height="260"/);
    expect(result.svg.wide).not.toContain('class="tgc-whisker"');
    expect(result.svg.wide).toContain('y="34" font-size="15"');
  });

  it("supplies verified marks by id and exposes the actual same details to hover and focus", () => {
    const result = figure(rankedRates([row("Luna", 1)], { ...options, identities: { Luna: { model: { label: "GPT-5.6 Luna", src: "/images/openai.svg" }, harness: { label: "OpenCode", src: "https://assets.example.org/opencode.svg" } } } }));
    expect(result.svg.wide).toContain('href="/images/openai.svg"');
    expect(result.svg.wide.match(/class="tgc-logo-plate"/g)).toHaveLength(2);
    expect(result.svg.wide).toContain('>GPT-5.6 Luna</text>');
    expect(result.svg.wide).toContain('>OpenCode</text>');
    expect(result.svg.wide).toContain('tabindex="0" role="img" aria-label="Luna · 1/26 passed · 3.8%');
    expect(result.svg.wide).toContain('$0.593 est. per pass');
    expect(result.svg.wide).toContain('2 s median run');
    expect(result.svg.wide).toContain('.tgc-vertical:not(:has(.tgc-column:hover)):has(');
    expect(result.svg.wide).toContain(':focus-visible) [data-tip="0"]{opacity:1}');
    expect(renderFigure(result, 1)).toContain('class="tgc-plot" role="group"');
  });

  it("keeps many long labels readable in an explicitly wider scrolling plot", () => {
    const rows = Array.from({ length: 8 }, (_, i) => row(`Long model name with variant ${i}`, i));
    const result = figure(rankedRates(rows, options));
    expect(result.svg.narrow).toContain('width="960"');
    expect(result.svg.narrow).toContain('height="444"');
    expect(result.svg.narrow).toContain('text-anchor="middle"');
    expect(result.svg.narrow).not.toContain("…");
  });

  it("refuses invalid orientations, mismatched identities and unsafe image references", () => {
    expect(rankedRates([row("Luna", 1)], { ...options, ...JSON.parse('{"orientation":"diagonal"}') })).toEqual({ id: "ranked-rates", refused: "Unknown bar orientation." });
    for (const src of ["javascript:alert(1)", "//other.example/image.svg", "/image\n.svg"]) {
      expect(isRefusal(rankedRates([row("Luna", 1)], { ...options, identities: { Luna: { model: { label: "Luna", src } } } }))).toBe(true);
    }
    expect(isRefusal(rankedRates([row("Luna", 1)], { ...options, identities: { Unknown: { model: { label: "Luna", src: "/image.svg" } } } }))).toBe(true);
  });
});

describe("chart-first figure presentation", () => {
  it("keeps the default report markup and plots unchanged", () => {
    const result = figure(rankedRates([row("Luna", 1)], { measure: "pass rate" }));
    expect(renderFigure(result, 1)).toBe(renderFigure(result, 1, {}));
    expect(result.svg.wide).not.toContain("tgc-vertical");
    expect(renderFigure(result, 1)).toContain('<h3 class="tgc-finding"');
    expect(renderFigure(result, 1)).toContain('class="tgc-plot" role="img"');
  });

  it("puts the plot first and closes supporting text, data and method without losing note anchors", () => {
    const result = figure(rankedRates([row("Luna", 1)], options));
    const html = renderFigure(result, 1, { presentation: "chart" });
    expect(html).toContain('class="tgc-figure tgc-figure-chart"');
    expect(html).not.toContain('class="tgc-finding"');
    const disclosure = html.indexOf('<details class="tgc-data">');
    expect(disclosure).toBeGreaterThan(html.indexOf('class="tgc-plot"'));
    expect(html.indexOf('<p class="tgc-lede">')).toBeGreaterThan(disclosure);
    expect(html).not.toContain('<details class="tgc-data" open');
    expect(html).toContain(result.table);
    expect(html).toContain(result.note.method);
    expect(html).toContain('id="ref-1"');
    expect(html).toContain('<summary>Data and method</summary>');
    expect(html).not.toContain('href="#note-1"');
    expect(renderNotes([result])).toContain('href="#ref-1"');
    expect(() => renderFigure(result, 1, JSON.parse('{"presentation":"summary"}'))).toThrow("unknown presentation");
  });
});
