/**
 * The figure block: one markup for every figure on every surface.
 *
 * In order: the finding as a heading with a note reference, a one-sentence
 * lede, the plot (both widths, swapped by `figure.css` on the figure's own
 * width), a reading line, and the data table in a disclosure. Notes render
 * once per page, numbered, each with a way back to its figure.
 */

import { esc } from "./text.js";
import type { Figure, Refusal } from "./types.js";

const slug = (id: string) => id.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();

export function renderFigure(f: Figure, noteNumber: number): string {
  const id = slug(f.id);
  const plotLabel = `${f.finding} ${f.lede}`;
  const narrow = f.svg.narrow
    ? `<div class="tgc-narrow">${f.svg.narrow}</div>`
    : `<div class="tgc-narrow tgc-narrow-table">${f.table}</div>`;
  return [
    `<figure class="tgc-figure" id="fig-${id}" aria-labelledby="fig-${id}-finding">`,
    `<h3 class="tgc-finding" id="fig-${id}-finding">${esc(f.finding)}<sup><a class="tgc-noteref" href="#note-${noteNumber}" id="ref-${noteNumber}" role="doc-noteref" aria-label="Note ${noteNumber}">${noteNumber}</a></sup></h3>`,
    `<p class="tgc-lede">${esc(f.lede)}</p>`,
    `<div class="tgc-plot" role="img" aria-label="${esc(plotLabel)}">`,
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
