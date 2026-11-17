/**
 * Post heroes: a band of art that draws a post's argument from a few numbers the post states. Each motif is one idea a
 * reader should name from the art alone: a measured floor that requests fall short of, requests routed across a few
 * providers, a workspace boundary that allows or denies, a run that checks each step before the next.
 *
 * The output is deterministic SVG with concrete Brand colours and no CSS, script, text or bitmap, so the same string
 * renders inline and rasterizes to a 1200 x 630 social card. The band is drawn at 1200 x 400 and keeps its subject in
 * the central 700 x 300, so a page may crop it with `preserveAspectRatio="xMidYMid slice"` down to a 390 px phone.
 * Nothing moves, so reduced motion needs no override.
 */

import { esc } from "./text.js";

export type Hero =
  /** Bars for measured values standing on a floor at the smallest one; `below` are requests that fall short of it. */
  | { motif: "floor"; alt: string; values: number[]; below?: number[] }
  /** `inputs` request lanes routed across `outputs` providers. */
  | { motif: "lanes"; alt: string; inputs: number; outputs: number }
  /** One workspace in a grid of isolated cells; each probe crosses its boundary (`allowed`) or stops at it (`denied`). */
  | { motif: "sandbox"; alt: string; probes: ("allowed" | "denied")[] }
  /** A run trace with a check after every step; `retry` loops back once, `stop` ends the run at a failed check. */
  | { motif: "trace"; alt: string; steps: ("pass" | "retry" | "stop")[] };

export type HeroMotif = Hero["motif"];

export interface HeroOptions {
  /** Prefix for gradient and pattern ids, unique on the page. */
  id: string;
  /** `band` (1200 x 400) sits under a post title; `og` (1200 x 630) is the social card. */
  frame?: "band" | "og";
  /** Trusted SVG markup (the Brand knot) placed in the social card's lower left. */
  mark?: string;
}

/**
 * The knot's two gradient stops, the site's dark root, a light ink, and the chart status tones that read on the dark
 * field: green for a check that passed or a request allowed, red for one stopped, amber for a retry.
 */
export const HERO_COLORS = {
  field: "#0C0B1D",
  violet: "#8E59FF",
  blue: "#6888F9",
  ink: "#EDEBFF",
  pass: "#1BAF7A",
  stop: "#E05252",
  retry: "#EDA100",
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
  return value.map(item);
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

/** Rounded columns on a shared baseline: the knot's loops stood upright. */
function column(x: number, base: number, w: number, h: number, attrs: string): string {
  const rad = Math.min(w / 2, h);
  return `<path d="M${r(x)} ${r(base)}V${r(base - h + rad)}a${r(rad)} ${r(rad)} 0 0 1 ${r(w)} 0V${r(base)}Z" ${attrs}/>`;
}

function floor(hero: Extract<Hero, { motif: "floor" }>, id: string): string {
  const values = list(hero.values, "values", 1, 12, positive);
  const below = list(hero.below ?? [], "below", 0, 8, positive);
  const level = Math.min(...values);
  if (below.some((v) => v >= level)) refuse("every `below` value must sit under the floor, the smallest of `values`");
  const max = Math.max(...values, ...below);
  const base = 336, top = 76, scale = (base - top) / max;
  const gap = below.length ? 1.2 : 0;
  const slots = values.length + below.length + gap;
  const span = 640, slot = span / slots, w = Math.min(46, slot * 0.62);
  const x0 = (W - span) / 2;
  const floorY = base - level * scale;
  const at = (i: number) => x0 + slot * i + (slot - w) / 2;
  let out = `<line x1="0" y1="${base}" x2="${W}" y2="${base}" stroke="${C.ink}" stroke-opacity=".16" stroke-width="2"/>`;
  out += below.map((v, i) => {
    const x = at(i), h = v * scale;
    return column(x, base, w, h, `fill="${C.stop}" fill-opacity=".18" stroke="${C.stop}" stroke-width="2.5"`)
      + `<line x1="${r(x + w / 2)}" y1="${r(base - h - 8)}" x2="${r(x + w / 2)}" y2="${r(floorY + 8)}" stroke="${C.stop}" stroke-width="2.5" stroke-dasharray="2 7" stroke-linecap="round"/>`;
  }).join("");
  out += values.map((v, i) => column(at(below.length + gap + i), base, w, v * scale, `fill="url(#${id}-rise)"`)).join("");
  // The floor runs edge to edge: one measured line every request is held to.
  out += `<line x1="0" y1="${r(floorY)}" x2="${W}" y2="${r(floorY)}" stroke="${C.ink}" stroke-opacity=".22" stroke-width="10"/>`;
  out += `<line x1="0" y1="${r(floorY)}" x2="${W}" y2="${r(floorY)}" stroke="${C.ink}" stroke-width="3"/>`;
  return out;
}

function lanes(hero: Extract<Hero, { motif: "lanes" }>): string {
  const inputs = count(hero.inputs, "inputs", 2, 24);
  const outputs = count(hero.outputs, "outputs", 1, 6);
  if (outputs >= inputs) refuse("outputs must be fewer than inputs");
  const hue = (j: number) => (outputs === 1 ? C.violet : [C.violet, C.blue, C.ink, C.pass, C.retry, C.stop][j]);
  const iy = (i: number) => 40 + (320 * i) / (inputs - 1);
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
  const probes = list(hero.probes, "probes", 1, 6, oneOf(["allowed", "denied"] as const, "each probe"));
  const cw = 100, ch = 84, gx = 20, gy = 20, cols = 11, rows = 3;
  const gx0 = W / 2 - (cols * cw + (cols - 1) * gx) / 2, gy0 = H / 2 - (rows * ch + (rows - 1) * gy) / 2;
  let out = "";
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (row === 1 && col === 5) continue;
      out += `<rect x="${r(gx0 + col * (cw + gx))}" y="${r(gy0 + row * (ch + gy))}" width="${cw}" height="${ch}" rx="16" fill="${C.ink}" fill-opacity=".03" stroke="${C.ink}" stroke-opacity=".14" stroke-width="2"/>`;
    }
  }
  // The workspace: the centre cell, its boundary in the knot gradient, with files and a process inside.
  const bx = gx0 + 5 * (cw + gx) - 30, by = gy0 + (ch + gy) - 22, bw = cw + 60, bh = ch + 44;
  const cx = bx + bw / 2, cy = by + bh / 2;
  let inside = "";
  for (let k = 0; k < 3; k++) inside += `<rect x="${r(bx + 30)}" y="${r(by + 30 + k * 16)}" width="${54 - k * 12}" height="7" rx="3.5" fill="${C.ink}" fill-opacity=".7"/>`;
  inside += `<circle cx="${r(bx + bw - 42)}" cy="${r(by + bh - 38)}" r="10" fill="url(#${id}-rise)"/>`;
  // Probes leave the workspace toward other cells, mostly sideways. An allowed one reaches its cell; a denied one is
  // barred at the boundary and its intended cell is crossed out.
  const angles = [-20, 200, 28, 152, -58, 238];
  let rays = "";
  probes.forEach((outcome, k) => {
    const a = (angles[k] * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a);
    const t = Math.min(Math.abs(bw / 2 / (dx || 1e-9)), Math.abs(bh / 2 / (dy || 1e-9)));
    const ex = cx + dx * t, ey = cy + dy * t;
    const tx = Math.min(Math.max(ex + dx * 230, 290), 910), ty = Math.min(Math.max(ey + dy * 230, 52), 348);
    if (outcome === "allowed") {
      rays += `<line x1="${r(ex)}" y1="${r(ey)}" x2="${r(tx)}" y2="${r(ty)}" stroke="${C.pass}" stroke-width="3.5" stroke-linecap="round"/><circle cx="${r(tx)}" cy="${r(ty)}" r="10" fill="${C.pass}"/>`;
    } else {
      const px = -dy * 18, py = dx * 18;
      rays += `<line x1="${r(ex)}" y1="${r(ey)}" x2="${r(tx)}" y2="${r(ty)}" stroke="${C.stop}" stroke-opacity=".7" stroke-width="3" stroke-dasharray="3 9" stroke-linecap="round"/>`
        + `<path d="M${r(tx - 8)} ${r(ty - 8)}l16 16M${r(tx + 8)} ${r(ty - 8)}l-16 16" stroke="${C.stop}" stroke-width="3.5" stroke-linecap="round"/>`
        + `<line x1="${r(ex - px)}" y1="${r(ey - py)}" x2="${r(ex + px)}" y2="${r(ey + py)}" stroke="${C.stop}" stroke-width="6" stroke-linecap="round"/>`;
    }
  });
  out += rays;
  out += `<rect x="${r(bx)}" y="${r(by)}" width="${bw}" height="${bh}" rx="26" fill="${C.field}" fill-opacity=".72" stroke="url(#${id}-rise)" stroke-width="5"/>` + inside;
  return out;
}

function trace(hero: Extract<Hero, { motif: "trace" }>, id: string): string {
  const steps = list(hero.steps, "steps", 2, 10, oneOf(["pass", "retry", "stop"] as const, "each step"));
  if (steps.slice(0, -1).includes("stop")) refuse("only the last step may stop the run");
  const y = 214, span = 720, x0 = (W - span) / 2, pitch = span / steps.length;
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
      ? `<path d="M${r(cx - 6)} ${y - 6}l12 12M${r(cx + 6)} ${y - 6}l-12 12" stroke="${tone}" stroke-width="3.5" stroke-linecap="round"/><line x1="${r(cx + 34)}" y1="${y - 26}" x2="${r(cx + 34)}" y2="${y + 26}" stroke="${tone}" stroke-width="5" stroke-linecap="round"/>`
      : `<path d="M${r(cx - 6)} ${y + 1}l4.5 4.5l8 -9" fill="none" stroke="${tone}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  });
  return out;
}

/** The hero as one SVG string, or a thrown `hero:` error naming the field it cannot draw honestly. */
export function renderHero(hero: Hero, options: HeroOptions): string {
  const { id, frame = "band", mark } = options;
  if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(id ?? "")) refuse("a safe, unique id is required");
  if (typeof hero?.alt !== "string" || !hero.alt.trim() || hero.alt.length > 300 || /[\u0000-\u001f]/.test(hero.alt)) refuse("alt must say what the art shows, in at most 300 characters");
  const art = hero.motif === "floor" ? floor(hero, id)
    : hero.motif === "lanes" ? lanes(hero)
    : hero.motif === "sandbox" ? sandbox(hero, id)
    : hero.motif === "trace" ? trace(hero, id)
    : refuse(`unknown motif ${esc(String((hero as { motif?: unknown })?.motif))}; use floor, lanes, sandbox or trace`);
  const height = frame === "og" ? 630 : H;
  const dy = (height - H) / 2;
  const defs = `<defs><linearGradient id="${id}-rise" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${C.blue}"/><stop offset="1" stop-color="${C.violet}"/></linearGradient>`
    + `<radialGradient id="${id}-glow" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="${C.violet}" stop-opacity=".22"/><stop offset="1" stop-color="${C.violet}" stop-opacity="0"/></radialGradient>`
    + `<pattern id="${id}-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.2" fill="${C.ink}" fill-opacity=".14"/></pattern></defs>`;
  const field = `<rect width="${W}" height="${height}" fill="${C.field}"/><rect width="${W}" height="${height}" fill="url(#${id}-dots)"/><rect width="${W}" height="${height}" fill="url(#${id}-glow)"/>`;
  const card = frame === "og" && mark ? `<g transform="translate(56 ${height - 104})">${mark}</g>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" preserveAspectRatio="xMidYMid slice" role="img" aria-labelledby="${id}-alt" data-motif="${hero.motif}"><title id="${id}-alt">${esc(hero.alt.trim())}</title>${defs}${field}<g transform="translate(0 ${dy})">${art}</g>${card}</svg>`;
}
