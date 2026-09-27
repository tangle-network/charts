/**
 * Text: escaping, measurement and wrapping.
 *
 * Layout runs with no DOM (a Worker, a build step), so text width comes from
 * Inter's advance widths, the face tangle.tools and the reports load. Numbers
 * render in a monospace face at 0.6 em per glyph. Widths carry a 4% margin so a
 * fallback face does not collide with its neighbour.
 */

/** Every dynamic string in markup passes through here. */
export function esc(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Advance widths per 1000 units for code points 32..126 (Inter 4, regular and semibold).
const REGULAR = [
  281, 288, 466, 633, 642, 982, 644, 300, 365, 365, 501, 662, 288, 460, 288, 360, 631, 407, 610,
  618, 646, 608, 620, 566, 619, 620, 288, 302, 662, 662, 662, 511, 966, 690, 654, 730, 722, 601,
  590, 746, 743, 269, 571, 672, 565, 903, 753, 765, 639, 765, 644, 642, 646, 744, 690, 985, 682,
  679, 629, 365, 360, 365, 471, 456, 323, 562, 612, 571, 612, 583, 370, 613, 591, 242, 242, 549,
  242, 876, 591, 600, 612, 612, 376, 528, 327, 591, 562, 818, 546, 562, 552, 426, 333, 426, 662,
];
const SEMIBOLD = [
  252, 321, 523, 644, 650, 1004, 663, 326, 373, 373, 540, 673, 319, 465, 319, 379, 660, 423, 623,
  636, 666, 629, 640, 576, 640, 640, 319, 329, 673, 673, 673, 543, 999, 728, 659, 737, 722, 605,
  588, 749, 746, 277, 580, 703, 565, 922, 759, 769, 645, 773, 652, 650, 660, 736, 728, 1020, 720,
  713, 652, 373, 379, 373, 481, 469, 351, 574, 624, 583, 624, 591, 389, 625, 612, 262, 262, 569,
  262, 900, 612, 609, 624, 624, 397, 549, 353, 612, 587, 839, 569, 588, 566, 455, 359, 455, 673,
];
const EXTRA: Record<string, number> = {
  "·": 300,
  "×": 670,
  "—": 1000,
  "–": 500,
  "…": 900,
  "≥": 670,
  "≤": 670,
  "±": 670,
  "→": 954,
  "−": 662,
};
const MARGIN = 1.04;

export type Face = "sans" | "sans-semibold" | "mono";

export function textWidth(text: string, size: number, face: Face = "sans"): number {
  if (face === "mono") return text.length * 0.6 * size * MARGIN;
  const table = face === "sans-semibold" ? SEMIBOLD : REGULAR;
  let units = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    units += code >= 32 && code <= 126 ? table[code - 32]! : (EXTRA[ch] ?? 620);
  }
  return (units / 1000) * size * MARGIN;
}

/**
 * Breaks `text` into at most `maxLines` lines no wider than `width`. Breaks at
 * spaces, and after `-`, `/`, `_` or `·` when a word alone is too wide. A line
 * that still overflows the last allowed line ends with an ellipsis; callers put
 * the full text in a `<title>` and in the table.
 */
export function wrap(
  text: string,
  width: number,
  size: number,
  face: Face = "sans",
  maxLines = 2,
): { lines: string[]; truncated: boolean } {
  const tokens = text.match(/[^\s\-/_·]+[\-/_·]?|\s+|[\-/_·]/g) ?? [text];
  const lines: string[] = [];
  let line = "";
  for (const token of tokens) {
    if (/^\s+$/.test(token)) {
      if (line) line += " ";
      continue;
    }
    const candidate = line + token;
    if (textWidth(candidate.trimEnd(), size, face) <= width || !line.trim()) {
      line = candidate;
    } else {
      lines.push(line.trimEnd());
      line = token;
    }
  }
  if (line.trim()) lines.push(line.trimEnd());
  if (lines.length <= maxLines && lines.every((l) => textWidth(l, size, face) <= width)) {
    return { lines, truncated: false };
  }
  const kept = lines.slice(0, maxLines);
  let last = lines.slice(maxLines - 1).join(" ");
  while (last.length > 1 && textWidth(`${last}…`, size, face) > width) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last.trimEnd()}…`;
  return { lines: kept, truncated: true };
}

/** One `<text>` element with a line per `<tspan>`. */
export function textBlock(
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
  attrs: string,
): string {
  if (lines.length === 1) return `<text x="${x}" y="${y}" ${attrs}>${esc(lines[0]!)}</text>`;
  const spans = lines
    .map((line, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : lineHeight}">${esc(line)}</tspan>`)
    .join("");
  return `<text x="${x}" y="${y}" ${attrs}>${spans}</text>`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return count === 1 ? one : many;
}

/** "a, b and c" */
export function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
