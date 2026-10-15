// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { smallMultiples } from "../small-multiples.js";
import { FigureView } from "./figure-view.js";
import { Gantt, Lines, Meter } from "./live.js";

// jsdom has no layout: report a fixed container width to the charts' ResizeObserver.
let observedWidth = 800;
class FixedWidthObserver {
  private readonly callback: (entries: Array<{ contentRect: { width: number } }>) => void;
  constructor(callback: (entries: Array<{ contentRect: { width: number } }>) => void) { this.callback = callback; }
  observe() { this.callback([{ contentRect: { width: observedWidth } }]); }
  disconnect() {}
  unobserve() {}
}
beforeEach(() => { observedWidth = 800; vi.stubGlobal("ResizeObserver", FixedWidthObserver); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const h = 3_600_000;
const t = Date.UTC(2026, 9, 15, 11, 0);
const clock = (ms: number) => new Date(ms).toISOString().slice(11, 16);

describe("Lines marks, bands and second channel", () => {
  const series = [
    { name: "Arm A", color: "var(--chart-accent)", points: [[t, 1], [t + h, 4]] as [number, number][] },
    { name: "Arm B", color: "var(--chart-muted)", points: [[t, 2], [t + h, 3]] as [number, number][], dash: "dash" as const, marker: "square" as const },
  ];
  const marks = [{ at: t + 0.5 * h, label: "first pass", kind: "pass" as const }, { at: t + 2 * h, label: "deadline", kind: "deadline" as const }];
  const bands = [{ from: t + 0.5 * h, to: t + h, label: "after first pass", kind: "after-pass" as const }, { from: t + 1.2 * h, to: t + 1.5 * h, label: "no trace", kind: "missing" as const }];

  it("draws each mark and band, hatches missing time and lists every event as text", () => {
    const { container } = render(<Lines series={series} marks={marks} bands={bands} axis={clock} />);
    expect(container.querySelector('[data-mark="pass"] line')?.getAttribute("class")).toBe("ov-mark ov-mark-pass");
    expect(container.querySelector('[data-mark="deadline"] line')?.getAttribute("class")).toBe("ov-mark ov-mark-deadline");
    expect(container.querySelector('[data-band="missing"]')?.getAttribute("data-hatched")).toBe("true");
    expect(container.querySelector('[data-band="missing"] path.ov-hatch')?.getAttribute("d")).toMatch(/^M/);
    const events = screen.getByRole("list", { name: "Recorded events" });
    expect(Array.from(events.querySelectorAll("li")).map((li) => li.textContent)).toEqual([
      "first pass · 11:30", "after first pass · 11:30 to 12:00", "no trace · 12:12 to 12:30 · no data", "deadline · 13:00",
    ]);
  });

  it("widens the time axis to a deadline after the last point", () => {
    const { container } = render(<Lines series={series} marks={marks} axis={clock} />);
    const deadline = Number(container.querySelector('[data-mark="deadline"] line')?.getAttribute("x1"));
    const lastPoint = container.querySelector("polyline")!.getAttribute("points")!.split(" ").at(-1)!.split(",")[0];
    expect(deadline).toBeCloseTo(800 - 10);
    expect(Number(lastPoint)).toBeLessThan(deadline);
  });

  it("gives series a dash and marker channel with a key", () => {
    const { container } = render(<Lines series={series} axis={clock} />);
    const arm = container.querySelector('[data-series="Arm B"]')!;
    expect(arm.getAttribute("data-dash")).toBe("dash");
    expect(arm.querySelector("polyline")?.getAttribute("stroke-dasharray")).toBe("9 5");
    expect(arm.querySelectorAll("path")).toHaveLength(2);
    expect(container.querySelector('[data-series="Arm A"] polyline')?.getAttribute("stroke-dasharray")).toBeNull();
    expect(screen.getByRole("list", { name: "Series" }).textContent).toBe("Arm AArm B");
  });

  it("refuses an unplaceable mark", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Lines series={series} marks={[{ at: NaN, label: "x", kind: "pass" }]} />)).toThrow(RangeError);
  });
});

describe("Gantt lanes", () => {
  const lanes = [
    { id: "driver", label: "Driver", spans: [
      { start: t, end: t + h, state: "work" },
      { start: t + h, end: t + 2 * h, state: "untraced" },
      { start: t + 2 * h, end: null, state: "work" },
    ] },
    { id: "keeper", label: "Keeper", spans: [{ start: t, end: t + 0.5 * h, state: "work" }] },
  ];
  const props = { colors: { work: "var(--chart-accent)" }, axis: clock, span: (a: number, b: number) => `${clock(a)}–${clock(b)}` };

  it("draws several spans per lane, an open span to now, hatched untraced time and marks", () => {
    const { container } = render(<Gantt {...props} lanes={lanes} now={t + 3 * h} marks={[{ at: t + 2.5 * h, label: "first pass", kind: "pass" }]} />);
    expect(container.querySelectorAll('[data-lane="driver"] [data-state]')).toHaveLength(3);
    expect(container.querySelector('[data-state="untraced"]')?.getAttribute("data-hatched")).toBe("true");
    const open = container.querySelector('[data-open="true"] rect')!;
    const now = Number(container.querySelector('[data-now="true"]')?.getAttribute("x1"));
    expect(Number(open.getAttribute("x")) + Number(open.getAttribute("width"))).toBeCloseTo(now);
    expect(container.querySelector('[data-mark="pass"]')).not.toBeNull();
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("2 lanes over time");
  });

  it("refuses an open span without now and keeps single-span rows working", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Gantt {...props} lanes={lanes} />)).toThrow(RangeError);
    cleanup();
    // Recorded rows with a clock-skewed end keep drawing as before instead of throwing on an existing page.
    const { container } = render(<Gantt {...props} rows={[{ label: "Agent", start: t, end: t + h, state: "work" }, { label: "Skewed", start: t + h, end: t, state: "work" }]} />);
    expect(container.querySelectorAll("[data-state]")).toHaveLength(2);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("2 agents over time");
  });
});

describe("Meter segments", () => {
  it("draws parts of the whole and hatches the untraced remainder", () => {
    const { container } = render(<Meter total={10} format={(v) => `${v} h`} segments={[{ label: "agent work", value: 3 }, { label: "idle", value: 2 }]} />);
    const parts = Array.from(container.querySelectorAll<HTMLElement>(".ov-meter-track > span"));
    expect(parts.map((p) => [p.dataset.segment, p.style.width, p.dataset.hatched ?? ""])).toEqual([["agent work", "30%", ""], ["idle", "20%", ""], ["untraced", "50%", "true"]]);
    expect(container.querySelector('li[data-segment="untraced"]')?.textContent).toBe("untraced5 h · 50%");
    expect(container.querySelector(".ov-meter-text")?.textContent).toBe("5 h of 10 h accounted · 50%");
  });

  it("lists a missing part as not recorded and hatches a missing total instead of drawing zero", () => {
    const { container } = render(<Meter total={null} segments={[{ label: "agent work", value: 3 }, { label: "tokens", value: null }]} />);
    expect(container.querySelector(".ov-meter-track")?.getAttribute("data-hatched")).toBe("true");
    expect(container.querySelectorAll(".ov-meter-track > span")).toHaveLength(0);
    expect(container.querySelector('li[data-segment="tokens"]')?.textContent).toBe("tokensnot recorded");
    expect(container.querySelector(".ov-meter-text")?.textContent).toBe("total not recorded");
  });

  it("refuses parts that exceed the whole", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Meter total={1} segments={[{ label: "a", value: 2 }]} />)).toThrow(RangeError);
  });
});

describe("FigureView", () => {
  const figure = smallMultiples([
    { id: "a", label: "Arm A", points: [{ x: 0, y: 1 }, { x: 1, y: 2 }] },
    { id: "b", label: "Arm B", missing: { why: "infra failure" } },
  ], { x: { label: "hour", domain: [0, 1] }, y: { label: "score", unit: "pts", domain: [0, 2] }, shared: "both", noun: "arm" });

  it("embeds the wide render in a wide container and the phone render in a narrow one", () => {
    observedWidth = 1000;
    const { container, unmount } = render(<FigureView figure={figure} />);
    expect(container.querySelector("figure")?.getAttribute("data-layout")).toBe("wide");
    expect(container.querySelector(".tgc-view-plot svg")?.getAttribute("width")).toBe("720");
    expect(container.querySelector("details.tgc-data table")).not.toBeNull();
    expect(container.querySelector("details.tgc-data")?.textContent).toContain("1 of 2 arms have data.");
    unmount();
    observedWidth = 390;
    const narrow = render(<FigureView figure={figure} presentation="report" />);
    expect(narrow.container.querySelector("figure")?.getAttribute("data-layout")).toBe("narrow");
    expect(narrow.container.querySelector(".tgc-view-plot svg")?.getAttribute("width")).toBe("358");
    expect(narrow.container.querySelector("h3")?.textContent).toContain("one panel per arm");
  });

  it("renders a refusal as its sentence", () => {
    render(<FigureView figure={{ id: "x", refused: "Mixed units: Arm B records %, the figure draws pts." }} />);
    expect(screen.getByRole("note").textContent).toBe("Mixed units: Arm B records %, the figure draws pts.");
  });
});
