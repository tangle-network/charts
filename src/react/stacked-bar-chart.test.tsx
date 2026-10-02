// @vitest-environment jsdom
// Selection regressions ported from stabilized ADC PR #8746's UsageChart tests.
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StackedBarChart, type StackedBarChartProps, type StackedBarBucket } from "./stacked-bar-chart.js";

afterEach(cleanup);
const series = [
  { id: "s1", label: "First series", color: "currentColor" },
  { id: "s2", label: "Second series", color: "var(--chart-accent)" },
];
const buckets: StackedBarBucket[] = [
  { id: "one", label: "First bucket", total: 3, segments: [{ seriesId: "s1", value: 2 }, { seriesId: "s2", value: 1 }] },
  { id: "two", label: "Second bucket", total: 12, segments: [{ seriesId: "s1", value: 12 }] },
];
const defaults: StackedBarChartProps = {
  label: "Recorded units", series, buckets, maxValue: 12, formatValue: (v) => `${v} units`,
  selectedBucketId: null, onSelectionChange: () => {},
};
function Controlled(props: Partial<StackedBarChartProps>) {
  const [selectedBucketId, onSelectionChange] = useState<string | null>(null);
  return <StackedBarChart {...defaults} {...props} selectedBucketId={selectedBucketId} onSelectionChange={onSelectionChange} />;
}
function touchDown(element: Element) {
  const event = new Event("pointerdown", { bubbles: true });
  Object.defineProperty(event, "pointerType", { value: "touch" });
  fireEvent(element, event);
}

describe("extracted stacked renderer", () => {
  it("does not create bars for empty data", () => {
    render(<StackedBarChart {...defaults} buckets={[]} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Recorded units: No data yet")).toBeDefined();
  });
  it("supports one bucket and zero domain without inventing a positive bar", () => {
    const { container } = render(<StackedBarChart {...defaults} maxValue={0}
      buckets={[{ id: "zero", label: "Zero", total: 0, segments: [{ seriesId: "s1", value: 0 }] }]} />);
    expect(screen.getByRole("button", { name: /Zero: total 0 units/ })).toBeDefined();
    expect(container.querySelector('[data-series-id="s1"]')?.getAttribute("height")).toBe("0");
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 400 220");
  });
  it("keeps equal totals equal and scales from the explicit zero baseline", () => {
    const equal = buckets.map((bucket) => ({ ...bucket, total: 3, segments: [{ seriesId: "s1", value: 3 }] }));
    const { container } = render(<StackedBarChart {...defaults} buckets={equal} />);
    expect(Array.from(container.querySelectorAll("[data-series-id]")).map((mark) => mark.getAttribute("height")))
      .toEqual(["44", "44"]);
    expect(container.firstElementChild?.getAttribute("data-scale")).toBe("zero");
  });
  it.each([null, NaN, Infinity, -Infinity])("preserves %s as a gap at its supplied bucket position", (value) => {
    const data = [buckets[0], { id: "gap", label: "Missing bucket", total: value, segments: [{ seriesId: "s1", value }] }, buckets[1]];
    const { container } = render(<StackedBarChart {...defaults} buckets={data} />);
    const bars = screen.getAllByRole("button");
    expect(bars.map((bar) => bar.getAttribute("data-bucket-id"))).toEqual(["one", "gap", "two"]);
    expect(bars[1].getAttribute("data-gap")).toBe("true");
    expect(bars[1].querySelector("[data-series-id]")).toBeNull();
    expect(bars[1].getAttribute("aria-label")).toContain("Not available");
    expect(container.querySelectorAll("[data-hit-target]")).toHaveLength(3);
  });
  it("does not render a partial stack as a complete measured total", () => {
    render(<StackedBarChart {...defaults} buckets={[{ ...buckets[0], segments: [{ seriesId: "s1", value: 3 }, { seriesId: "s2", value: null }] }]} />);
    expect(screen.getByRole("button").querySelector("[data-series-id]")).toBeNull();
    expect(screen.getByRole("button").getAttribute("aria-label")).toContain("Second series Not available");
  });
  it.each([
    { maxValue: -1 }, { maxValue: Infinity },
    { buckets: [{ ...buckets[0], total: -3, segments: [{ seriesId: "s1", value: -3 }] }] },
    { buckets: [{ ...buckets[0], total: 13, segments: [{ seriesId: "s1", value: 13 }] }] },
    { buckets: [{ ...buckets[0], total: 4 }] },
    { buckets: [buckets[0], buckets[0]] },
    { series: [series[0], series[0]] },
    { buckets: [{ ...buckets[0], segments: [{ seriesId: "unknown", value: 3 }] }] },
    { buckets: [{ ...buckets[0], segments: [{ seriesId: "s1", value: 2 }, { seriesId: "s1", value: 1 }] }] },
  ])("rejects unsupported negative, out-of-domain, inconsistent or ambiguous data: %j", (props) => {
    expect(() => render(<StackedBarChart {...defaults} {...props} />)).toThrow(RangeError);
  });
  it("accepts normal floating-point sum error without recomputing the supplied total", () => {
    render(<StackedBarChart {...defaults} buckets={[{ id: "decimal", label: "Decimal", total: 0.3,
      segments: [{ seriesId: "s1", value: 0.1 }, { seriesId: "s2", value: 0.2 }] }]} />);
    expect(screen.getByRole("button").getAttribute("aria-label")).toContain("total 0.3 units");
  });
  it("is controlled: requests selection but never changes it behind the caller's back", () => {
    const change = vi.fn();
    render(<StackedBarChart {...defaults} onSelectionChange={change} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(change).toHaveBeenCalledWith("one");
    expect(screen.getByRole("status").textContent).toContain("Hover, tap, or focus");
  });
  it("hover and repeated clicks select, never toggle the readout away", () => {
    render(<Controlled />);
    const bar = screen.getAllByRole("button")[0];
    fireEvent.mouseEnter(bar);
    fireEvent.click(bar);
    fireEvent.click(bar);
    expect(screen.getByRole("status").textContent).toContain("First bucket: total 3 units");
    fireEvent.mouseLeave(bar);
    expect(screen.getByRole("status").textContent).toContain("Hover, tap, or focus");
  });
  it("Tab, Enter, Space and Escape preserve the handoff's keyboard selection contract", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.tab(); // named scroll region
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Recorded units chart");
    await user.tab(); // first bucket
    expect(document.activeElement).toBe(screen.getAllByRole("button")[0]);
    expect(screen.getByRole("status").textContent).toContain("First bucket");
    await user.keyboard("{Enter} ");
    expect(screen.getByRole("status").textContent).toContain("First bucket");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("status").textContent).toContain("Hover, tap, or focus");
    await user.tab();
    expect(screen.getByRole("status").textContent).toContain("Second bucket");
    await user.tab(); // blur clears
    expect(screen.getByRole("status").textContent).toContain("Hover, tap, or focus");
  });
  it("keeps touch selection despite compatibility mouse events and repeated taps", () => {
    render(<Controlled />);
    const bar = screen.getAllByRole("button")[0];
    touchDown(bar);
    fireEvent.mouseEnter(bar);
    fireEvent.click(bar);
    fireEvent.mouseLeave(bar);
    fireEvent.click(bar);
    expect(screen.getByRole("status").textContent).toContain("First bucket: total 3 units");
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.keyDown(bar, { key: "Escape" });
    expect(screen.getByRole("status").textContent).toContain("Hover, tap, or focus");
  });
  it("highlights the actual stack, not its full-height hit target", () => {
    render(<Controlled />);
    const bar = screen.getAllByRole("button")[0];
    fireEvent.focus(bar);
    expect(bar.querySelector("[data-hit-target]")?.getAttribute("height")).toBe("176");
    expect(bar.querySelector("[data-hit-target]")?.getAttribute("stroke")).toBe("none");
    expect(bar.querySelector("[data-selection]")?.getAttribute("height")).toBe("44");
    expect(bar.querySelector("[data-selection]")?.getAttribute("y")).toBe("144");
    expect(bar.getAttribute("aria-describedby")).toBe(screen.getByRole("status").id);
  });
  it("keeps selection by identity across reordering and never retargets a removed bucket", () => {
    const { rerender } = render(<StackedBarChart {...defaults} selectedBucketId="one" />);
    rerender(<StackedBarChart {...defaults} selectedBucketId="one" buckets={[...buckets].reverse()} />);
    expect(screen.getByRole("status").textContent).toContain("First bucket");
    expect(screen.getAllByRole("button")[1].getAttribute("aria-describedby")).toBe(screen.getByRole("status").id);
    rerender(<StackedBarChart {...defaults} selectedBucketId="one" buckets={[buckets[1]]} />);
    expect(screen.getByRole("status").textContent).toContain("Hover, tap, or focus");
    expect(screen.getByRole("button").getAttribute("aria-describedby")).toBeNull();
  });
  it("keeps a fluid SVG and keyboard-scrollable minimum when its container resizes", () => {
    const View = ({ width }: { width: number }) => <div style={{ width }}><Controlled /></div>;
    const { container, rerender } = render(<View width={900} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    rerender(<View width={320} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("100%");
    expect(svg.style.minWidth).toBe("400px");
    expect(svg.style.maxWidth).toBe("100%");
    expect(svg.getAttribute("preserveAspectRatio")).toBe("xMinYMin meet");
    expect(svg.parentElement?.style.overflowX).toBe("auto");
    expect(svg.parentElement?.getAttribute("tabindex")).toBe("0");
    expect(screen.getByRole("status").textContent).toContain("First bucket");
    // jsdom verifies the resize contract, not browser-computed layout pixels.
  });
  it("retains dense-label geometry from the handoff", () => {
    const data = Array.from({ length: 40 }, (_, i) => ({ ...buckets[0], id: String(i), label: `Bucket ${i}` }));
    const { container } = render(<StackedBarChart {...defaults} buckets={data} />);
    expect(screen.getAllByRole("button")).toHaveLength(40);
    expect(container.querySelector("[data-bucket-id] text")?.getAttribute("transform")).toMatch(/^rotate\(-40/);
  });
  it("exposes values without hover, without currency/category inference and without CSS", () => {
    render(<StackedBarChart {...defaults} />);
    const name = screen.getAllByRole("button")[0].getAttribute("aria-label");
    expect(name).toBe("First bucket: total 3 units — First series 2 units, Second series 1 units");
    expect(name).not.toContain("$");
    fireEvent.click(screen.getByText("View data"));
    const table = screen.getByRole("table");
    expect(within(table).getByText("2 units")).toBeDefined();
    expect(within(table).getByText("Second series")).toBeDefined();
    expect(document.querySelector('svg[role="img"], svg title, svg animate')).toBeNull();
  });
  it("uses distinct readout IDs across instances and escapes caller labels", () => {
    render(<><StackedBarChart {...defaults} selectedBucketId="one" label="<b>First</b>" />
      <StackedBarChart {...defaults} selectedBucketId="two" /></>);
    expect(new Set(screen.getAllByRole("status").map(({ id }) => id)).size).toBe(2);
    expect(document.querySelector("b")).toBeNull();
  });
});

describe("pointer tooltip", () => {
  function pointer(element: Element, type: string, x = 100, y = 100, eventType = "pointermove") {
    const event = new Event(eventType, { bubbles: true });
    Object.defineProperties(event, {
      pointerType: { value: type }, clientX: { value: x }, clientY: { value: y },
    });
    fireEvent(element, event);
  }
  it("follows the pointer and keeps the keyboard readout available", () => {
    const { container } = render(<Controlled />);
    const bar = screen.getAllByRole("button")[0];
    fireEvent.mouseEnter(bar, { clientX: 100, clientY: 120 });
    const tooltip = container.querySelector<HTMLElement>("[data-chart-tooltip]")!;
    expect(tooltip.textContent).toContain("First series: 2 units");
    expect(tooltip.style.transform).toBe("translate(114px, 134px)");
    fireEvent.mouseMove(bar, { clientX: 200, clientY: 220 });
    expect(tooltip.style.transform).toBe("translate(214px, 234px)");
    fireEvent.keyDown(bar, { key: "Enter" });
    expect(container.querySelector("[data-chart-tooltip]")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("First bucket");
  });
  it("flips inside viewport edges and clears on pen leave", () => {
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 200, height: 100, x: 0, y: 0, top: 0, right: 200, bottom: 100, left: 0, toJSON: () => ({}),
    });
    try {
      const { container } = render(<Controlled />);
      const bar = screen.getAllByRole("button")[0];
      pointer(bar, "pen", window.innerWidth - 5, window.innerHeight - 5);
      expect(container.querySelector<HTMLElement>("[data-chart-tooltip]")!.style.transform)
        .toBe(`translate(${window.innerWidth - 219}px, ${window.innerHeight - 119}px)`);
      pointer(bar, "pen", 0, 0, "pointerout");
      expect(container.querySelector("[data-chart-tooltip]")).toBeNull();
    } finally { bounds.mockRestore(); }
  });
  it("keeps touch selection without an overlay and accepts the next pen movement", () => {
    const { container } = render(<Controlled />);
    const bar = screen.getAllByRole("button")[0];
    fireEvent.mouseEnter(bar);
    touchDown(bar);
    fireEvent.click(bar);
    expect(container.querySelector("[data-chart-tooltip]")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("First bucket");
    pointer(screen.getAllByRole("button")[1], "pen");
    expect(container.querySelector("[data-chart-tooltip]")!.textContent).toContain("Second bucket");
  });
});
