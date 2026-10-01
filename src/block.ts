/**
 * The figure block: one markup for every figure on every surface.
 *
 * In order: the finding as a heading with a note reference, a one-sentence
 * lede, the plot (both widths, swapped by `figure.css` on the figure's own
 * width), a reading line, and the data table in a disclosure. Notes render
 * once per page, numbered, each with a way back to its figure.
 */

import { esc } from "./text.js";
import { WIDE } from "./svg.js";
import type { Figure, Refusal } from "./types.js";

const slug = (id: string) => id.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();

export interface RenderFigureOptions {
  /** Chart uses a closed data disclosure; plot keeps only the SVG and accessible data. */
  presentation?: "chart" | "plot";
}

export function renderFigure(f: Figure, noteNumber: number, options: RenderFigureOptions = {}): string {
  if (options.presentation !== undefined && options.presentation !== "chart" && options.presentation !== "plot") throw new Error("renderFigure: unknown presentation.");
  const id = slug(f.id);
  const plotLabel = `${f.finding} ${f.lede}`;
  const narrow = f.svg.narrow
    ? `<div class="tgc-narrow">${f.svg.narrow}</div>`
    : `<div class="tgc-narrow tgc-narrow-table">${f.table}</div>`;
  if (options.presentation === "plot") {
    const phonePlot = f.svg.narrow
      ? `<div class="tgc-narrow">${f.svg.narrow}</div>`
      : `<div class="tgc-narrow tgc-wide-fallback" role="region" aria-label="${esc(f.finding)} chart" tabindex="0" style="--tgc-fallback-width:${WIDE}px">${f.svg.wide}</div>`;
    return [
      `<figure class="tgc-figure tgc-figure-chart tgc-figure-plot" id="fig-${id}" aria-label="${esc(f.finding)}">`,
      `<div class="tgc-plot" role="${f.svg.interactive ? "group" : "img"}" aria-label="${esc(plotLabel)}"><div class="tgc-wide">${f.svg.wide}</div>${phonePlot}</div>`,
      `<div class="tgc-accessible-data">${f.table}</div></figure>`,
    ].join("");
  }
  if (options.presentation === "chart") {
    return [
      `<figure class="tgc-figure tgc-figure-chart" id="fig-${id}" aria-label="${esc(f.finding)}">`,
      `<div class="tgc-plot" id="ref-${noteNumber}" role="group" aria-label="${esc(plotLabel)}"><div class="tgc-wide">${f.svg.wide}</div>${narrow}</div>`,
      `<details class="tgc-data"><summary>Data and method</summary>`,
      `<p class="tgc-lede">${esc(f.lede)}</p><p class="tgc-read">${esc(f.read)}</p>`,
      `<p class="tgc-read">${esc([f.note.method, f.note.n, ...f.note.exclusions].join(" "))}</p>`,
      `<div class="tgc-scroll" role="region" aria-label="${esc(f.finding)} data" tabindex="0">${f.table}</div></details></figure>`,
    ].join("");
  }
  return [
    `<figure class="tgc-figure" id="fig-${id}" aria-labelledby="fig-${id}-finding">`,
    `<h3 class="tgc-finding" id="fig-${id}-finding">${esc(f.finding)}<sup><a class="tgc-noteref" href="#note-${noteNumber}" id="ref-${noteNumber}" role="doc-noteref" aria-label="Note ${noteNumber}">${noteNumber}</a></sup></h3>`,
    `<p class="tgc-lede">${esc(f.lede)}</p>`,
    `<div class="tgc-plot" role="${f.svg.interactive ? "group" : "img"}" aria-label="${esc(plotLabel)}">`,
    `<div class="tgc-wide">${f.svg.wide}</div>`,
    narrow,
    `</div>`,
    `<p class="tgc-read">${esc(f.read)}</p>`,
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
