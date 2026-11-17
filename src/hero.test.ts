// @vitest-environment jsdom
import { palettes } from "@tangle-network/brand";
import { knot } from "@tangle-network/brand/knot";
import { expect, it } from "vitest";
import { figureCss } from "./css.generated.js";
import { HERO_COLORS, type Hero, renderHero } from "./index.js";

const heroes: Hero[] = [
  { motif: "floor", alt: "Six bars above a floor line; four short bars below it.", values: [31211, 32296, 47365, 47965, 48253, 62616], below: [2000, 8000, 12000, 20000] },
  { motif: "lanes", alt: "Twelve lanes weave into three.", inputs: 12, outputs: 3 },
  { motif: "sandbox", alt: "One workspace in a grid; two probes reach a neighbouring cell and two stop at its boundary.", probes: ["allowed", "denied", "allowed", "denied"] },
  { motif: "trace", alt: "Six steps, each checked; the third retries once and the last stops.", steps: ["pass", "pass", "retry", "pass", "pass", "stop"] },
];
const longest: Extract<Hero, { motif: "trace" }>["steps"] = ["retry", "retry", "pass", "retry", "pass", "pass", "retry", "pass", "pass", "stop"];
// The largest input each motif accepts.
const limits: Hero[] = [
  { motif: "floor", alt: "x", values: Array.from({ length: 12 }, (_, i) => 2000 + i * 977), below: Array.from({ length: 8 }, (_, i) => 10 + i * 90) },
  { motif: "lanes", alt: "x", inputs: 24, outputs: 6 },
  { motif: "sandbox", alt: "x", probes: ["denied", "denied", "denied", "denied"] },
  { motif: "sandbox", alt: "x", probes: ["allowed", "allowed", "allowed", "allowed"] },
  { motif: "trace", alt: "x", steps: longest },
  { motif: "trace", alt: "x", steps: Array.from({ length: 10 }, () => "retry" as const) },
];
const parse = (svg: string) => new DOMParser().parseFromString(svg, "image/svg+xml");
const nums = (svg: string, re: RegExp) => [...svg.matchAll(re)].map((m) => Number(m[1]));

it("draws every motif as deterministic, well-formed SVG under 30 KB, with only its own ids, in the band and the card", () => {
  for (const hero of [...heroes, ...limits]) {
    const band = renderHero(hero, { id: "h" });
    expect(renderHero(hero, { id: "h" })).toBe(band);
    expect(band.length).toBeLessThan(30_000);
    // The largest output: the longest input with a 300-character alt that escapes to six times its length, before the mark.
    expect(renderHero({ ...hero, alt: '"'.repeat(300) }, { id: "h", frame: "og" }).length).toBeLessThan(12_000);
    expect(band).toContain('viewBox="0 0 1200 400"');
    expect(band).toContain('role="img"');
    expect(band).toContain(`<title id="h-alt">${hero.alt}</title>`);
    // Art only: no text to read, no bitmap, script or stylesheet, so it rasterizes the same everywhere.
    expect(band).not.toMatch(/<text|<image|<script|<style|style=|href=/);
    const doc = parse(band);
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
    const ids = [...doc.querySelectorAll("[id]")].map((el) => el.id);
    expect(ids.every((x) => x.startsWith("h-"))).toBe(true);
    for (const ref of [...band.matchAll(/url\(#([^)]+)\)|aria-labelledby="([^"]+)"/g)].map((m) => m[1] ?? m[2])) expect(ids).toContain(ref);
    const card = renderHero(hero, { id: "h", frame: "og", mark: '<circle r="4"/>' });
    expect(card).toContain('viewBox="0 0 1200 630"');
    expect(card).toContain('<g transform="translate(56 526)"><circle r="4"/></g>');
  }
});

it("draws each column at its value, every short request under the floor, even at extreme ratios", () => {
  for (const [values, below] of [[[31211, 32296, 47365, 47965, 48253, 62616], [2000, 8000, 12000, 20000]], [[10, 100], [0.5]], [[5, 5, 5], [4.9]]]) {
    const svg = renderHero({ motif: "floor", alt: "x", values, below }, { id: "h" });
    // Column path: M x base V (top + ry) a (w/2) ry ...; the top is V - ry.
    const cols = [...svg.matchAll(/<path d="M[\d.]+ 336V([\d.]+)a[\d.]+ ([\d.]+) /g)].map((m) => 336 - (Number(m[1]) - Number(m[2])));
    const heights = [...values, ...below].map((v) => (v / Math.max(...values, ...below)) * 260);
    expect(cols).toHaveLength(heights.length);
    cols.forEach((h, i) => expect(Math.abs(h - heights[i]!)).toBeLessThan(0.3));
    const floorY = nums(svg, /<line x1="0" y1="([\d.]+)" x2="1200" y2="[\d.]+" stroke="#e4e4e4" stroke-width="3"/g)[0]!;
    expect(Math.abs(floorY - (336 - (Math.min(...values) / Math.max(...values, ...below)) * 260))).toBeLessThan(0.1);
    cols.slice(values.length).forEach((h) => expect(336 - h).toBeGreaterThan(floorY));
    // Each short request is refused at the floor.
    expect(svg.match(/l18 18M/g)).toHaveLength(below.length);
  }
});

it("draws one mark per input, inside the part a phone keeps", () => {
  const lanes = renderHero({ motif: "lanes", alt: "x", inputs: 24, outputs: 6 }, { id: "h" });
  expect(lanes.match(/stroke-opacity="\.85"/g)).toHaveLength(24);
  expect(lanes.match(/<circle cx="660"/g)).toHaveLength(6);
  for (const y of nums(lanes, /<path d="M-10 ([\d.]+)H250/g)) {
    expect(y).toBeGreaterThanOrEqual(50);
    expect(y).toBeLessThanOrEqual(350);
  }
  // Providers are never drawn in the status tones.
  expect(lanes).not.toMatch(new RegExp(`${HERO_COLORS.pass}|${HERO_COLORS.stop}|${HERO_COLORS.retry}`));

  const sandbox = renderHero({ motif: "sandbox", alt: "x", probes: ["allowed", "denied", "allowed", "denied"] }, { id: "h" });
  expect(sandbox.match(/<circle [^>]*r="9" fill="#1baf7a"/g)).toHaveLength(2);
  expect(sandbox.match(/stroke="#e05252" stroke-width="6"/g)).toHaveLength(2);

  for (const steps of [["retry", "stop"], longest] as const) {
    const trace = renderHero({ motif: "trace", alt: "x", steps: [...steps] }, { id: "h" });
    expect(trace.match(/<circle [^>]*r="14"/g)).toHaveLength(steps.length);
    // Checks, pills, retry loops and their arrowheads, and the stop bar.
    const xs = [/<circle cx="([\d.]+)" cy="214"/g, /<rect x="([\d.]+)" y="198"/g, /<path d="M([\d.]+) 200C/g, /<path d="M([\d.]+) 184l/g, /<line x1="([\d.]+)" y1="188"/g].flatMap((re) => nums(trace, re));
    expect(xs.length).toBeGreaterThan(steps.length * 2);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(250);
      expect(x).toBeLessThanOrEqual(950);
    }
  }
});

it("escapes the alt and refuses a hero it cannot draw honestly", () => {
  expect(renderHero({ ...heroes[0]!, alt: ' A <b> & "c" ' }, { id: "h" })).toContain('<title id="h-alt">A &lt;b&gt; &amp; &quot;c&quot;</title>');
  const floor = heroes[0] as Extract<Hero, { motif: "floor" }>;
  expect(() => renderHero({ ...floor, alt: " " }, { id: "h" })).toThrow(/alt/);
  expect(() => renderHero({ ...floor, alt: "a￾b" }, { id: "h" })).toThrow(/alt/);
  expect(() => renderHero({ ...floor, alt: "a\uD800b" }, { id: "h" })).toThrow(/alt/);
  expect(() => renderHero(floor, { id: "1bad" })).toThrow(/id/);
  expect(() => renderHero(floor, undefined as never)).toThrow(/^hero: .*id/);
  expect(() => renderHero(floor, { id: "h", frame: "square" as never })).toThrow(/frame/);
  expect(() => renderHero({ ...floor, values: [1, 100], below: [] }, { id: "h" })).toThrow(/tenth/);
  expect(() => renderHero({ ...floor, below: [31211] }, { id: "h" })).toThrow(/under the floor/);
  expect(() => renderHero({ ...floor, values: [] }, { id: "h" })).toThrow(/values/);
  expect(() => renderHero({ ...floor, values: [1, Number.NaN] }, { id: "h" })).toThrow(/finite/);
  expect(() => renderHero({ ...floor, values: new Array(3) }, { id: "h" })).toThrow(/finite/);
  expect(() => renderHero({ motif: "lanes", alt: "x", inputs: 3, outputs: 3 }, { id: "h" })).toThrow(/fewer/);
  expect(() => renderHero({ motif: "trace", alt: "x", steps: ["stop", "pass"] }, { id: "h" })).toThrow(/last step/);
  expect(() => renderHero({ motif: "sandbox", alt: "x", probes: ["maybe" as never] }, { id: "h" })).toThrow(/allowed, denied/);
  expect(() => renderHero({ motif: "sandbox", alt: "x", probes: ["allowed", "allowed", "allowed", "allowed", "allowed"] }, { id: "h" })).toThrow(/probes/);
  expect(() => renderHero({ motif: "spiral", alt: "x" } as never, { id: "h" })).toThrow(/unknown motif/);
});

it("takes every colour from its owner", () => {
  expect([HERO_COLORS.violet, HERO_COLORS.blue]).toEqual([...knot.stops]);
  expect([HERO_COLORS.field, HERO_COLORS.ink]).toEqual([palettes.websiteDark.canvas, palettes.websiteDark.ink]);
  expect(figureCss).toMatch(new RegExp(`--chart-outcome-ok:[^;]*${HERO_COLORS.pass}`));
  expect(figureCss).toMatch(new RegExp(`--chart-ending-died:[^;]*${HERO_COLORS.stop}`));
  expect(figureCss).toMatch(new RegExp(`--chart-outcome-rate-limit:[^;]*${HERO_COLORS.retry}`));
});
