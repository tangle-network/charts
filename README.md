# @tangle-network/charts

Benchmark figures as static SVG and HTML tables.
Five figures cover the decisions a benchmark reader makes:

| Figure | Question |
|---|---|
| `rankedRates` | Which setup solves most, and how uncertain is each rate? |
| `costFrontier` | Which setup gives the most solves per dollar? |
| `comparisonIntervals` | Is each step in the order real? |
| `taskMatrix` | Where does each setup succeed and fail? |
| `breakdown` | Why do attempts fail? |

The library draws and never decides.
Ranks, intervals, frontier membership, estimate labels and pass counts come from the producer: a board record, a VerticalBench report or an agent-eval lens.
A figure function returns a `Refusal` in place of a figure it cannot draw honestly, for example a bar over too few units, an interval that names no method, or a frontier the producer did not compute.

The producer's `estimate` controls rate marks: `descriptive` draws a rate bar and may show a named Wilson score interval when that estimate meets the producer's unit threshold.
Task-clustered bootstrap intervals require a `bootstrap` estimate.
Intervals without support are marked as not drawn in the data table and note.
Cost-per-pass figures print `unknown` for missing, zero, or unproven cost; zero passes print `no pass`.
A matrix preserves an observed zero cost as $0 and omits a null cost.
Rank numbers require every row to carry both a rank and a `bootstrap` estimate.
For an unranked descriptive report, `rankedRates` accepts `order: "input"` to retain the producer's row order and make no ranking claim.
The default keeps supported ranks or sorts unranked rows by observed rate.
Malformed rates, intervals, matrix counts, and breakdown counts return a refusal instead of a misleading mark.
Unmeasured and flagged matrix attempts keep distinct marks and table counts, even without tier grades.
An interval whisker is omitted when its bounds exclude the row's rate.

It has no runtime dependencies and uses no DOM, so it runs in a Worker, a build step or a browser.

## Use

```ts
import { isRefusal, rankedRates, renderFigure, renderNotes, renderRefusals } from "@tangle-network/charts";
import "@tangle-network/charts/figure.css";

const fig = rankedRates(rows, { measure: "solve rate", passTier: "B" });
const html = isRefusal(fig) ? renderRefusals([fig]) : renderFigure(fig, 1) + renderNotes([fig]);
```

Each figure returns:

- `finding`, `lede` and `read`: sentences generated from the input. No function accepts heading text.
- `svg.wide` (720 px) and `svg.narrow` (358 px, or `null` when the table is the phone view).
- `table`: an HTML table with every number the plot shows.
- `note`: the method, the n and every exclusion, rendered by `renderNotes`.

## Colour

Marks carry classes, and `figure.css` maps them to the `--chart-*` tokens in `@tangle-network/brand` tokens.css.
A render contains no colour value, so it follows the page theme.
A document without brand tokens (a PDF, a sandboxed iframe) embeds `chartTokensCss` and `figureCss` in a `<style>` element.
`chartTokensCss` is light by default, dark under `prefers-color-scheme: dark` or `data-theme="dark"`, and light in print.

One accent marks the measure a reader decides on.
One muted grey marks everything secondary.
An indigo ramp marks App Grade tiers C, B, A and S; F is an outline.
Identity is carried by direct labels, never by hue.

## Develop

```sh
pnpm --filter @tangle-network/charts gen:css   # after editing src/figure.css or brand tokens.css
pnpm --filter @tangle-network/charts build     # fails when src/css.generated.ts is stale
```

## Release

Versions publish from the brand release workflow through npm trusted publishing, like `@tangle-network/brand` and `@tangle-network/ui`.

### Chart-first vertical rates

`rankedRates(rows, { measure: 'pass rate', orientation: 'vertical', order: 'input', identities })` draws vertical bars on a full 0–100% axis.
`order: 'input'` keeps unranked producer order; omit it to keep the existing ordering behavior.
Optional `identities` maps setup IDs to `model` and `harness` marks, each with an explicit `{ label, src }`.
Images must use same-origin absolute paths or HTTPS URLs; the library never infers a provider from a model name.
Hover or focus a column to read its actual count, eligible interval, known cost and run time.
Zero has no positive bar, and ineligible estimates keep their count without a bar.

Use `renderFigure(figure, noteNumber, { presentation: 'chart' })` for a chart-first surface.
The plot fills its container; data, reading instructions and method stay in a closed disclosure.
The default report presentation, underlying table and note links remain available.
Many columns keep a readable minimum width and scroll horizontally.

### Recorded scalar values and histories

`metricBars` draws continuous scores or counts on an explicit zero-based axis.
It preserves input order and draws no rank.
A known zero has no positive bar; a null value prints `not measured`.
Observation counts use the caller's explicit unit.

```ts
import { isRefusal, metricBars, renderFigure, renderRefusals } from "@tangle-network/charts";

const figure = metricBars([
  { id: "a", label: "Setup A", value: 0, observations: { count: 13, label: "tasks" } },
  { id: "b", label: "Setup B", value: null, observations: { count: 0, label: "tasks" } },
], { measure: "mean composite score", unit: "score", domain: [0, 1] });
const html = isRefusal(figure) ? renderRefusals([figure]) : renderFigure(figure, 1, { presentation: "chart" });
```

`timeSeries` draws recorded scalar values at strictly increasing, finite positions.
The caller includes every configured position, with null for a missing observation.
Null breaks the line; the library never interpolates a missing value.

```ts
import { isRefusal, renderFigure, renderRefusals, timeSeries } from "@tangle-network/charts";

const figure = timeSeries([{ id: "a", label: "Setup A", points: [
  { x: 1, y: 0, observations: { count: 13, label: "tasks" } },
  { x: 2, y: null, observations: { count: 0, label: "tasks" } },
  { x: 3, y: 0.5, observations: { count: 5, label: "tasks" } },
] }], { x: { label: "shot", domain: [1, 3] }, y: { label: "mean composite score", unit: "score", domain: [0, 1] } });
const html = isRefusal(figure) ? renderRefusals([figure]) : renderFigure(figure, 1, { presentation: "chart" });
```

Both examples show behavior controls, not benchmark results.
Both functions refuse out-of-domain values, invalid intervals and measured values with zero observations.
Intervals arrive with their recorded bounds, confidence level and method; neither function computes them.
Optional annotations carry independent recorded facts, such as all checks passing.
Hover or focus a mark for its value, observation count, interval and annotation.
The data table retains missing positions and full labels.
