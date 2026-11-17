/**
 * The figure block: one markup for every figure on every surface.
 *
 * In order: the finding as a heading with a note reference, the scope line
 * (status, period, unit) when the producer recorded one, a one-sentence lede,
 * the plot (both widths, swapped by `figure.css` on the figure's own width), a
 * reading line, the source links, and the data table in a disclosure. Every
 * presentation prints the scope line and source links when present. Notes
 * render once per page, numbered, each with a way back to its figure.
 */

import { esc } from "./text.js";
import { NARROW, WIDE } from "./svg.js";
import type { Figure, FigureStatus, Refusal } from "./types.js";

const slug = (id: string) => id.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();

const STATUS: Record<FigureStatus, string> = { measured: "Measured", captured: "Captured", illustrative: "Illustrative" };

const text = (f: Figure, field: string, value: unknown): string => {
  if (value == null) return "";
  if (typeof value !== "string") throw new Error(`renderFigure: figure ${f.id} ${field} must be a string.`);
  return value.trim();
};

/** The scope line's items (status, period, unit), space-separated, or "" when the producer recorded none. */
export function contextItems(f: Figure): string {
  if (f.status != null && (typeof f.status !== "string" || !Object.hasOwn(STATUS, f.status))) throw new Error(`renderFigure: figure ${f.id} has unknown status ${String(f.status)}.`);
  const period = text(f, "period", f.period);
  const unit = text(f, "unit", f.unit);
  return [
    f.status ? `<span class="tgc-status" data-status="${f.status}">${STATUS[f.status]}</span>` : "",
    period ? `<span class="tgc-period">${esc(period)}</span>` : "",
    unit ? `<span class="tgc-unit">${esc(unit)}</span>` : "",
  ].filter(Boolean).join(" ");
}

/** The source links that end the caption, or "" when the producer recorded none. */
export function sourceItems(f: Figure): string {
  if (f.sources == null || (Array.isArray(f.sources) && f.sources.length === 0)) return "";
  if (!Array.isArray(f.sources)) throw new Error(`renderFigure: figure ${f.id} sources must be an array.`);
  const links = f.sources.map((source) => {
    const label = text(f, "source label", source?.label);
    const href = text(f, "source href", source?.href);
    if (!label) throw new Error(`renderFigure: figure ${f.id} has a source without a label.`);
    // Browsers drop tabs and newlines and read "\" as "/" in a URL, so "/\\host" would leave the page: refuse them.
    if (href !== source.href || /[\u0000-\u0020\u007f\\]/.test(href) || !/^(https?:\/\/|\/(?!\/)|#)/.test(href)) {
      throw new Error(`renderFigure: figure ${f.id} source "${label}" needs an http(s), root-relative or fragment link.`);
    }
    return `<a href="${esc(href)}">${esc(label)}</a>`;
  });
  return `${links.length === 1 ? "Source" : "Sources"}: ${links.join(" · ")}`;
}

const context = (f: Figure) => {
  const items = contextItems(f);
  return items ? `<p class="tgc-context">${items}</p>` : "";
};
const sources = (f: Figure) => {
  const items = sourceItems(f);
  return items ? `<p class="tgc-sources">${items}</p>` : "";
};

export interface RenderFigureOptions {
  /** Chart uses a closed data disclosure; plot keeps only the SVG and accessible data; panel is a plot for a dashboard cell, its render swapped by the viewport. */
  presentation?: "chart" | "plot" | "panel";
}

export function renderFigure(f: Figure, noteNumber: number, options: RenderFigureOptions = {}): string {
  if (options.presentation !== undefined && !["chart", "plot", "panel"].includes(options.presentation)) throw new Error("renderFigure: unknown presentation.");
  const id = slug(f.id);
  const plotLabel = `${f.finding} ${f.lede}`;
  const narrow = f.svg.narrow
    ? `<div class="tgc-narrow">${f.svg.narrow}</div>`
    : `<div class="tgc-narrow tgc-narrow-table">${f.table}</div>`;
  if (options.presentation === "plot" || options.presentation === "panel") {
    const phonePlot = f.svg.narrow
      ? `<div class="tgc-narrow tgc-phone-plot" role="region" aria-label="${esc(f.finding)} chart" tabindex="0" style="--tgc-phone-width:${NARROW}px">${f.svg.narrow}</div>`
      : `<div class="tgc-narrow tgc-wide-fallback" role="region" aria-label="${esc(f.finding)} chart" tabindex="0" style="--tgc-fallback-width:${WIDE}px">${f.svg.wide}</div>`;
    return [
      `<figure class="tgc-figure tgc-figure-chart tgc-figure-plot${options.presentation === "panel" ? " tgc-figure-panel" : ""}" id="fig-${id}" aria-label="${esc(f.finding)}">`,
      context(f),
      `<div class="tgc-plot" role="${f.svg.interactive ? "group" : "img"}" aria-label="${esc(plotLabel)}"><div class="tgc-wide">${f.svg.wide}</div>${phonePlot}</div>`,
      sources(f),
      `<div class="tgc-accessible-data">${f.table}</div></figure>`,
    ].join("");
  }
  if (options.presentation === "chart") {
    return [
      `<figure class="tgc-figure tgc-figure-chart" id="fig-${id}" aria-label="${esc(f.finding)}">`,
      context(f),
      `<div class="tgc-plot" id="ref-${noteNumber}" role="group" aria-label="${esc(plotLabel)}"><div class="tgc-wide">${f.svg.wide}</div>${narrow}</div>`,
      sources(f),
      `<details class="tgc-data"><summary>Data and method</summary>`,
      `<p class="tgc-lede">${esc(f.lede)}</p><p class="tgc-read">${esc(f.read)}</p>`,
      `<p class="tgc-read">${esc([f.note.method, f.note.n, ...f.note.exclusions].join(" "))}</p>`,
      `<div class="tgc-scroll" role="region" aria-label="${esc(f.finding)} data" tabindex="0">${f.table}</div></details></figure>`,
    ].join("");
  }
  return [
    `<figure class="tgc-figure" id="fig-${id}" aria-labelledby="fig-${id}-finding">`,
    `<h3 class="tgc-finding" id="fig-${id}-finding">${esc(f.finding)}<sup><a class="tgc-noteref" href="#note-${noteNumber}" id="ref-${noteNumber}" role="doc-noteref" aria-label="Note ${noteNumber}">${noteNumber}</a></sup></h3>`,
    context(f),
    `<p class="tgc-lede">${esc(f.lede)}</p>`,
    `<div class="tgc-plot" role="${f.svg.interactive ? "group" : "img"}" aria-label="${esc(plotLabel)}">`,
    `<div class="tgc-wide">${f.svg.wide}</div>`,
    narrow,
    `</div>`,
    `<p class="tgc-read">${esc(f.read)}</p>`,
    sources(f),
    `<details class="tgc-data"><summary>Data</summary><div class="tgc-scroll" role="region" aria-label="${esc(f.finding)} data" tabindex="0">${f.table}</div></details>`,
    `</figure>`,
  ].join("");
}

/** Numbered notes for `figures`, in the order their blocks were numbered (1-based). */
export function renderNotes(figures: Figure[]): string {
  const items = figures.map((f, i) => {
    const n = i + 1;
    if (!f.note.method.trim() || !f.note.n.trim()) {
      throw new Error(`renderNotes: figure ${f.id} has no method or no n; a note needs both.`);
    }
    const text = [f.note.method, f.note.n, ...f.note.exclusions].map(esc).join(" ");
    return `<li id="note-${n}">${text} <a class="tgc-backlink" href="#ref-${n}" role="doc-backlink" aria-label="Back to figure ${n}">↩</a></li>`;
  });
  return `<ol class="tgc-notes">${items.join("")}</ol>`;
}

/** What a page leaves out, and why. */
export function renderRefusals(refusals: Refusal[]): string {
  if (refusals.length === 0) return "";
  return `<ul class="tgc-refusals">${refusals.map((r) => `<li>${esc(r.refused)}</li>`).join("")}</ul>`;
}
