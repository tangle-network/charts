# @tangle-network/charts

Benchmark figures as static SVG and HTML tables, plus optional React timing primitives.

`WaterfallHeader`, `WaterfallTimeAxis`, `WaterfallBar` and `WaterfallRow` from
`@tangle-network/charts/react` own the timing presentation extracted from
Intelligence's trace viewer. Supply actual span start/end milliseconds and the
same `{ startMs, endMs }` window to every row. Hierarchy, selection, attribution,
formatting and failure interpretation stay with the consumer. The original
minimum/clipped marker remains visible; its tooltip reports the actual duration.
Set `--waterfall-timing-width`, `--waterfall-duration-width` and the existing
`--intel-waterfall-*` colors for the consumer's layout and theme. No stylesheet,
router or React DOM dependency is required.

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

The static root has no runtime dependencies and uses no DOM, so it runs in a Worker, a build step or a browser. The separate opt-in `@tangle-network/charts/react` entrypoint requires React; it is never re-exported by the root.

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

### Plots without visible report controls

Use `renderFigure(figure, noteNumber, { presentation: "plot" })` to show the responsive plot alone.
The complete data table remains available to assistive technology.
This presentation has no visible finding, method text, disclosure or table control.
Vertical plot axes use larger tick labels.
The existing report and chart presentations keep their output and paper behavior.

Plot presentation uses labels of at least 14px and numeric axes of 15px.
Dedicated phone SVGs retain their intended width inside a keyboard-accessible scroll region.
Wide plots reserve side gutters so enlarged labels remain visible.
These typography rules do not apply to report or chart presentation.

## Optional React renderers

```tsx
import { useState } from "react";
import { Sparkline, StackedBarChart } from "@tangle-network/charts/react";

export function RecordedUnits() {
  const [selectedBucketId, onSelectionChange] = useState<string | null>(null);
  return <>
    <Sparkline label="Completion delta" values={[-2, 0, null, 3]} format={String} />
    <StackedBarChart
      label="Recorded units"
      series={[{ id: "a", label: "Series A", color: "var(--chart-accent)" }]}
      buckets={[
        { id: "first", label: "First window", total: 3, segments: [{ seriesId: "a", value: 3 }] },
        { id: "missing", label: "Second window", total: null, segments: [{ seriesId: "a", value: null }] },
      ]}
      maxValue={10}
      formatValue={(value) => `${value} units`}
      selectedBucketId={selectedBucketId}
      onSelectionChange={onSelectionChange}
    />
  </>;
}
```

Install React 18 or 19 in the consuming app. It is an **optional peer** so static-only consumers need neither React nor its types. There is no React DOM, chart framework or UI-package runtime dependency. The renderers need no generated stylesheet; `figure.css` remains exclusively the unchanged static-figure stylesheet. Supply application font/color styles and readable series colors. Apps with server/client component boundaries mark their interactive wrapper as a client component.

**Different scales, on purpose.** `Sparkline` ports Agent App's observed-extent scale; it does not implicitly include zero. Equal readings sit at mid-height, a single reading is a point, null/nonfinite samples retain their sample index and break the line, and finite negative readings are supported. Width/height props control its viewBox. Its accessible name describes the count, gaps, range and direction; the SVG description contains each sample's formatted value. It is not animated and has no selection interaction. The default `en-US` formatter retains Agent App's two-decimal behavior; pass `format={String}` or a domain-specific formatter when exact precision is important.

`StackedBarChart` always uses the caller's **explicit `[0, maxValue]` domain**. It accepts already-grouped buckets with unique IDs, labels, supplied totals and ordered segments referencing declared series IDs. It never fetches, sorts, groups, calculates billed amounts, chooses a currency, maps products/categories, or invents a maximum. Input bucket order is the sample axis, not an inferred date axis; supply every intended bucket, including gaps. Omitted segments are not synthesized as zero.

A null/nonfinite total or segment makes the whole stack a gap rather than a misleading complete bar. The known values remain in the readout and data table. Zero remains measured zero and draws no positive segment. As in the handoff, positive subpixel segments have a one-pixel visual minimum; their reported values and the total are not changed. Negative or out-of-domain finite values, duplicate/unknown identities, and inconsistent complete totals throw `RangeError` rather than clamp or silently aggregate. Nonnegative stacks do not model credits or diverging signed stacks. The existing static `Refusal` API is unchanged; it is not repurposed as React component state.

Selection is controlled by bucket ID. Hover, focus, click, Enter, Space and touch activation select rather than toggle; mouse leave, blur and Escape dismiss. A removed selected ID shows no stale readout, and reordering never selects another bucket by index. The stabilized SVG keeps full-height hit targets and highlights the actual stack. A named keyboard-scrollable region contains its fluid SVG with a 400px minimum. A cursor-adjacent tooltip repeats the selected values for mouse and pen users. It flips at viewport edges and uses a native manual popover to escape transformed or clipped panels. Browsers without popover support use a fixed-position fallback, which a transformed ancestor can constrain. The selected breakdown remains in flow and live-announced; every bucket also carries its formatted values in its accessible name, and a native “View data” disclosure contains the full table. No Tailwind build or hover-only tooltip is required to read the values.

**Provenance and extraction boundary.** Sparkline comes from `tangle-network/agent-app`, `src/web-react/sparkline.tsx` and its tests at `a8947683a050394d13848bb7e4cbbe7cf08d208e`. Stacked SVG rendering and select-never-toggle regressions come from merged ADC [PR #8746](https://github.com/tangle-network/agent-dev-container/pull/8746), `products/platform/web/src/client/components/UsageChartSvg.tsx` and `UsageChart.test.tsx` at `a1c3958fd73a3894d4515f9dc476dae9ace30ce0`. Platform's aggregation, currency/product/category functions, legend composition and portal-tooltip positioning are **not** copied. The persistent readout and native pointer popover avoid a new React DOM peer. This is not a new universal usage-chart API, a zero-baseline replacement for SpendCard's sparkline, or a consumer migration; Platform and Agent App are not edited.

### React and package-boundary checks

```sh
pnpm exec vitest run packages/charts/src/react/sparkline.test.tsx packages/charts/src/react/stacked-bar-chart.test.tsx
pnpm exec vitest run packages/charts/src/package-boundary.test.ts
pnpm exec vitest run packages/charts
pnpm --filter @tangle-network/charts exec tsc --noEmit
pnpm --filter @tangle-network/charts build
```

The package-boundary test builds and packs Charts, installs the tarball in an OS-temporary consumer with a normal offline npm install (no peer-omission flags), asserts React/React DOM/React types cannot resolve, and executes the static root without DOM globals. It compares root exports, static SVG/tables, Refusals, report/chart/plot HTML and CSS with the untouched source implementation, then compiles a static-only consumer with `lib: ["ES2022"]`, `types: []` and `skipLibCheck: false`. Only afterward does it supply the workspace React peer/types to verify the packed React runtime and declarations. It runs under the existing root `pnpm test`; no CI workflow or shared UI smoke-script changes are needed.

The component tests cover gap/zero/one/equal/negative cases, controlled identity, keyboard/touch selection, nonvisual values and resize contracts. The jsdom resize check verifies fluid/minimum-width attributes and preserved selection, **not browser-computed layout**; The retained packed-browser fixture checks Chromium at 1100px and 390px, keyboard selection, emulated touch, light/dark Brand tokens, reduced motion, and top-layer positioning inside a transformed, paint-contained panel. It passes with React 18 and React 19; the React 18 consumer also compiles the packed declarations with React 18 types. Physical touch hardware and screen-reader audio remain unchecked.

### Packed browser proof

Build Charts, then run the reusable fixture from the repository root.
Pass a tarball path to test a published artifact after downloading it with npm pack.

```sh
pnpm --filter @tangle-network/charts build
PORT=46489 node scripts/charts-browser-smoke.mjs /absolute/path/to/charts.tgz
python3 scripts/charts-browser-proof.py http://127.0.0.1:46489 /tmp/charts-proof
```

Set `CHARTS_REACT_VERSION=18` to install and check an isolated React 18 runtime and type consumer.
The default fixture uses the installed workspace React peer and bundles only the packed Charts export.
The fixture imports Brand token CSS and creates a transformed, paint-contained panel.
It needs Python Playwright and Chromium at `/snap/bin/chromium`.
Receipts and screenshots are in [the retained proof](../../docs/evidence/charts-react-189/README.md).
