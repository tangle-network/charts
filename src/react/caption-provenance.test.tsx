// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, expect, it } from "vitest";
import { type Figure, isRefusal, metricBars, renderFigure } from "../index.js";
import { FigureView } from "./index.js";

afterEach(cleanup);
beforeAll(() => {
  // jsdom has no layout: report a 960px box so the view draws its wide render.
  globalThis.ResizeObserver = class {
    constructor(private cb: ResizeObserverCallback) {}
    observe(el: Element) { this.cb([{ contentRect: { width: 960 } } as ResizeObserverEntry], this as never); void el; }
    unobserve() {}
    disconnect() {}
  } as never;
});

const drawn = metricBars(
  [
    { id: "a", label: "Settlement 1", value: 31211, observations: { count: 1, label: "settlement" } },
    { id: "b", label: "Settlement 2", value: 32296, observations: { count: 1, label: "settlement" } },
  ],
  { measure: "input tokens", unit: "tokens", domain: [0, 70000] },
);
if (isRefusal(drawn)) throw new Error(drawn.refused);
const bare: Figure = drawn;
const sourced: Figure = {
  ...bare,
  status: "measured",
  period: "1 Aug 2026",
  unit: "input tokens",
  sources: [
    { label: "Measurement notes", href: "#note-1" },
    { label: "agent-runtime <#685>", href: "https://github.com/tangle-network/agent-runtime/pull/685?a=1&b=2" },
  ],
};
const presentations = [undefined, "chart", "plot", "panel"] as const;

it("prints status, period, unit and sources in every presentation, scope before the plot and sources after it", () => {
  for (const presentation of presentations) {
    const html = renderFigure(sourced, 1, presentation ? { presentation } : {});
    const scope = html.indexOf('<p class="tgc-context"><span class="tgc-status" data-status="measured">Measured</span><span class="tgc-period">1 Aug 2026</span><span class="tgc-unit">input tokens</span></p>');
    const plot = html.indexOf('<div class="tgc-plot"');
    const links = html.indexOf('<p class="tgc-sources">Sources: <a href="#note-1">Measurement notes</a> · <a href="https://github.com/tangle-network/agent-runtime/pull/685?a=1&amp;b=2">agent-runtime &lt;#685&gt;</a></p>');
    expect([presentation, scope > 0, scope < plot, links > plot]).toEqual([presentation, true, true, true]);
  }
});

it("leaves a figure without provenance byte-identical to its render with the fields stripped", () => {
  const partial: Figure = { ...bare, unit: "  ", sources: [] };
  for (const presentation of presentations) {
    const options = presentation ? { presentation } : {};
    const html = renderFigure(bare, 2, options);
    expect(html).not.toMatch(/tgc-context|tgc-sources|tgc-status/);
    expect(renderFigure(partial, 2, options)).toBe(html);
  }
});

it("refuses a source it cannot link safely and a status it does not know", () => {
  for (const href of ["javascript:alert(1)", "//evil.example/x", "data:text/html,x", "relative/path"]) {
    expect(() => renderFigure({ ...bare, sources: [{ label: "x", href }] }, 1)).toThrow(/needs an http\(s\), root-relative or fragment link/);
  }
  expect(() => renderFigure({ ...bare, sources: [{ label: " ", href: "#note-1" }] }, 1)).toThrow(/source without a label/);
  expect(() => renderFigure({ ...bare, status: "estimated" as never }, 1)).toThrow(/unknown status estimated/);
  expect(renderFigure({ ...bare, status: "illustrative" }, 1)).toContain('data-status="illustrative">Illustrative</span>');
  expect(renderFigure({ ...bare, status: "captured", sources: [{ label: "Run record", href: "/runs/1" }] }, 1, { presentation: "panel" })).toContain('<p class="tgc-sources">Source: <a href="/runs/1">Run record</a></p>');
});

it("FigureView prints the same scope line and source links around its plot", () => {
  const { container } = render(<FigureView figure={sourced} />);
  const figure = container.querySelector("figure")!;
  const kids = [...figure.children].map((el) => el.className);
  expect(kids.slice(0, 3)).toEqual(["tgc-context", "tgc-view-plot tgc-view-wide", "tgc-sources"]);
  expect(figure.querySelector(".tgc-context")!.textContent).toBe("Measured1 Aug 2026input tokens");
  expect([...figure.querySelectorAll(".tgc-sources a")].map((a) => a.getAttribute("href"))).toEqual(["#note-1", "https://github.com/tangle-network/agent-runtime/pull/685?a=1&b=2"]);
  cleanup();
  const plain = render(<FigureView figure={bare} />).container;
  expect(plain.querySelector(".tgc-context, .tgc-sources")).toBeNull();
});
