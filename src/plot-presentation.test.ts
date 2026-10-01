import { expect, it } from "vitest";
import { breakdown, isRefusal, metricBars, renderFigure } from "./index.js";

it("plot presentation renders existing marks and complete accessible data without report controls", () => {
  const figure = metricBars([{ id: "a", label: "Measured zero", value: 0, observations: { count: 13, label: "tasks" } }, { id: "b", label: "Not observed", value: null, observations: { count: 0, label: "tasks" } }], { measure: "recorded score", unit: "score", domain: [0, 1] });
  if (isRefusal(figure)) throw new Error(figure.refused);
  const html = renderFigure(figure, 1, { presentation: "plot" });
  expect(html).toContain(figure.svg.wide);
  expect(html).toContain(figure.svg.narrow);
  expect(html).toContain(`<div class="tgc-accessible-data">${figure.table}</div>`);
  expect(html).toContain('role="group"');
  expect(html).not.toMatch(/<details|<summary|<p|tgc-finding|tgc-lede|tgc-read|href="#note/);
  expect(html).toContain("0 score");
  expect(html).toContain("not measured");
});

it("keeps a real phone plot when a figure otherwise uses its table at narrow widths", () => {
  const figure = breakdown({ reasons: ["Recorded failure"], setups: [{ id: "a", label: "A", n: 13 }], counts: [{ reason: "Recorded failure", setup: "a", count: 0 }], excluded: null }, { measure: "failed checks" });
  if (isRefusal(figure)) throw new Error(figure.refused);
  expect(figure.svg.narrow).toBeNull();
  const html = renderFigure(figure, 1, { presentation: "plot" });
  expect(html).toContain('class="tgc-narrow tgc-wide-fallback" role="region"');
  expect(html).toContain('tabindex="0" style="--tgc-fallback-width:720px"');
  expect(html).toContain(`${figure.svg.wide}</div>`);
  expect(html).not.toContain('tgc-narrow-table');
});
