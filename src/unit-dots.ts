/**
 * Unit dots: one dot per item, packed in a rectangle per group, the rectangles laid out as a squarified treemap sized
 * by count. A fleet of 6,000 runs reads as its groups first and its items second, with no item hidden in an
 * aggregate. Positions are in layout units (the `width` and `height` given); a canvas scales them to its pixels.
 */

export interface DotGroup {
  id: string;
  label: string;
  /** Items in this group; their positions come out in group order, then item order within the group. */
  count: number;
}

export interface DotGroupRect {
  id: string;
  label: string;
  count: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface UnitDotLayout {
  rects: DotGroupRect[];
  /** x, y of every item, interleaved, groups in input order. */
  positions: Float32Array;
  /** Each item's dot radius in layout units: one size per group, from its cell. */
  radii: Float32Array;
}

export interface UnitDotOptions {
  /** Space between rectangles. Default 6. */
  gap?: number;
  /** Space above each rectangle's dots for its label. Default 16. */
  header?: number;
  /** The largest dot radius, so a group of three is not three giant discs. Default 6. */
  maxRadius?: number;
}

/** Squarified treemap (Bruls, Huizing and van Wijk) of positive values, largest first, into the rectangle. */
function squarify(values: number[], x: number, y: number, w: number, h: number): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = new Array(values.length);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) return values.map(() => [x, y, 0, 0]);
  const scale = (w * h) / total;
  let i = 0;
  while (i < values.length) {
    const side = Math.min(w, h);
    let row = [i];
    let rowSum = values[i]! * scale;
    const worst = (sum: number, items: number[]) => {
      const areas = items.map((k) => values[k]! * scale);
      const max = Math.max(...areas), min = Math.min(...areas);
      return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
    };
    let j = i + 1;
    while (j < values.length) {
      const next = rowSum + values[j]! * scale;
      if (worst(next, [...row, j]) > worst(rowSum, row)) break;
      row = [...row, j];
      rowSum = next;
      j++;
    }
    const thickness = rowSum / side;
    let offset = 0;
    for (const k of row) {
      const length = (values[k]! * scale) / thickness;
      out[k] = w >= h ? [x, y + offset, thickness, length] : [x + offset, y, length, thickness];
      offset += length;
    }
    if (w >= h) { x += thickness; w -= thickness; } else { y += thickness; h -= thickness; }
    i = j;
  }
  return out;
}

/**
 * Lays out `groups` in a `width` × `height` box: a treemap rectangle per group with a header for its label, and its
 * items on a grid of square cells inside it, filled row by row. Groups keep their input order in `positions`; the
 * treemap places larger groups first.
 */
export function unitDotLayout(groups: DotGroup[], width: number, height: number, o: UnitDotOptions = {}): UnitDotLayout {
  const gap = o.gap ?? 6, header = o.header ?? 16, maxRadius = o.maxRadius ?? 6;
  const order = groups.map((group, index) => ({ group, index })).filter(({ group }) => group.count > 0).sort((a, b) => b.group.count - a.group.count);
  // Each rectangle also pays for its header, so weight a group by its items plus a header's worth of area.
  const totalItems = order.reduce((sum, item) => sum + item.group.count, 0) || 1;
  const headerShare = (header * width * 0.25) / (width * height) * totalItems;
  const boxes = squarify(order.map(({ group }) => group.count + headerShare), 0, 0, width, height);
  const rects: DotGroupRect[] = new Array(groups.length);
  const total = groups.reduce((sum, group) => sum + Math.max(0, group.count), 0);
  const positions = new Float32Array(total * 2);
  const radii = new Float32Array(total);
  const startOf: number[] = [];
  let start = 0;
  for (const group of groups) { startOf.push(start); start += Math.max(0, group.count); }
  order.forEach(({ group, index }, k) => {
    const [bx, by, bw, bh] = boxes[k]!;
    const x0 = bx + gap / 2, y0 = by + gap / 2, x1 = bx + bw - gap / 2, y1 = by + bh - gap / 2;
    rects[index] = { id: group.id, label: group.label, count: group.count, x0, y0, x1, y1 };
    const innerW = Math.max(1, x1 - x0 - 4), innerH = Math.max(1, y1 - y0 - header - 2);
    // The largest square cell that fits every item: try column counts around the area's ideal.
    let best = { cols: 1, cell: 0 };
    const ideal = Math.max(1, Math.round(Math.sqrt((group.count * innerW) / innerH)));
    for (let cols = Math.max(1, ideal - 2); cols <= ideal + 2; cols++) {
      const rows = Math.ceil(group.count / cols);
      const cell = Math.min(innerW / cols, innerH / rows);
      if (cell > best.cell) best = { cols, cell };
    }
    const r = Math.min(maxRadius, best.cell * 0.4);
    for (let item = 0; item < group.count; item++) {
      const col = item % best.cols, row = Math.floor(item / best.cols);
      const p = startOf[index]! + item;
      positions[p * 2] = x0 + 2 + (col + 0.5) * best.cell;
      positions[p * 2 + 1] = y0 + header + (row + 0.5) * best.cell;
      radii[p] = r;
    }
  });
  groups.forEach((group, index) => { if (!rects[index]) rects[index] = { id: group.id, label: group.label, count: 0, x0: 0, y0: 0, x1: 0, y1: 0 }; });
  return { rects, positions, radii };
}
