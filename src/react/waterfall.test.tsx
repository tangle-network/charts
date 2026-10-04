// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WaterfallHeader, WaterfallRow, waterfallSpanGeometry, waterfallTicks } from "./waterfall.js";

afterEach(cleanup);

describe("shared Intelligence waterfall", () => {
  it("preserves gaps and overlapping spans in one timing window", () => {
    const window = { startMs: 1000, endMs: 2000 };
    expect(waterfallSpanGeometry(1100, 1300, window)).toMatchObject({ offsetPct: 10, widthPct: 20 });
    expect(waterfallSpanGeometry(1200, 1500, window)).toMatchObject({ offsetPct: 20, widthPct: 30 });
    expect(waterfallSpanGeometry(1800, 1900, window)).toMatchObject({ offsetPct: 80, widthPct: 10 });
  });

  it("keeps original clipping and minimum markers without changing reported duration", () => {
    const window = { startMs: 1000, endMs: 2000 };
    expect(waterfallSpanGeometry(900, 1200, window)).toEqual({
      offsetPct: 0, widthPct: 20, startOffsetMs: -100, durationMs: 300, clipped: true,
    });
    expect(waterfallSpanGeometry(2100, 2300, window)).toMatchObject({ offsetPct: 99, widthPct: 0.5, durationMs: 200, clipped: true });
    expect(waterfallSpanGeometry(1200, 1201, window)).toMatchObject({ offsetPct: 20, widthPct: 0.5, durationMs: 1, clipped: false });
  });

  it("refuses missing or reversed times rather than plotting a measured zero", () => {
    for (const [start, end] of [[NaN, 10], [0, Infinity], [20, 10]]) {
      expect(() => waterfallSpanGeometry(start, end, { startMs: 0, endMs: 100 })).toThrow(RangeError);
    }
    expect(() => waterfallSpanGeometry(0, 10, { startMs: 100, endMs: 0 })).toThrow(RangeError);
    expect(waterfallTicks(0)).toEqual([]);
  });

  it("retains round axis ticks and space for readable labels", () => {
    expect(waterfallTicks(14011)).toEqual([0, 6000, 12000]);
    expect(waterfallTicks(14011, 400)).toEqual([0, 4000, 8000, 12000]);
    expect(() => waterfallTicks(Infinity)).toThrow(RangeError);
    expect(() => waterfallTicks(1000, 0)).toThrow(RangeError);
  });

  it("renders the recorded baseline offset and duration with caller-owned issue selection", () => {
    const { container, getByText } = render(<div>
      <WaterfallHeader windowMs={14011} label="Tool call" />
      <button type="button" aria-selected="true">
        <WaterfallRow label="Baseline tests" startMs={10188} endMs={10622}
          window={{ startMs: 3879, endMs: 17890 }} tone="error" />
      </button>
    </div>);
    expect(getByText("434ms")).toBeTruthy();
    const bar = container.querySelector<HTMLElement>("[data-waterfall-bar]")!;
    expect(parseFloat(bar.style.left)).toBeCloseTo(6309 / 14011 * 100);
    expect(parseFloat(bar.style.width)).toBeCloseTo(434 / 14011 * 100);
    expect(container.querySelector("[data-waterfall-track]")?.getAttribute("data-tone")).toBe("error");
    expect(container.querySelectorAll("button")).toHaveLength(1);
  });

  it("keeps incomplete telemetry readable without inventing a completed timing bar", () => {
    const { container } = render(<WaterfallRow label="Incomplete span" startMs={20} endMs={0}
      window={{ startMs: 0, endMs: 100 }} />);
    expect(container.querySelector("[data-waterfall-track]")?.getAttribute("data-unavailable")).toBe("true");
    expect(container.querySelector("[data-waterfall-bar]")).toBeNull();
    expect(container.querySelector("[data-waterfall-duration]")?.textContent).toBe("—");
  });
});
