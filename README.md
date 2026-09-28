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
A missing, zero, or unproven cost prints `unknown`; zero passes print `no pass`.
Rank numbers require every row to carry both a rank and a `bootstrap` estimate.
Malformed rates, intervals, matrix counts, and breakdown counts return a refusal instead of a misleading mark.

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

The package is private until its first npm publish.
npm trusted publishing needs the package to exist before a trusted publisher can be added, so the first version is published once by an owner, then `npm trust github @tangle-network/charts --file release.yml --repo tangle-network/brand --allow-publish` hands later versions to the release workflow.
