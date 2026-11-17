/**
 * Post heroes: a band of art that draws a post's argument from a few numbers the post states. Each motif is one idea a
 * reader should name from the art alone: a measured floor that requests fall short of, requests routed across a few
 * providers, a workspace boundary that allows or denies, a run that checks each step before the next.
 *
 * The output is deterministic SVG with concrete Brand colours and no CSS, script, text or bitmap, so the same string
 * renders inline and rasterizes to a 1200 x 630 social card. The band is drawn at 1200 x 400 and keeps its subject in
 * the central 700 x 300, so with `preserveAspectRatio="xMidYMid slice"` any box from 7:4 to 4:1 (width to height) shows
 * all of it: 390 x 220 on a phone, up to 1600 x 400 on a desktop. Nothing moves, so reduced motion needs no override.
 */

import { esc } from "./text.js";

export type Hero =
  /** Bars for measured values standing on a floor at the smallest one; `below` are requests that fall short of it. */
  | { motif: "floor"; alt: string; values: number[]; below?: number[] }
  /** `inputs` request lanes routed across `outputs` providers. */
  | { motif: "lanes"; alt: string; inputs: number; outputs: number }
  /** One workspace in a grid of isolated cells; up to four probes reach a neighbouring cell (`allowed`) or stop at its boundary (`denied`). */
  | { motif: "sandbox"; alt: string; probes: ("allowed" | "denied")[] }
  /** A run trace with a check after every step; `retry` loops back once, `stop` ends the run at a failed check. */
  | { motif: "trace"; alt: string; steps: ("pass" | "retry" | "stop")[] };

export type HeroMotif = Hero["motif"];

export interface HeroOptions {
  /** Prefix for gradient, pattern and title ids. Unique on the page: a second hero with the same id draws the same, but its
   * `aria-labelledby` resolves to the first hero's title. */
  id: string;
  /** `band` (1200 x 400) sits under a post title; `og` (1200 x 630) is the social card. */
  frame?: "band" | "og";
  /** Trusted SVG markup (the Brand knot) for the social card, drawn at (56, 526) in a box about 56 px tall. It is inserted as
   * is, not sanitized: pass only markup you wrote. */
  mark?: string;
}

/**
 * Each colour has an owner, pinned by a test: the knot's two gradient stops and the website's dark canvas and ink (Brand),
 * and the status tones of `figure.css` that read on that canvas: green for a check passed or a probe allowed, red for one
 * stopped, amber for a retry.
 */
export const HERO_COLORS = {
  field: "#0c0b1d",
  violet: "#8E59FF",
  blue: "#6888F9",
  ink: "#e4e4e4",
  pass: "#1baf7a",
  stop: "#e05252",
  retry: "#eda100",
} as const;

const W = 1200;
const H = 400;
const C = HERO_COLORS;
const r = (n: number) => Math.round(n * 10) / 10;

function refuse(message: string): never {
  throw new Error(`hero: ${message}`);
}

function count(value: unknown, name: string, min: number, max: number): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) refuse(`${name} must be a whole number from ${min} to ${max}`);
  return value as number;
}

function list<T>(value: unknown, name: string, min: number, max: number, item: (v: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) refuse(`${name} must list ${min} to ${max} items`);
  return Array.from(value, item);
}

function positive(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) refuse("values must be positive finite numbers");
  return value;
}

function oneOf<T extends string>(options: readonly T[], name: string) {
  return (value: unknown): T => {
    if (!options.includes(value as T)) refuse(`${name} must be one of ${options.join(", ")}`);
    return value as T;
  };
}

/** A share of the way from one hex colour to another, for shades of the knot. */
function mix(a: string, b: string, t: number): string {
  const ch = (hex: string, k: number) => parseInt(hex.slice(1 + 2 * k, 3 + 2 * k), 16);
  return `#${[0, 1, 2].map((k) => Math.round(ch(a, k) + (ch(b, k) - ch(a, k)) * t).toString(16).padStart(2, "0")).join("")}`;
}

/** Rounded columns on a shared baseline: the knot's loops stood upright. The cap is elliptical, so a column shorter than
 * half its width still tops out at exactly its value. */
function column(x: number, base: number, w: number, h: number, attrs: string): string {
  const ry = Math.min(w / 2, h);
  return `<path d="M${r(x)} ${r(base)}V${r(base - h + ry)}a${r(w / 2)} ${r(ry)} 0 0 1 ${r(w)} 0V${r(base)}Z" ${attrs}/>`;
}

function floor(hero: Extract<Hero, { motif: "floor" }>, id: string): string {
  const values = list(hero.values, "values", 1, 12, positive);
  const below = list(hero.below ?? [], "below", 0, 8, positive);
  const level = Math.min(...values);
  if (below.some((v) => v >= level)) refuse("every `below` value must sit under the floor, the smallest of `values`");
  const max = Math.max(...values, ...below);
  if (level < max / 10) refuse("the floor must be at least a tenth of the largest value, or it cannot be seen");
  const base = 336, height = (v: number) => (v / max) * 260;
  const gap = below.length ? 1.2 : 0;
  const slots = values.length + below.length + gap;
  const span = 640, slot = span / slots, w = Math.min(46, slot * 0.62);
  const x0 = (W - span) / 2;
  const floorY = base - height(level);
  const at = (i: number) => x0 + slot * i + (slot - w) / 2;
  let out = `<line x1="0" y1="${base}" x2="${W}" y2="${base}" stroke="${C.ink}" stroke-opacity=".16" stroke-width="2"/>`;
  out += below.map((v, i) => {
    const x = at(i), h = height(v), gap = base - h - floorY;
    // The shortfall, dashed from the request's top up to the floor, where there is room to draw it.
    return column(x, base, w, h, `fill="${C.stop}" fill-opacity=".18" stroke="${C.stop}" stroke-width="2.5"`)
      + (gap > 34 ? `<line x1="${r(x + w / 2)}" y1="${r(base - h - 8)}" x2="${r(x + w / 2)}" y2="${r(floorY + 8)}" stroke="${C.stop}" stroke-width="2.5" stroke-dasharray="2 7" stroke-linecap="round"/>` : "");
  }).join("");
  out += values.map((v, i) => column(at(below.length + gap + i), base, w, height(v), `fill="url(#${id}-rise)"`)).join("");
  // The floor runs edge to edge: one measured line every request is held to.
  out += `<line x1="0" y1="${r(floorY)}" x2="${W}" y2="${r(floorY)}" stroke="${C.ink}" stroke-opacity=".22" stroke-width="10"/>`;
  out += `<line x1="0" y1="${r(floorY)}" x2="${W}" y2="${r(floorY)}" stroke="${C.ink}" stroke-width="3"/>`;
  return out;
}

function lanes(hero: Extract<Hero, { motif: "lanes" }>): string {
  const inputs = count(hero.inputs, "inputs", 2, 24);
  const outputs = count(hero.outputs, "outputs", 1, 6);
  if (outputs >= inputs) refuse("outputs must be fewer than inputs");
  // Providers are shades of the knot, never the status tones: no provider reads as a failure.
  const shades = [C.violet, C.blue, mix(C.violet, C.ink, 0.5), mix(C.blue, C.ink, 0.5), mix(C.violet, C.field, 0.35), mix(C.blue, C.field, 0.35)];
  const hue = (j: number) => shades[j];
  const iy = (i: number) => 60 + (280 * i) / (inputs - 1);
  const oy = (j: number) => (outputs === 1 ? 200 : 120 + (160 * j) / (outputs - 1));
  const mx = 660;
  let out = "";
  // Each lane is drawn over a field-coloured underlay, so later lanes cut gaps through earlier ones: the knot's over-under.
  for (let i = 0; i < inputs; i++) {
    const j = i % outputs, y0 = iy(i), y1 = oy(j);
    const d = `M-10 ${r(y0)}H250C${r(470)} ${r(y0)} ${r(450)} ${r(y1)} ${mx} ${r(y1)}`;
    out += `<path d="${d}" fill="none" stroke="${C.field}" stroke-width="11"/><path d="${d}" fill="none" stroke="${hue(j)}" stroke-width="3.5" stroke-linecap="round" stroke-opacity=".85"/>`;
  }
  for (let j = 0; j < outputs; j++) {
    const y = r(oy(j));
    out += `<path d="M${mx} ${y}H${W + 10}" stroke="${hue(j)}" stroke-width="9" stroke-linecap="round"/>`;
    out += `<circle cx="${mx}" cy="${y}" r="11" fill="${C.field}" stroke="${C.ink}" stroke-width="3"/>`;
  }
  return out;
}

function sandbox(hero: Extract<Hero, { motif: "sandbox" }>, id: string): string {
  const probes = list(hero.probes, "probes", 1, 4, oneOf(["allowed", "denied"] as const, "each probe"));
  const cw = 100, ch = 84, gap = 20, cols = 11, rows = 3;
  const gx0 = W / 2 - (cols * cw + (cols - 1) * gap) / 2, gy0 = H / 2 - (rows * ch + (rows - 1) * gap) / 2;
  const cell = (col: number, row: number) => ({ x: gx0 + col * (cw + gap), y: gy0 + row * (ch + gap) });
  const cellRect = (col: number, row: number, attrs: string) => `<rect x="${r(cell(col, row).x)}" y="${r(cell(col, row).y)}" width="${cw}" height="${ch}" rx="16" ${attrs}/>`;
  let out = "";
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (row !== 1 || col !== 5) out += cellRect(col, row, `fill="${C.ink}" fill-opacity=".03" stroke="${C.ink}" stroke-opacity=".14" stroke-width="2"`);
    }
  }
  // The workspace: the centre cell, its boundary in the knot gradient, with files and a process inside.
  const bx = cell(5, 1).x - 30, by = cell(5, 1).y - 22, bw = cw + 60, bh = ch + 44;
  const cx = bx + bw / 2, cy = by + bh / 2;
  let inside = "";
  for (let k = 0; k < 3; k++) inside += `<rect x="${r(bx + 30)}" y="${r(by + 24 + k * 14)}" width="${54 - k * 12}" height="7" rx="3.5" fill="${C.ink}" fill-opacity=".7"/>`;
  inside += `<circle cx="${r(bx + bw - 42)}" cy="${r(by + bh - 38)}" r="10" fill="url(#${id}-rise)"/>`;
  // Each probe leaves through the middle of one side toward the neighbouring cell: right, left, up, down. An allowed probe
  // reaches that cell, which lights up; a denied one ends at a bar laid along the boundary.
  const ports = [
    { x: bx + bw, y: cy, nx: 1, ny: 0, col: 6, row: 1 },
    { x: bx, y: cy, nx: -1, ny: 0, col: 4, row: 1 },
    { x: cx, y: by, nx: 0, ny: -1, col: 5, row: 0 },
    { x: cx, y: by + bh, nx: 0, ny: 1, col: 5, row: 2 },
  ];
  let lit = "", rays = "";
  probes.forEach((outcome, k) => {
    const p = ports[k], tone = outcome === "allowed" ? C.pass : C.stop;
    const stub = `<line x1="${r(p.x - p.nx * 26)}" y1="${r(p.y - p.ny * 26)}" x2="${r(p.x)}" y2="${r(p.y)}" stroke="${tone}" stroke-width="3.5" stroke-linecap="round"/>`;
    if (outcome === "allowed") {
      const tx = cell(p.col, p.row).x + cw / 2, ty = cell(p.col, p.row).y + ch / 2;
      lit += cellRect(p.col, p.row, `fill="${C.pass}" fill-opacity=".16" stroke="${C.pass}" stroke-width="2.5"`);
      rays += stub + `<line x1="${r(p.x)}" y1="${r(p.y)}" x2="${r(tx)}" y2="${r(ty)}" stroke="${tone}" stroke-width="3.5" stroke-linecap="round"/><circle cx="${r(tx)}" cy="${r(ty)}" r="9" fill="${tone}"/>`;
    } else {
      rays += stub + `<line x1="${r(p.x - p.ny * 18)}" y1="${r(p.y - p.nx * 18)}" x2="${r(p.x + p.ny * 18)}" y2="${r(p.y + p.nx * 18)}" stroke="${tone}" stroke-width="6" stroke-linecap="round"/>`;
    }
  });
  // Lit cells under the boundary, then the probes over it, so a stop bar reads along the edge it holds.
  out += lit + `<rect x="${r(bx)}" y="${r(by)}" width="${bw}" height="${bh}" rx="26" fill="${C.field}" fill-opacity=".72" stroke="url(#${id}-rise)" stroke-width="5"/>` + inside;
  return out + rays;
}

function trace(hero: Extract<Hero, { motif: "trace" }>, id: string): string {
  const steps = list(hero.steps, "steps", 2, 10, oneOf(["pass", "retry", "stop"] as const, "each step"));
  if (steps.slice(0, -1).includes("stop")) refuse("only the last step may stop the run");
  // Every mark sits in the central 250 to 950, the part a phone keeps.
  const y = 214, span = 640, x0 = (W - span) / 2, pitch = span / steps.length;
  // A faint time axis and the untaken track give the run its length.
  let out = "";
  for (let x = 20; x < W; x += 40) out += `<line x1="${x}" y1="70" x2="${x}" y2="${x % 200 === 20 ? 86 : 78}" stroke="${C.ink}" stroke-opacity=".18" stroke-width="2"/>`;
  out += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${C.ink}" stroke-opacity=".12" stroke-width="3" stroke-dasharray="2 10" stroke-linecap="round"/>`;
  const stopAt = steps.indexOf("stop");
  const end = stopAt >= 0 ? x0 + pitch * stopAt + pitch * 0.62 : W;
  out += `<line x1="0" y1="${y}" x2="${r(end)}" y2="${y}" stroke="${C.ink}" stroke-opacity=".55" stroke-width="3"/>`;
  steps.forEach((step, i) => {
    const sx = x0 + pitch * i + 6, cx = sx + pitch * 0.62;
    if (step === "retry") {
      // One loop back over the step, in the knot's rounded hand.
      out += `<path d="M${r(cx)} ${y - 14}C${r(cx)} ${y - 92} ${r(sx - 6)} ${y - 92} ${r(sx + 4)} ${y - 18}" fill="none" stroke="${C.retry}" stroke-width="3.5" stroke-linecap="round"/>`;
      out += `<path d="M${r(sx - 6)} ${y - 30}l${r(10)} ${12}l${r(9)} ${-11}" fill="none" stroke="${C.retry}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    out += `<rect x="${r(sx)}" y="${y - 16}" width="${r(pitch * 0.4)}" height="32" rx="16" fill="url(#${id}-rise)"/>`;
    const tone = step === "stop" ? C.stop : C.pass;
    out += `<circle cx="${r(cx)}" cy="${y}" r="14" fill="${C.field}" stroke="${tone}" stroke-width="3.5"/>`;
    out += step === "stop"
      ? `<path d="M${r(cx - 6)} ${y - 6}l12 12M${r(cx + 6)} ${y - 6}l-12 12" stroke="${tone}" stroke-width="3.5" stroke-linecap="round"/><line x1="${r(cx + 24)}" y1="${y - 26}" x2="${r(cx + 24)}" y2="${y + 26}" stroke="${tone}" stroke-width="5" stroke-linecap="round"/>`
      : `<path d="M${r(cx - 6)} ${y + 1}l4.5 4.5l8 -9" fill="none" stroke="${tone}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  });
  return out;
}

/** The hero as one SVG string, or a thrown `hero:` error naming the field it cannot draw honestly. */
export function renderHero(hero: Hero, options: HeroOptions): string {
  const { id, frame = "band", mark } = options ?? ({} as HeroOptions);
  if (typeof id !== "string" || !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(id)) refuse("a safe, unique id is required");
  if (frame !== "band" && frame !== "og") refuse("frame must be band or og");
  const alt = typeof hero?.alt === "string" ? hero.alt.trim() : "";
  // Control characters, U+FFFE/U+FFFF and lone surrogates are not XML: a rasterizer would refuse the whole card.
  if (!alt || alt.length > 300 || /[\u0000-\u001f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(alt)) refuse("alt must say what the art shows, in at most 300 characters of text");
  const art = hero.motif === "floor" ? floor(hero, id)
    : hero.motif === "lanes" ? lanes(hero)
    : hero.motif === "sandbox" ? sandbox(hero, id)
    : hero.motif === "trace" ? trace(hero, id)
    : refuse(`unknown motif ${String((hero as { motif?: unknown })?.motif)}; use floor, lanes, sandbox or trace`);
  const height = frame === "og" ? 630 : H;
  const dy = (height - H) / 2;
  const defs = `<defs><linearGradient id="${id}-rise" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${C.blue}"/><stop offset="1" stop-color="${C.violet}"/></linearGradient>`
    + `<radialGradient id="${id}-glow" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="${C.violet}" stop-opacity=".22"/><stop offset="1" stop-color="${C.violet}" stop-opacity="0"/></radialGradient>`
    + `<pattern id="${id}-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.2" fill="${C.ink}" fill-opacity=".14"/></pattern></defs>`;
  const field = `<rect width="${W}" height="${height}" fill="${C.field}"/><rect width="${W}" height="${height}" fill="url(#${id}-dots)"/><rect width="${W}" height="${height}" fill="url(#${id}-glow)"/>`;
  const card = frame === "og" && mark ? `<g transform="translate(56 ${height - 104})">${mark}</g>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" preserveAspectRatio="xMidYMid slice" role="img" aria-labelledby="${id}-alt" data-motif="${hero.motif}"><title id="${id}-alt">${esc(alt)}</title>${defs}${field}<g transform="translate(0 ${dy})">${art}</g>${card}</svg>`;
}
