/**
 * SVG marks. Every mark carries a class and `figure.css` maps classes to the
 * `--chart-*` tokens, so a render holds no colour and follows the page theme.
 * Geometry stays in attributes, so an SVG shown without the stylesheet keeps
 * its layout.
 */

import { esc } from "./text.js";

export const WIDE = 720;
export const NARROW = 358;

const r2 = (n: number) => Math.round(n * 100) / 100;

export function svgRoot(width: number, height: number, inner: string): string {
  const h = Math.ceil(height);
  return `<svg class="tgc-svg" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" aria-hidden="true" focusable="false">${inner}</svg>`;
}

/** A horizontal bar anchored at `x`, square at the baseline, 4 px round at the data end. */
export function hbar(x: number, y: number, w: number, h: number, cls: string): string {
  if (w <= 0) return "";
  const r = Math.min(4, h / 2, w);
  return `<path class="${cls}" d="M${r2(x)} ${r2(y)}h${r2(w - r)}a${r} ${r} 0 0 1 ${r} ${r}v${r2(h - 2 * r)}a${r} ${r} 0 0 1 -${r} ${r}h-${r2(w - r)}z"/>`;
}

export function rect(x: number, y: number, w: number, h: number, cls: string, extra = ""): string {
  if (w <= 0 || h <= 0) return "";
  return `<rect class="${cls}" x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}"${extra ? ` ${extra}` : ""}/>`;
}

export function line(x1: number, y1: number, x2: number, y2: number, cls: string): string {
  return `<line class="${cls}" x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}"/>`;
}

export function circle(cx: number, cy: number, r: number, cls: string): string {
  return `<circle class="${cls}" cx="${r2(cx)}" cy="${r2(cy)}" r="${r}"/>`;
}

export function polyline(points: Array<[number, number]>, cls: string): string {
  return `<polyline class="${cls}" points="${points.map(([x, y]) => `${r2(x)},${r2(y)}`).join(" ")}"/>`;
}

export interface TextOptions {
  size?: number;
  cls?: string;
  anchor?: "start" | "middle" | "end";
  weight?: 400 | 600;
}

export function text(x: number, y: number, value: string, o: TextOptions = {}): string {
  const anchor = o.anchor && o.anchor !== "start" ? ` text-anchor="${o.anchor}"` : "";
  const weight = o.weight === 600 ? ` font-weight="600"` : "";
  return `<text class="${o.cls ?? "tgc-ink"}" x="${r2(x)}" y="${r2(y)}" font-size="${o.size ?? 12}"${anchor}${weight}>${esc(value)}</text>`;
}

/** A group whose `<title>` is the hover text for everything inside it. */
export function titled(title: string, inner: string): string {
  return `<g><title>${esc(title)}</title>${inner}</g>`;
}
