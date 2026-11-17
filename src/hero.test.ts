import { knot } from "@tangle-network/brand/knot";
import { expect, it } from "vitest";
import { HERO_COLORS, type Hero, renderHero } from "./index.js";

const heroes: Hero[] = [
  { motif: "floor", alt: "Six bars above a floor line; four short bars below it.", values: [31211, 32296, 47365, 47965, 48253, 62616], below: [2000, 8000, 12000, 20000] },
  { motif: "lanes", alt: "Twelve lanes weave into three.", inputs: 12, outputs: 3 },
  { motif: "sandbox", alt: "One workspace in a grid; two probes pass its boundary and two stop at it.", probes: ["allowed", "denied", "allowed", "denied"] },
  { motif: "trace", alt: "Six steps, each checked; the third retries once and the last stops.", steps: ["pass", "pass", "retry", "pass", "pass", "stop"] },
];

it("draws every motif as deterministic, self-contained SVG under 30 KB, in the band and the social card", () => {
  for (const hero of heroes) {
    const band = renderHero(hero, { id: "h" });
    expect(renderHero(hero, { id: "h" })).toBe(band);
    expect(band.length).toBeLessThan(30_000);
    expect(band).toContain('viewBox="0 0 1200 400"');
    expect(band).toContain('role="img"');
    expect(band).toContain(`<title id="h-alt">${hero.alt}</title>`);
    // Art only: no text to read, no bitmap, script or stylesheet, so it rasterizes the same everywhere.
    expect(band).not.toMatch(/<text|<image|<script|<style|style=|href=/);
    const card = renderHero(hero, { id: "h", frame: "og", mark: "<circle r=\"4\"/>" });
    expect(card).toContain('viewBox="0 0 1200 630"');
    expect(card).toContain('<g transform="translate(56 526)"><circle r="4"/></g>');
  }
});

it("refuses a hero it cannot draw honestly", () => {
  const floor = heroes[0] as Extract<Hero, { motif: "floor" }>;
  expect(() => renderHero({ ...floor, alt: " " }, { id: "h" })).toThrow(/alt/);
  expect(() => renderHero(floor, { id: "1bad" })).toThrow(/id/);
  expect(() => renderHero({ ...floor, below: [31211] }, { id: "h" })).toThrow(/under the floor/);
  expect(() => renderHero({ ...floor, values: [] }, { id: "h" })).toThrow(/values/);
  expect(() => renderHero({ ...floor, values: [1, Number.NaN] }, { id: "h" })).toThrow(/finite/);
  expect(() => renderHero({ motif: "lanes", alt: "x", inputs: 3, outputs: 3 }, { id: "h" })).toThrow(/fewer/);
  expect(() => renderHero({ motif: "trace", alt: "x", steps: ["stop", "pass"] }, { id: "h" })).toThrow(/last step/);
  expect(() => renderHero({ motif: "sandbox", alt: "x", probes: ["maybe" as never] }, { id: "h" })).toThrow(/allowed, denied/);
  expect(() => renderHero({ motif: "spiral", alt: "x" } as never, { id: "h" })).toThrow(/unknown motif/);
});

it("draws in Brand's knot colours", () => {
  expect([HERO_COLORS.violet, HERO_COLORS.blue]).toEqual([...knot.stops]);
});
