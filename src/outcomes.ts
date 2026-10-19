/**
 * The fixed palettes every Discovery view shares: attempt outcomes (stack order) and check versions (checkers).
 * The colours live once, as `--chart-outcome-*` and `--chart-checker-*` custom properties in `figure.css`, each a
 * `light-dark()` pair chosen by the page's `color-scheme`. `node scripts/palette-check.mjs <validate_palette.js>`
 * runs both palettes through the dataviz validator on the light surface and on #161616.
 */

/**
 * How one recorded attempt ended. `ok` succeeded; every other outcome counts as failed. `lost` is a turn the
 * platform lost without a kill (a sandbox that vanished), distinct from `oom`, a turn killed for memory.
 */
export type TickOutcome = "ok" | "quota" | "lost" | "rate-limit" | "oom" | "refused" | "aborted" | "other";

/**
 * Outcomes in stack order. Adjacent outcomes pass the colour-vision checks in both themes in this order, so a stacked
 * bar keeps it; `aborted` and `other` share the neutral tone and always carry a label. An attempt still running is
 * `open` and is drawn hatched, never as an outcome.
 */
export const OUTCOME_ORDER: readonly TickOutcome[] = ["ok", "quota", "lost", "rate-limit", "oom", "refused", "aborted", "other"];

/** The CSS colour of each outcome, for a caller that paints its own marks (a legend, a stacked bar). */
export const OUTCOME_COLORS: Readonly<Record<TickOutcome, string>> = Object.freeze(Object.fromEntries(
  OUTCOME_ORDER.map((outcome) => [outcome, `var(--chart-outcome-${outcome === "aborted" || outcome === "other" ? "neutral" : outcome})`]),
) as Record<TickOutcome, string>);

/** How many checkers have their own hue. Index 0 is the current checker; later indexes are older checkers. */
export const CHECKER_HUES = 4;

/** The CSS colour of checker `index` (0 is current). Indexes past the fourth hue fold into the muted tone. */
export function checkerColor(index: number): string {
  return Number.isInteger(index) && index >= 0 && index < CHECKER_HUES ? `var(--chart-checker-${index})` : "var(--chart-muted)";
}

/** The class a figure puts on a series drawn in checker `index`'s colour. */
export function checkerClass(index: number | undefined): string {
  if (index === undefined) return "";
  return Number.isInteger(index) && index >= 0 && index < CHECKER_HUES ? `tgc-checker-${index}` : "tgc-checker-other";
}
