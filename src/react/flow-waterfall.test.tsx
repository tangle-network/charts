// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FlowTrace } from "../flow-trace.js";
import { FlowWaterfall, type FlowWaterfallWindow } from "./index.js";

// jsdom has no layout observers or animation frames; the component only needs them to exist.
beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  globalThis.matchMedia ??= ((query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof matchMedia;
});
afterEach(cleanup);

// root (0-1000) → plan (0-200), build (200-1000) → compile (200-900), link (900-1000)
const trace: FlowTrace = {
  totalMs: 1000, promptTokens: 0, completionTokens: 0,
  spans: [
    { id: "root", kind: "tool", name: "root", startMs: 0, endMs: 1000, status: "done" },
    { id: "plan", parentId: "root", kind: "tool", name: "plan", startMs: 0, endMs: 200, status: "done" },
    { id: "build", parentId: "root", kind: "tool", name: "build", startMs: 200, endMs: 1000, status: "done" },
    { id: "compile", parentId: "build", kind: "tool", name: "compile", startMs: 200, endMs: 900, status: "done" },
    { id: "link", parentId: "build", kind: "tool", name: "link", startMs: 900, endMs: 1000, status: "done" },
  ],
};

const rowIds = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('[role="treegrid"] [role="row"][data-span-id]:not(.fw-sticky-row)')].map((row) => row.dataset.spanId);

describe("FlowWaterfall host-owned state", () => {
  it("marks the chain that gates the trace's end when asked", () => {
    const { container } = render(<FlowWaterfall trace={trace} criticalPath />);
    const critical = [...container.querySelectorAll<HTMLElement>("[data-critical]")].map((row) => row.dataset.spanId);
    expect(new Set(critical)).toEqual(new Set(["root", "build", "link"]));
    cleanup();
    const plain = render(<FlowWaterfall trace={trace} />);
    expect(plain.container.querySelectorAll("[data-critical]")).toHaveLength(0);
  });

  it("shows the host's search text and reports edits without applying them", () => {
    const seen: string[] = [];
    const { container, rerender } = render(<FlowWaterfall trace={trace} query="link" onQueryChange={(q) => seen.push(q)} />);
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    expect(input.value).toBe("link");
    expect(rowIds(container)).toContain("link");
    expect(rowIds(container)).not.toContain("plan");
    fireEvent.change(input, { target: { value: "plan" } });
    expect(seen).toEqual(["plan"]);
    expect(input.value).toBe("link");
    rerender(<FlowWaterfall trace={trace} query="plan" onQueryChange={(q) => seen.push(q)} />);
    expect(rowIds(container)).toContain("plan");
    expect(rowIds(container)).not.toContain("link");
  });

  it("folds from the host's set and reports toggles", () => {
    const seen: string[][] = [];
    const { container, rerender, getByRole } = render(
      <FlowWaterfall trace={trace} collapsed={new Set(["build"])} onCollapsedChange={(next) => seen.push([...next])} />,
    );
    expect(rowIds(container)).toEqual(["root", "plan", "build"]);
    fireEvent.click(getByRole("button", { name: "Expand build" }));
    expect(seen).toEqual([[]]);
    rerender(<FlowWaterfall trace={trace} collapsed={new Set()} onCollapsedChange={(next) => seen.push([...next])} />);
    expect(rowIds(container)).toEqual(["root", "plan", "build", "compile", "link"]);
  });

  it("searches with the host's matcher when given", () => {
    const { container } = render(
      <FlowWaterfall trace={trace} query="tag:fast" matchSpan={(span, query) => query === "tag:fast" && span.name === "link"} />,
    );
    expect(rowIds(container)).toEqual(["root", "build", "link"]);
  });

  it("zooms from the host's window and reports each change", () => {
    const seen: (FlowWaterfallWindow | null)[] = [];
    const window = { startMs: 200, endMs: 600 };
    const { container } = render(<FlowWaterfall trace={trace} zoom={window} onZoomChange={(next) => seen.push(next)} />);
    container.querySelector<HTMLElement>('[role="row"][tabindex="0"]')!.focus();
    fireEvent.keyDown(document, { key: "+" });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.endMs - seen[0]!.startMs).toBeLessThan(window.endMs - window.startMs);
    fireEvent.keyDown(document, { key: "0" });
    expect(seen[1]).toBeNull();
  });
});
