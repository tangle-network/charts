import { describe, expect, it } from "vitest";
import { isRefusal, phaseWaterfall, smallMultiples, timeline, timeSeries, type Figure, type MultiplePanel, type Refusal } from "./index.js";

function figure(value: Figure | Refusal): Figure {
  if (isRefusal(value)) throw new Error(value.refused);
  return value;
}
const axes = { x: { label: "hour", domain: [0, 4] as [number, number] }, y: { label: "check score", unit: "pts", domain: [0, 10] as [number, number] } };
const score = [{ id: "a", label: "Arm A", points: [{ x: 0, y: 2 }, { x: 1, y: 6 }, { x: 2, y: null }, { x: 3, y: 9 }] }];

describe("time series marks and bands", () => {
  const marked = { ...axes, marks: [
    { at: 1, label: "first pass", kind: "pass" as const },
    { at: 4, label: "deadline", kind: "deadline" as const },
    { at: 2.5, label: "supervisor died", kind: "died" as const },
  ], bands: [
    { from: 1, to: 4, label: "after first pass", kind: "after-pass" as const },
    { from: 1.8, to: 2.4, label: "no trace", kind: "missing" as const },
  ] };

  it("draws each recorded event kind, hatches missing spans and lists every event in the table", () => {
    const f = figure(timeSeries(score, marked));
    for (const kind of ["pass", "deadline", "died"]) expect(f.svg.wide).toContain(`data-mark="${kind}"`);
    expect(f.svg.wide).toContain('class="tgc-mark tgc-mark-deadline"');
    expect(f.svg.wide).toContain('data-band="after-pass"');
    expect(f.svg.wide).toMatch(/data-band="missing"><g class="tgc-band tgc-band-missing" data-hatched="true">/);
    expect(f.svg.narrow).toContain('data-mark="pass"');
    expect(f.table).toContain("Recorded events by hour");
    expect(f.table.indexOf("first pass")).toBeLessThan(f.table.indexOf("supervisor died"));
    expect(f.table).toContain("<td>no data</td>");
    expect(f.read).toContain("dashed: deadline");
    expect(f.note.exclusions).toContain("no trace: no data from hour 1.8 to hour 2.4.");
  });

  it("keeps a deadline after the last observation inside the axis without moving the data", () => {
    const plain = figure(timeSeries(score, axes));
    const f = figure(timeSeries(score, marked));
    expect(f.svg.wide).toMatch(/class="tgc-mark tgc-mark-deadline" x1="696"/);
    expect(f.svg.wide.match(/<polyline[^>]*>/g)).toEqual(plain.svg.wide.match(/<polyline[^>]*>/g));
  });

  it("leaves figures without events unchanged", () => {
    expect(timeSeries(score, { ...axes, marks: [], bands: [] })).toEqual(timeSeries(score, axes));
  });

  it.each([
    [{ marks: [{ at: 5, label: "late", kind: "deadline" as const }] }, "inside the axis domain"],
    [{ marks: [{ at: 1, label: "x", kind: "winner" as never }] }, "unknown mark kind"],
    [{ marks: [{ at: 1, label: " ", kind: "pass" as const }] }, "needs a label"],
    [{ bands: [{ from: 3, to: 2, label: "idle", kind: "idle" as const }] }, "increasing bounds"],
  ])("refuses events it cannot place honestly (%#)", (events, reason) => {
    const result = timeSeries(score, { ...axes, ...events });
    expect(isRefusal(result) && result.refused).toContain(reason);
  });

  it("gives later series a marker shape as well as a dash", () => {
    const f = figure(timeSeries([...score, { id: "b", label: "Arm B", points: [{ x: 0, y: 1 }, { x: 1, y: 3 }] }], axes));
    expect(f.svg.wide).toMatch(/<path class="tgc-series-point" d="M[\d.]+ [\d.]+h/);
    expect(f.svg.wide.match(/class="tgc-series-key"/g)).toHaveLength(2);
    expect(f.svg.wide).toContain("stroke-dasharray:4 3");
  });
});

describe("run timeline lanes", () => {
  const t = Date.UTC(2026, 9, 15, 11, 0);
  const min = 60_000;
  const lanes = [
    { id: "driver", label: "Driver", spans: [
      { start: t, end: t + 30 * min, state: "work" },
      { start: t + 30 * min, end: t + 90 * min, state: "untraced", note: "supervisor down" },
      { start: t + 90 * min, end: null, state: "work" },
    ] },
    { id: "keeper", label: "Keeper", spans: [{ start: t + 10 * min, end: t + 20 * min, state: "idle" }] },
  ];
  const options = { measure: "run activity", now: t + 120 * min, marks: [{ at: t + 100 * min, label: "first pass", kind: "pass" as const }] };

  it("draws several spans per lane, an open span to now, hatched untraced time and listed marks", () => {
    const f = figure(timeline(lanes, options));
    expect(f.svg.wide.match(/data-state="work"/g)).toHaveLength(2);
    expect(f.svg.wide).toMatch(/data-state="untraced"><g class="tgc-span tgc-span-missing" data-hatched="true">/);
    expect(f.svg.wide).toContain('data-open="true"');
    expect(f.svg.wide).toContain("tgc-span tgc-span-open");
    expect(f.svg.wide).toContain("tgc-span tgc-span-muted");
    expect(f.svg.wide).toContain('class="tgc-now"');
    expect(f.svg.wide).toContain("now 13:00");
    expect(f.lede).toBe("4 recorded spans; 1 open at 13:00; 1 without data (1.0 h).");
    expect(f.table).toContain("<td>open</td>");
    expect(f.table).toContain("supervisor down");
    expect(f.table).toContain("Recorded events by time");
    expect(f.note.exclusions).toEqual(["Driver: untraced 11:30 to 12:30 has no data."]);
  });

  it("refuses an open span without now, a span outside the window and reversed times", () => {
    expect(isRefusal(timeline(lanes, { measure: "run activity" }))).toBe(true);
    expect(isRefusal(timeline(lanes, { ...options, end: t + 60 * min }))).toBe(true);
    expect(isRefusal(timeline([{ id: "a", label: "A", spans: [{ start: t + min, end: t, state: "work" }] }], options))).toBe(true);
    expect(isRefusal(timeline([{ id: "a", label: "A", spans: [] }, { id: "a", label: "B", spans: [] }], options))).toBe(true);
  });
});

describe("part of whole with untraced time", () => {
  it("hatches producer-labelled unaccounted leaves and the unassigned remainder", () => {
    const f = figure(phaseWaterfall([{ id: "work", label: "Agent work", ms: 1000 }, { id: "idle", label: "Idle", ms: 3000, kind: "unaccounted" }], { measure: "wall time", totalMs: 7000 }));
    expect(f.svg.wide.match(/class="tgc-waterfall-unaccounted" data-hatched="true"/g)).toHaveLength(2);
    expect(f.read).toContain("Hatched bars");
  });
});

describe("small multiples", () => {
  const panels: MultiplePanel[] = [
    { id: "a", label: "Arm A", points: [{ x: 0, y: 1 }, { x: 2, y: 5 }, { x: 4, y: 8 }] },
    { id: "b", label: "Arm B", unit: "pts", points: [{ x: 0, y: 2 }, { x: 1, y: 4 }], end: { at: 1.5, kind: "died" } },
    { id: "c", label: "Arm C", missing: { why: "infra failure", detail: "sandbox never started" } },
    { id: "d", label: "Arm D", points: [{ x: 0, y: 0 }, { x: 4, y: 3 }] },
  ];
  const options = { ...axes, shared: "both" as const, noun: "arm" };

  it("counts arms with data, hatches a missing arm with its reason and ends a dead arm at a died mark", () => {
    const f = figure(smallMultiples(panels, options));
    expect(f.lede).toBe("3 of 4 arms have data; 1 ended before the window closed.");
    const missing = f.svg.wide.match(/<g data-panel="c" data-missing="true">.*?<\/g><\/g>/)?.[0] ?? "";
    expect(missing).toContain('data-hatched="true"');
    expect(f.svg.wide).toContain("no data: infra failure");
    expect(f.svg.wide).not.toMatch(/data-panel="c"[^]*?tgc-series-line[^]*?data-panel="d"/);
    expect(f.svg.wide).toMatch(/data-panel="b">[^]*data-mark="died"/);
    expect(f.table).toContain("no data: infra failure");
    expect(f.table).toContain("sandbox never started");
    expect(f.table).toContain("Arm B: died");
    expect(f.note.exclusions).toEqual(["Arm C: no data: infra failure (sandbox never started).", "Arm B: died at hour 1.5."]);
    expect(f.svg.narrow).toContain("no data: infra failure");
  });

  it("refuses mixed units, out-of-domain panels, points after the end and a missing panel with data", () => {
    const refused = (list: MultiplePanel[], o = options) => { const r = smallMultiples(list, o); return isRefusal(r) ? r.refused : ""; };
    expect(refused([{ ...panels[0]!, unit: "%" }])).toContain("Mixed units");
    expect(refused([{ id: "x", label: "X", points: [{ x: 0, y: 11 }] }])).toContain("outside the recorded axis domain");
    expect(refused([{ id: "x", label: "X", points: [{ x: 5, y: 1 }] }])).toContain("inside the shared domain");
    expect(refused([{ id: "x", label: "X", points: [{ x: 0, y: 1 }, { x: 2, y: 1 }], end: { at: 1, kind: "died" } }])).toContain("after the panel's end");
    expect(refused([{ id: "x", label: "X", missing: { why: "infra" }, points: [{ x: 0, y: 1 }] }])).toContain("cannot also carry points");
    expect(refused([{ id: "x", label: "X", missing: { why: "" } }])).toContain("needs its reason");
    expect(refused([panels[0]!], { ...options, shared: "x" })).toContain("each panel's y domain");
    expect(isRefusal(smallMultiples([{ ...panels[0]!, domain: [0, 100] }], { ...options, shared: "x" }))).toBe(false);
  });
});
