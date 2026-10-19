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
 * bar keeps it; `ok` is the status green, `aborted` and `other` are two distinct greys and always carry a label. An
 * attempt still running is `open` and is drawn hatched, never as an outcome.
 */
export const OUTCOME_ORDER: readonly TickOutcome[] = ["ok", "quota", "lost", "rate-limit", "oom", "refused", "aborted", "other"];

/** The CSS colour of each outcome, for a caller that paints its own marks (a legend, a stacked bar). */
export const OUTCOME_COLORS: Readonly<Record<TickOutcome, string>> = Object.freeze(Object.fromEntries(
  OUTCOME_ORDER.map((outcome) => [outcome, `var(--chart-outcome-${outcome === "aborted" ? "neutral" : outcome})`]),
) as Record<TickOutcome, string>);

/**
 * How a run ended, in the order a legend lists them: `solved` (its check passed), `not solved` (it ended, its check
 * did not pass), `died` (the platform or driver failed), `stalled`, `cancelled`, `live` and `never started`. Every
 * view that colours runs by their ending uses these words and ENDING_COLORS, so green, red and amber mean one thing.
 */
export type RunEnding = "solved" | "not solved" | "died" | "stalled" | "cancelled" | "live" | "never started";
export const ENDING_ORDER: readonly RunEnding[] = ["solved", "not solved", "died", "stalled", "cancelled", "live", "never started"];

/** The CSS colour of each run ending (`--chart-ending-*` in figure.css). */
export const ENDING_COLORS: Readonly<Record<RunEnding, string>> = Object.freeze(Object.fromEntries(
  ENDING_ORDER.map((ending) => [ending, `var(--chart-ending-${ending.replace(" ", "-")})`]),
) as Record<RunEnding, string>);

/**
 * How many checkers have their own hue. Index 0 is the current checker; later indexes are older checkers. Checker hues
 * (blue, magenta, cyan, violet) avoid the status green, red and amber, so a checker's colour never reads as a verdict.
 */
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
