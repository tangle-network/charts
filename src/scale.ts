/** Scales and ticks. Pixel coordinates follow SVG: +y points down. */

export interface Scale {
  (value: number): number;
  domain: [number, number];
  range: [number, number];
}

export function linear(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const slope = (r1 - r0) / (d1 - d0 || 1);
  const scale = ((value: number) => r0 + (value - d0) * slope) as Scale;
  scale.domain = domain;
  scale.range = range;
  return scale;
}

/** A log10 scale; `domain` must be positive. Pass a reversed range to put small values right. */
export function log(domain: [number, number], range: [number, number]): Scale {
  const inner = linear([Math.log10(domain[0]), Math.log10(domain[1])], range);
  const scale = ((value: number) => inner(Math.log10(value))) as Scale;
  scale.domain = domain;
  scale.range = range;
  return scale;
}

/** Evenly spaced ticks at 1, 2 or 5 × 10^k, about `count` of them. */
export function linearTicks(min: number, max: number, count: number): number[] {
  const span = max - min;
  if (span <= 0) return [min];
  const rough = span / count;
  const exp = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / exp;
  const step = (fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10) * exp;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) {
    out.push(Number(v.toFixed(10)));
  }
  return out;
}

/**
 * Log ticks: the coarsest mantissa set that puts at least three ticks inside
 * the domain, so a narrow domain still reads.
 */
export function logTicks(min: number, max: number): number[] {
  const sets = [[1], [1, 2, 5], [1, 2, 3, 5], [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8]];
  let best: number[] = [];
  for (const mantissas of sets) {
    const out: number[] = [];
    for (let e = Math.floor(Math.log10(min)) - 1; e <= Math.ceil(Math.log10(max)); e++) {
      for (const m of mantissas) {
        const v = Number((m * 10 ** e).toPrecision(6));
        if (v >= min && v <= max) out.push(v);
      }
    }
    best = out;
    if (out.length >= 3) break;
  }
  return best;
}

/** Widens [lo, hi] geometrically to span at least `minFactor`, then pads each side by `pad`. */
export function logDomain(lo: number, hi: number, minFactor = 3, pad = 1.25): [number, number] {
  let a = lo;
  let b = hi;
  if (b / a < minFactor) {
    const centre = Math.sqrt(a * b);
    const half = Math.sqrt(minFactor);
    a = centre / half;
    b = centre * half;
  }
  return [a / pad, b * pad];
}
