import { esc } from "./text.js";

export interface Column {
  label: string;
  /** Numeric columns are right-aligned monospace. */
  numeric?: boolean;
}

/** A plain HTML table: the accessible form of a figure and its phone view. */
export function table(caption: string, columns: Column[], rows: string[][]): string {
  const head = columns
    .map((c) => `<th scope="col"${c.numeric ? ' class="tgc-n"' : ""}>${esc(c.label)}</th>`)
    .join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell, i) =>
            i === 0
              ? `<th scope="row">${esc(cell)}</th>`
              : `<td${columns[i]?.numeric ? ' class="tgc-n"' : ""}>${esc(cell)}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");
  return `<table class="tgc-table"><caption>${esc(caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
