// @vitest-environment jsdom
// Ported cases from agent-app's sparkline.test.tsx, plus resize/nullable input.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Sparkline, sparklineGeometry, sparklineLabel, sparklineReadings } from "./sparkline.js";

afterEach(cleanup);

describe("ported extent sparkline", () => {
  it("distinguishes no history, all missing, and a measured zero", () => {
    const { container, rerender } = render(<Sparkline values={[]} label="Runs" />);
    expect(container.querySelector("svg")).toBeNull();
    expect(container.textContent).toContain("Runs: no readings yet");
    expect(container.textContent).toContain("No history yet");
    rerender(<Sparkline values={[null, NaN, Infinity]} label="Runs" />);
    expect(container.querySelector("svg")).toBeNull();
    expect(container.textContent).toContain("No readings available");
    expect(container.textContent).toContain("3 not available");
    rerender(<Sparkline values={[0]} label="Runs" />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Runs: one reading, 0");
    expect(container.querySelectorAll("circle")).toHaveLength(1);
    expect(container.querySelector("polyline")).toBeNull();
  });
  it("centers one sample and preserves one reading's position among gaps", () => {
    expect(sparklineGeometry([7], { width: 100, height: 20 }).points).toEqual([{ x: 50, y: 10 }]);
    expect(sparklineGeometry([null, null, 7], { width: 100, height: 20 }).points).toEqual([{ x: 97.5, y: 10 }]);
  });
  it.each([0, 4, -4])("renders equal readings %s flat at mid-height", (value) => {
    const { container } = render(<Sparkline values={[value, value, value]} width={100} height={20} />);
    expect(container.querySelector("polyline")?.getAttribute("points")).toBe("2.5,10 50,10 97.5,10");
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
  it("uses observed extent rather than a silent zero baseline", () => {
    const { container } = render(<Sparkline values={[10, 12]} width={100} height={20} />);
    expect(container.querySelector("polyline")?.getAttribute("points")).toBe("2.5,17.5 97.5,2.5");
    expect(screen.getByRole("img").getAttribute("data-scale")).toBe("extent");
  });
  it("supports negative and mixed-sign values without clamping", () => {
    expect(sparklineGeometry([-5, 0, 5], { width: 100, height: 20, inset: 2 }).points.map(({ y }) => y))
      .toEqual([18, 10, 2]);
    const { container } = render(<Sparkline values={[-5, 0, 5]} label="Delta" />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("range -5 to 5");
    expect(container.querySelector("polyline")).not.toBeNull();
  });
  it("retains gap width and breaks strokes instead of interpolating", () => {
    const { container } = render(<Sparkline values={[1, 2, null, 5, 6]} width={100} height={20} />);
    const geometry = sparklineGeometry([1, 2, null, 5, 6], { width: 100, height: 20, inset: 0 });
    expect(geometry.segments.map((run) => run.map(({ x }) => x))).toEqual([[0, 25], [75, 100]]);
    expect(container.querySelectorAll("polyline")).toHaveLength(2);
    expect(screen.getByRole("img").getAttribute("data-gaps")).toBe("1");
  });
  it.each([null, NaN, Infinity, -Infinity])("treats %s as missing, not a zero or a shorter series", (missing) => {
    const { container } = render(<Sparkline values={[1, missing, 3]} />);
    expect(sparklineReadings([1, missing, 3])).toEqual([1, 3]);
    expect(container.querySelectorAll("polyline")).toHaveLength(0);
    expect(container.querySelectorAll("circle")).toHaveLength(2);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("1 not available");
  });
  it("keeps ordinary and extreme finite geometry finite", () => {
    const { container } = render(<Sparkline values={[-Number.MAX_VALUE, 0, Number.MAX_VALUE]} />);
    expect(container.querySelector("polyline")?.getAttribute("points")).toBe("2.5,21.5 48,12 93.5,2.5");
    expect(container.querySelector("polyline")?.getAttribute("points")).not.toMatch(/NaN|Infinity/);
    expect(sparklineGeometry(Array.from({ length: 100_000 }, (_, i) => i)).points).toHaveLength(100_000);
  });
  it("recomputes the viewBox and geometry when controlled dimensions change", () => {
    const { container, rerender } = render(<Sparkline values={[1, 3]} width={100} height={20} />);
    rerender(<Sparkline values={[1, 3]} width={200} height={40} />);
    const chart = screen.getByRole("img");
    expect(chart.getAttribute("width")).toBe("200");
    expect(chart.getAttribute("height")).toBe("40");
    expect(chart.getAttribute("viewBox")).toBe("0 0 200 40");
    expect(container.querySelector("polyline")?.getAttribute("points")).toBe("2.5,37.5 197.5,2.5");
  });
  it.each([{ width: 0 }, { height: NaN }, { inset: -1 }, { width: 2 }])("rejects invalid dimensions %j", (options) => {
    expect(() => sparklineGeometry([1], options)).toThrow(RangeError);
  });
  it("retains readable exact sample values as well as the range and direction", () => {
    const { container } = render(<Sparkline values={[1, null, 2.12345, 1]} label="Score" format={String} />);
    expect(screen.getByRole("img").getAttribute("aria-label"))
      .toBe("Score: 3 readings, 1 not available, range 1 to 2.12345, net unchanged from 1 to 1");
    expect(container.querySelector("desc")?.textContent)
      .toBe("Sample 1: 1; Sample 2: not available; Sample 3: 2.12345; Sample 4: 1");
  });
  it("retains label formatting, direction, empty copy and caller classes", () => {
    expect(sparklineLabel([9, 5, 1], { label: "Metric", format: (v) => `${v} units` }))
      .toBe("Metric: 3 readings, range 1 units to 9 units, falling from 9 units to 1 units");
    const { container } = render(<Sparkline values={[]} label="Runs" emptyLabel="No samples" className="caller" />);
    expect(container.textContent).toContain("No samples");
    expect(container.firstElementChild?.getAttribute("class")).toBe("caller");
  });
  it("does not add animation or a keyboard stop to a noninteractive glyph", () => {
    const { container } = render(<Sparkline values={[1, 2]} />);
    expect(container.querySelector("animate, [tabindex]")).toBeNull();
    expect(screen.getByRole("img").getAttribute("focusable")).toBe("false");
    expect(container.querySelector("polyline")?.getAttribute("vector-effect")).toBe("non-scaling-stroke");
  });
});
