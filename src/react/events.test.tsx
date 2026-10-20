// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, expect, it } from "vitest";
import { Events } from "./index.js";

afterEach(cleanup);
beforeAll(() => {
  // jsdom has no layout: report a 400px box so the strip draws.
  globalThis.ResizeObserver = class {
    constructor(private cb: ResizeObserverCallback) {}
    observe(el: Element) { this.cb([{ contentRect: { width: 400 } } as ResizeObserverEntry], this as never); void el; }
    unobserve() {}
    disconnect() {}
  } as never;
});

const DAY = 86_400_000;
const from = Date.UTC(2026, 9, 13);
const to = from + 7 * DAY;

it("draws one titled tick per event inside the window and labels the axis", async () => {
  const at = [from + DAY, from + 3 * DAY, from + 3 * DAY + 60_000, to + DAY, from - 1];
  const { container, findByRole } = render(
    <Events at={at} from={from} to={to} label="Restarts" time={(t) => `t${(t - from) / 60_000}`} axis={() => "d"} ticks={7} />,
  );
  const svg = await findByRole("img");
  expect(svg.getAttribute("aria-label")).toBe("Restarts: 3 in the window");
  const marks = [...container.querySelectorAll("[data-event]")];
  expect(marks.map((g) => g.querySelector("title")?.textContent)).toEqual(["t1440", "t4320", "t4321"]);
  expect(container.querySelectorAll("text.ov-axis")).toHaveLength(8);
});

it("keeps the axis with no events and refuses an empty window", async () => {
  const { container, findByRole } = render(<Events at={[]} from={from} to={to} label="Restarts" />);
  expect((await findByRole("img")).getAttribute("aria-label")).toBe("Restarts: 0 in the window");
  expect(container.querySelectorAll("[data-event]")).toHaveLength(0);
  expect(() => render(<Events at={[]} from={to} to={from} label="x" />)).toThrow(RangeError);
});
