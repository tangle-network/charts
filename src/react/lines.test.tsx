// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Lines } from "./lines.js";

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    constructor(private callback: (entries: unknown[]) => void) {}
    observe() { this.callback([{ contentRect: { width: 800 } }]); }
    disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const series = [{ name: "Recorded score", color: "#8b7cf6", points: [[1, 2], [2, null], [3, 4], [4, 5]] as const }];
describe("shared recorded Lines", () => {
  it("distinguishes empty, unavailable, and a range without observations", async () => {
    const { rerender } = render(<Lines series={[]} />);
    expect(screen.getByText("No history yet.")).toBeTruthy();
    rerender(<Lines series={[{ name: "A", color: "red", points: [[1, null]] }]} />);
    expect(screen.getByText("Not available")).toBeTruthy();
    fireEvent.click(document.querySelector("details summary")!);
    expect((await screen.findByRole("table")).textContent).toContain("Not available");
    rerender(<Lines series={series} xDomain={[5, 6]} />);
    expect(screen.getByText("No recorded points in this range.")).toBeTruthy();
    expect(screen.getByRole("table").querySelectorAll("tbody tr")).toHaveLength(4);
  });
  it("breaks a line at missing readings without inventing an observation", async () => {
    const { container } = render(<Lines series={series} xFormat={String} />);
    expect(container.querySelectorAll("svg path")).toHaveLength(1);
    expect(container.querySelector("svg path")!.getAttribute("d")).toMatch(/^M[^ ]+ L/);
    fireEvent.click(container.querySelector("details summary")!);
    await screen.findByRole("table");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(4);
    expect(container.querySelector("tbody")!.textContent).toContain("Not available");
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
  it("inspects with arrow keys and opens an exact original point after range filtering", () => {
    const onSelect = vi.fn();
    render(<Lines series={series} xDomain={[3, 4]} xFormat={String} onSelect={onSelect} />);
    const chart = screen.getByRole("img");
    fireEvent.focus(chart);
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    fireEvent.keyDown(chart, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith({ seriesIndex: 0, pointIndex: 3, x: 4, y: 5 });
    fireEvent.keyDown(chart, { key: "Home" });
    fireEvent.click(screen.getByRole("button", { name: "Open Recorded score at 3" }));
    expect(onSelect).toHaveBeenLastCalledWith({ seriesIndex: 0, pointIndex: 2, x: 3, y: 4 });
    fireEvent.keyDown(chart, { key: "Escape" });
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("opens only an actual nearby point on click, using both axes and original filtered indices", () => {
    const onSelect = vi.fn();
    const { container } = render(<Lines series={series} xDomain={[3, 4]} xFormat={String} markers onSelect={onSelect} />);
    const point = container.querySelector("svg circle")!;
    fireEvent.click(screen.getByRole("img"), { clientX: Number(point.getAttribute("cx")) + 2, clientY: Number(point.getAttribute("cy")) + 3 });
    expect(onSelect).toHaveBeenCalledWith({ seriesIndex: 0, pointIndex: 2, x: 3, y: 4 });
    onSelect.mockClear();
    fireEvent.click(screen.getByRole("img"), { clientX: Number(point.getAttribute("cx")), clientY: Number(point.getAttribute("cy")) + 80 });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("img"), { clientX: 10, clientY: 200 });
    expect(onSelect).not.toHaveBeenCalled();
  });
  it("retains unresolvable observations but offers and invokes actions only for linked records", async () => {
    const onSelect = vi.fn();
    const { container } = render(<Lines series={series} xDomain={[3, 4]} xFormat={String} markers onSelect={onSelect} canSelect={({ pointIndex }) => pointIndex === 3} />);
    const chart = screen.getByRole("img");
    fireEvent.focus(chart);
    expect(screen.getByText("No linked result")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open Recorded score at 3" })).toBeNull();
    fireEvent.keyDown(chart, { key: "Enter" });
    const point = container.querySelector("svg circle")!;
    fireEvent.click(chart, { clientX: Number(point.getAttribute("cx")), clientY: Number(point.getAttribute("cy")) });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.keyDown(chart, { key: "End" });
    fireEvent.click(screen.getByRole("button", { name: "Open Recorded score at 4" }));
    expect(onSelect).toHaveBeenCalledWith({ seriesIndex: 0, pointIndex: 3, x: 4, y: 5 });
    fireEvent.click(container.querySelector("details summary")!);
    await screen.findByRole("table");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(4);
  });
  it("shares inspection while retaining each series' actual observation time", () => {
    render(<Lines series={[...series, { name: "Second", color: "blue", points: [[1, 0], [5, 8]] }]} xFormat={(x) => `time ${x}`} />);
    fireEvent.focus(screen.getByRole("img"));
    fireEvent.keyDown(screen.getByRole("img"), { key: "End" });
    const readout = document.querySelector(".ov-lines-readout")!;
    expect(readout.textContent).toContain("time 4");
    expect(readout.textContent).toContain("time 5");
  });
  it("inspects stepped frontiers at or before the crosshair rather than using a future record", () => {
    render(<Lines series={[{ name: "A", color: "red", points: [[1, 2], [4, 9]] }, { name: "B", color: "blue", points: [[3, 5], [5, 8]] }]} curve="step" xFormat={(x) => `time ${x}`} />);
    fireEvent.focus(screen.getByRole("img"));
    fireEvent.keyDown(screen.getByRole("img"), { key: "ArrowRight" });
    const readout = document.querySelector(".ov-lines-readout")!;
    expect(readout.textContent).toContain("time 1");
    expect(readout.textContent).toContain("time 3");
    expect(readout.textContent).not.toContain("time 4");
    expect(readout.textContent).not.toContain("time 5");
  });
  it("opens the externally selected series and updates when the selected point changes", () => {
    const onSelect = vi.fn();
    const entries = [...series, { name: "Second", color: "blue", points: [[1, 0], [5, 8]] as const }];
    const { rerender } = render(<Lines series={entries} xFormat={String} selectedPoint={{ seriesIndex: 1, pointIndex: 1 }} onSelect={onSelect} />);
    fireEvent.focus(screen.getByRole("img"));
    fireEvent.keyDown(screen.getByRole("img"), { key: "Enter" });
    expect(onSelect).toHaveBeenLastCalledWith({ seriesIndex: 1, pointIndex: 1, x: 5, y: 8 });
    rerender(<Lines series={entries} xFormat={String} selectedPoint={{ seriesIndex: 1, pointIndex: 0 }} onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByRole("img"), { key: "Enter" });
    expect(onSelect).toHaveBeenLastCalledWith({ seriesIndex: 1, pointIndex: 0, x: 1, y: 0 });
  });
  it("replaces a keyboard pin when the app selects another record and retains that controlled record on Escape", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<Lines series={series} xFormat={String} selectedPoint={{ seriesIndex: 0, pointIndex: 0 }} onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByRole("img"), { key: "End" });
    fireEvent.keyDown(screen.getByRole("img"), { key: "Enter" });
    expect(onSelect).toHaveBeenLastCalledWith({ seriesIndex: 0, pointIndex: 3, x: 4, y: 5 });
    rerender(<Lines series={series} xFormat={String} selectedPoint={{ seriesIndex: 0, pointIndex: 2 }} onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByRole("img"), { key: "Enter" });
    expect(onSelect).toHaveBeenLastCalledWith({ seriesIndex: 0, pointIndex: 2, x: 3, y: 4 });
    fireEvent.keyDown(screen.getByRole("img"), { key: "Escape" });
    expect(screen.getByRole("button", { name: "Open Recorded score at 3" })).toBeTruthy();
  });
  it("draws a single zero, a flat negative series, reference lines and target bands on linear axes", () => {
    const { container, rerender } = render(<Lines series={[{ name: "Zero", color: "red", points: [[1, 0]] }]} xFormat={String} />);
    expect(container.querySelectorAll("svg circle")).toHaveLength(1);
    rerender(<Lines series={[{ name: "Flat", color: "red", points: [[1, -2], [2, -2]] }]} xFormat={String} yDomain={[-4, 0]} references={[{ value: -3, label: "Baseline" }]} bands={[{ min: -1, max: 0, label: "Target" }]} endLabels />);
    expect(screen.getByRole("img").getAttribute("data-scale")).toBe("linear");
    expect(container.querySelector(".ov-reference")).not.toBeNull();
    expect(container.textContent).toContain("Target");
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
  it("rejects contradictory producer positions and values outside a named domain", () => {
    expect(() => render(<Lines series={[{ name: "A", color: "red", points: [[1, 1], [1, 2]] }]} />)).toThrow(/strictly increasing/);
    expect(() => render(<Lines series={series} yDomain={[0, 1]} />)).toThrow(/inside yDomain/);
    expect(() => render(<Lines series={series} bands={[{ min: 8, max: 2, label: "Invalid" }]} />)).toThrow(/ordered bounds/);
  });
});
