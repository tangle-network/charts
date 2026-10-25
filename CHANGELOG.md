# @tangle-network/charts

## 0.20.2

- Agent view: connectors appear only for the agent under the pointer, pinned or focused (17 resting elbows read as a tangle).
- Agent view: the kind key sits directly above the lanes.
- Light theme: bars carry 74% of the agent hue (tool steps 38%).

## 0.20.1

- `HBars`: every bar answers a hover with its label and value, or the row's own `title` (from disco-evolve-play's #28).
- `live.css` sizes are px on the 12/14 type scale with 4 px gaps instead of em, so hosts no longer pin them in their own scopes.
- `otlpFlowTrace` sets `costUpperBound` when no priced call splits cached from fresh input (cli-bridge), and the strip shows the list cost as "≤$x" with the reason, instead of "≈".
- Agent view: a key names each mark (Model call, Tool call, Waiting, Handoff, Failed turn), listing only kinds the run has.
- Agent view: a failed turn keeps its failed outline without a × glyph; one warning mark by the agent's name says it failed (blind judges: "red x's everywhere").
- `description` puts one line beside the title, such as the run's goal, so the view opens on what the run was for.
- Light theme: bars carry 58% of the agent hue (tool steps 30%).
- Card titles wrap between words, never at a hyphen.

## 0.20.0

### Minor Changes

- The agent view shows the same stat strip as the steps view (Duration, Cost, Tokens, LLM calls, Tool calls, Errors); its headline keeps only the agent count and parallel speedup. Its end-label gutter is 176 px so a badge fits beside the duration.
- Zoom-to-span on click zooms at most 8x, so pinning a sub-second step on a day-long trace keeps its neighbours in view.
- The view toggle's shown option is disabled (a state, not a control), so clicking it is never a dead click.
- `FlowTrace.pauses` draws a labelled hatched band across every row for an interval when nothing ran ("Paused 4h40m: host guard cancelled workers"), never blank space. `FlowSpan.marks` puts moments on a bar, such as a restart (an amber notch), without changing the span's state or outcome.
- Light theme: bar fills carry 42% of the agent hue (was 24%), tool steps 22% (was 12%), outlines the full hue, so agents stay distinct on white.
- Bars take their agent's hue by default (`agentFill="agent"`); steps and handoff elbows share it, and the outcome moves to the row dot, the legend and the crash glyph. Pass `agentFill="outcome"` for the previous fill.
- Motion: arriving bars grow from their start and their rows unfold in a 20 ms stagger (first paint, live spans, an unfolded branch); a bar that finishes settles and lands its end label; live bars grow with the clock. Keyed to the row set, so scrolling never replays it; `prefers-reduced-motion` turns it off.
- `selectedId` and `onDeselect`: the host's selection (such as the agent whose transcript is open) lifts its row with an accent edge and dims its peers in the agent view; a pinned card only highlights its row; Escape closes the card and clears the selection.
- Bars, segments and end labels sit 8 px from the row edge on the 4 px grid: 24 px agent bars in 40 px rows, 20 px step bars in 36 px rows, phone lanes at 20 px under the name.
- Time travel hooks: `onTimeChange(t | null)` reports the time the reader moved to (`null` while following live or showing the whole trace). Markers also draw as event dots on the axis; clicking one, or pressing N or P, moves the cursor to the next or previous event. `FlowMarker` adds `kind`, `href` and the `warn` tone.
- Cost is never "Unknown" when partly known. `otlpFlowTrace` reports the priced floor with `costCoverage` (`{ priced, total }`) instead of dropping the total when one call lacks a price; the waterfall shows `≥$4.12` with "38 of 41 model calls priced". `FlowTrace.billedUsd` shows the real charge beside a list price ("≈$4.12 · $0.00 billed"). A value with no source at all shows "—", and its tooltip names the missing source.
- `otlpFlowTrace` counts a turn span marked `cli_bridge.usage.scope = sum_of_children` (cli-bridge per-call usage) for display only: totals, prices and the model-call count come from its call spans, so tokens are not counted twice.
- The span card leaves out Cost and token cells nobody recorded (no "Unknown" or dash), and shows the span's `facts` cells, so a host can show billed amounts or partial counts there.
- In the agent view a click on an agent's row (its name or empty track) selects it and calls `onSelect`, as a bar click does; before, only the bar or Enter did.
- The agent view prints each agent's duration and cost at its bar end and marks the slowest agent and the costliest (when two or more are priced), as the Steps view does for steps.
- In the agent view, the waiting time between an agent's steps is hatched in its outcome tone, under the thinking (full tone) and tool (dim tone) segments.
- FigureView type sits on the 12/14/18/32 scale with weights 400/600 (lede 15 to 14 px, read line 13 to 12 px, finding weight 650 to 600, plot numbers 15 to 14 px), line heights on the 4 px grid, and table cells pad 8 px.
- SVG chart text is never below 12 px: axis ticks, point badges, target and verdict-key labels, event labels, heatmap heads, and phone lane labels move from 10 or 11 px to 12 px (latency-range row labels to 12/14), measured at the size they draw so collision and wrap logic stay exact.
- The waterfall follows the host's light or dark theme (`data-theme` or the `light`/`dark` class) rather than the OS, so a light page on a dark OS no longer shows dark-theme muted text (2.4:1). Bars center by `top` instead of a negative margin.
- The agent timeline fits a 17-agent run in a 945 px viewport: 40 px rows (name and a one-line subtitle), with play, speed and the time axis above the lanes.
- `agentFill: 'agent'` colors each agent bar by the agent's own hue, with the outcome on the row dot and the legend; the default `'outcome'` keeps outcome fill.
- A card opened on a segment inside an agent bar shows the agent's duration, facts and cost, then the segment as one line ("Tool call · 4m 31s").
- The outcome legend keeps one order on every page: ok, warn, failed, then neutral tones.
- The agent card's title wraps to two lines, and the card's sentence line shows only what the span did (`output`).

## 0.19.0

### Minor Changes

- `FlowSpan.facts` (up to three `{ label, value }`) adds host facts, such as releases or commits, as cells in the span card.
- The agent view shows each agent's `detail` as a muted subtitle under its name.
- Agent-view handoff connectors rest at 30% opacity; the hovered, pinned or focused agent's connectors draw at full strength.
- A hover card no longer takes the pointer, so it never covers the next bar: every bar opens its card (only a pinned card is interactive).

## 0.18.2

### Patch Changes

- The agent card shows the agent's outcome label as its status pill (in the outcome's color), the agent span's `detail` (such as the outcome sentence, harness and model) under the name, and a Started cell. The sentence line shows what the span did and is left out rather than repeating the agent's name.

## 0.18.1

### Patch Changes

- Stacked agent names (below 900 px) sit above the handoff connectors: rows place by `top` there, so a row is no longer its own stacking context, and the name, dot and alert share one surface-colored backing.
- The outcome legend adds a "Failed step" key with its count when an agent's marks include failed steps, so a failed step inside a finished agent no longer reads as a failed agent.

## 0.18.0

### Minor Changes

- `FlowSpan.outcome` (`FlowOutcome`: `{ tone: 'ok' | 'neutral' | 'failed' | 'warn', label }`) is the host's verdict on an agent, such as shipped or crashed. It colors that agent's lane (dot, bar and marks), and the header draws one legend item per label with its count.
- An agent bar with no child marks takes its lane color instead of a neutral grey, so a trace of bare agent spans still says which bar is whose.
- The agent view shows 20 rows before it scrolls (`maxHeight` still overrides; steps keep 640 px).
- Marker labels thin out where they would collide (every line stays) and flip to the left of their line at the right edge.

## 0.17.1

### Patch Changes

- The agent view fits long runs: its label column fits the longest agent name, capped at 28% of the width (was a fixed 240 px up to 42%), and below 900 px each agent's name sits on its own line above a full-width lane, so nothing truncates on a phone or tablet.
- The agent view's card is a compact tooltip: the agent and its outcome, two or three recorded values (time, tokens, cost) and one sentence. The mark under the pointer lifts.
- FlowWaterfall type uses four sizes (12, 14, 18 px) and two weights (400, 600); its padding, margins and gaps sit on the 4 px grid.

## 0.17.0

### Minor Changes

- `FlowWaterfall` takes `onSelect(span)`, called when a row is opened or a bar is pinned, so a host can open its own drill-down; the built-in behavior still runs.
- `FlowWaterfall` takes `markers`: labelled instants (`{ at, label, tone }`, `FlowMarker`) drawn as dashed lines across the rows on the trace clock, such as releases.

## 0.16.0

### Minor Changes

- `FlowWaterfall` gains the agent timeline (`defaultView="agents"`): one row per agent, elbow handoffs out and back, hatched waiting, retry and failure glyphs, and the measured speedup over sequential. Expanding an agent opens the span view.
- The span view virtualizes (5,000 spans scroll at 58+ fps), pins ancestors, labels bars with duration and recorded cost, shows a span card on hover (pinned on click), zooms by wheel, keys and buttons, zooms to a narrow span on select, and carries a scrub track over the whole trace. Growth and playback move bars through CSS variables, without React renders per frame.
- `otlpFlowTrace` and `parseOtlpJsonl` read the `traces convert` OTLP-JSONL contract for every harness, joining agents in separate traces on their spawn calls; `catalogPrice` prices model calls from a model catalog at runtime, labelled list price.
- `FlowSpan` adds optional `detail`, `icon`, `costUsd`, `promptTokens`, `completionTokens`, `input`, `output`, `retryOf` and `handoffTo`; `FlowTrace` adds `costBasis`. Existing traces render unchanged in meaning; the summary now formats durations as `7m 11s` and token totals as `754.4k` with the exact count in the title.

## 0.15.1

### Patch Changes

- A time axis never repeats a label: of two ticks that format the same (two times on one day under a day format), the first stands. The Discovery play climb printed "Oct 20 Oct 20 Oct 20".
- A point label whose neighbours take both sides, as on a dense run of releases, is placed above its point before it is dropped, so the first and last releases of a flat line keep their names.

## 0.14.0

### Minor Changes

- `Events` draws recorded instants (restarts, deploys) on one time axis: a tick per event in the window, evenly spaced axis labels, and each tick titled with its time on hover. The admin portal drew this strip by hand.

## 0.13.0

### Minor Changes

- `Spark` honors any positive `max`, so a per-minute error rate of 0.02 fills the row instead of lying flat under a floor of 1; the default stays 1 for shares. With `label` it is an image with that name, and hovering reads the nearest point through `format` and an optional `time` formatter, with a dot on the line.

## 0.12.2

### Patch Changes

- `Lines` titles its crosshair tooltip with the caller's `axis` formatter when one is given, so the tooltip and the time axis read the same clock; it printed UTC `MM-DD HH:MM` beside a local `04:30 PM` axis.

## 0.12.1

### Patch Changes

- `StackedBarChart` axis ticks are round numbers: the axis runs to the tightest top reachable in three to six steps of 1, 2, 2.5 or 5 times a power of ten, so a `$0.0028` peak reads `$0`, `$0.001`, `$0.002`, `$0.003` instead of `$0.0021` and `$0.00070`. Dense bucket labels stay horizontal and every Nth one is drawn so none overlap; the rotated labels fell outside the 32px bottom margin.

## 0.12.0

### Minor Changes

- One palette with fixed meanings. `ok` attempts are the status green (they were blue, the current checker's hue), `lost` is cyan (it was green), and `other` has its own grey beside `aborted`'s. Checker hues are blue (current), magenta, cyan and violet, none of them a status colour: a play's first checker was green, so 17c's 29 failing magnetar-rust rows read as passes. `ENDING_ORDER` and `ENDING_COLORS` name how a run ended (solved green, not solved slate, died red, stalled amber, cancelled grey, live blue, never started hatched) for every view that colours runs. The palette check passes in both themes.
- A failing verdict recorded without a value is a neutral ring in the strip under the plot, not an outline in its checker's hue.
- Rulings never merge into one rule with a `(+1)` label: each ruling made or kept a check, so each keeps its own rule and label. Group bracket labels are drawn over event rules, so a rule no longer strikes through a run's span (`10-19 03:2.7Z`).

## 0.11.0

### Minor Changes

- `unitDotLayout` packs one dot per item in a rectangle per group, the rectangles a squarified treemap sized by count, and React `DotMap` draws thousands of such dots (or a semantic map's points) on one canvas with wheel and pinch zoom, drag to pan, keyboard steps, grid hit tests and one fill per colour. A lens is a palette index per point, so recolouring needs no new layout. `DOT_MAP_CATEGORIES` names the first three categorical hues and a neutral "other".

## 0.10.0

### Minor Changes

- Figures can be drawn at their container's width. `timeSeries`, `smallMultiples` and `timeline` take `width` (at least 720, the default) for the wide render, and React `FigureView` takes a function `(width) => Figure` that it calls with its measured width in 32 px steps. `TimelineView` draws this way. On a 1,300 px page a release climb or an agent timeline keeps its 11-12 px labels and marks instead of being scaled up 1.8× from 720 px, and a 660 px panel no longer falls back to the phone render because its figure was fixed at 720.
- `timeSeries` takes `legend: false` to leave out the series legend when the caller names its series itself, such as a checker legend above the plot. The verdict key stays.

## 0.9.1

### Patch Changes

- `timeSeries` sizes its y gutter to fit the strip name, so a long `y.strip` such as `undecided / unscored` is no longer cut off at the left edge. A strip name too long for the phone chart is refused, the same way an over-long y label is.

## 0.9.0

### Minor Changes

- A point can carry what a release check recorded, not only a value: `verdict` (a pass is filled, a fail outlined, an undecided verdict dashed), `count` (`×n`), `firstAt` and `lastAt` (hover and table), `comparable` (`*` when false, `?` when unknown), a status `glyph` (`check` for a solve, `cross` for a failing candidate), its own `marker` shape and a short `label` such as `9/15`. A point with a verdict and no value goes in a strip under the plot (`y.strip` names it) and is never drawn at a height. Badges are placed after every mark and skipped where they would cover one; a key under the legend names the forms the data uses, with `markers` naming the shapes (`{ circle: "check", diamond: "gate" }`).
- `timeSeries` takes `y.scale: "log"`, recorded `y.targets` (a shaded target band or a dashed stretch band, a line when `from` equals `to`) and caller-named `y.ticks`, such as check stages. `x.categories` makes x ordinal: weighted columns, several points per column spread across it, every full-width column labelled (turned 40° when level labels do not fit), and band bounds that name a category cover its column.
- Bands gain `group`, a labelled bracket above the plot with a rule at each inner edge (a group may cover one position). An `event` mark whose `source` is `gap` stays off the data and takes a label row only after every other mark.
- A row's `colorIndex` draws it in a fixed checker hue (0 is the current checker; past the fourth it is muted), and its dash follows the same index.
- `smallMultiples` panels take `scale`, `targets` (named in a key under the panel title) and, on a shared x axis, their own `unit` and `format`; the figure takes `x.categories`, `columns`, `connect: false` and `markers`.
- `TickOutcome` gains `lost`, a turn the platform lost without a kill. Attempt outcomes and checkers have one palette, exported as `OUTCOME_ORDER`, `OUTCOME_COLORS`, `checkerColor` and `CHECKER_HUES`, and defined once in `figure.css` as `light-dark()` pairs that follow the page's `color-scheme`. Both pass the dataviz palette validator on the light surface and on #161616 (`node scripts/palette-check.mjs <validate_palette.js>`). Timeline ticks take the outcome palette.

## 0.8.0

### Minor Changes

- `timeline` draws an agent tree over time. Lanes take `parent` and `depth` and draw under their parents with connectors; `ticks` draw each recorded attempt coloured by outcome (`ok`, `quota`, `rate-limit`, `oom`, `refused`, `aborted`, `other`) with ok and failed counts at the lane's end; `detail` carries the caller's hover facts; `collapsed` folds subtrees, and React `TimelineView` wires the fold toggles.
- The `timeline` window defaults to the extent of the data, not a later deadline; marks past the window are named at its edge with their distance, and bands are clipped. Marks with a `lane` draw on that lane only.
- Marks gain `release`, `steer`, `ruling` and `wake` kinds with head shapes, a `verdict` colour and a `source`; bands gain `blocked` for system-wide walls such as a quota window.
- Axis and mark labels no longer overlap at 720 or 358 px on `timeline` and `timeSeries`: measured clock steps on `timeline`, evenly spread recorded positions on `timeSeries`, and mark labels in rows above the data, merged where marks share a place. `timeSeries` moves its plot down by the label rows it uses; x positions are unchanged.

## 0.7.0

### Minor Changes

- Add an optional caller-owned `description` on `StackedBarChart` buckets, appended to the bar name, the single live readout and the pointer tooltip, so consumers announce values the chart cannot derive (such as request counts) without a second live region.

## 0.6.0

### Minor Changes

- Add recorded `marks` and `bands` to static `timeSeries` and React `Lines`, listed in the table and under the plot.
- Add the static `timeline` figure and multi-span `lanes`, `marks` and `now` on React `Gantt`; open spans run to `now`.
- Add `segments` on React `Meter`; hatch the untraced remainder and `phaseWaterfall`'s unaccounted leaves.
- Add the static `smallMultiples` figure with hatched no-data panels and early-end marks, and React `FigureView` to embed any static figure.
- Give series a second channel: dashes and marker shapes on static `timeSeries` and React `Lines`.

## 0.4.0

### Minor Changes

- 74c372e: Add reusable React renderers and CSS for live operational charts, with caller-owned labels, colors, links, and actions.

## 0.3.1

### Patch Changes

- e012234: The canonical surface ladder is GTM's. Dark is indigo-lifted (`#0a0a14` canvas, `#191826` card, `#221f33` nested, `#2c2942` overlay, `#2a293d` hairline); light is a cool `#eceef3` canvas with white paper, `#f1f2f7` wells and a `#c7c6d6` hairline; light syntax uses GTM's palette. Every product on the default theme now renders GTM's surfaces without restating them, and `tangle-dark` repeats the new spine. Ink stays achromatic and surfaces stay below 0.1 chroma, so the accent still signals interaction. Charts regenerates its CSS from the new tokens.

## 0.3.0

### Minor Changes

- e019ec2: Extract Intelligence's waterfall timing, axis and row primitives for use by trace viewers and recorded runs. Preserve timestamp offsets, clipped-span markers, and caller-owned hierarchy, selection and failure semantics.

## 0.2.0

### Minor Changes

- 9e54159: Add the isolated, optional React entrypoint with the Agent App extent sparkline and the stabilized Platform stacked-bar renderer. Preserve the dependency-free static root and figure.css; leave application data mapping, aggregation, currency and portal tooltips outside Charts.

### Patch Changes

- a8e787f: Size trajectory axis gutters from their formatted labels so units remain visible on phones.
- 4fc2643: Refuse formatted trajectory labels that leave no room for a valid phone x axis.

## 0.1.13

### Patch Changes

- c0ac043: Make plot presentation labels at least 14px and numeric axes 15px, retain readable phone SVG dimensions with keyboard scrolling, and reserve wide-chart gutters for enlarged labels. Existing report and chart presentation outputs remain unchanged.

## 0.1.12

### Patch Changes

- 01a2deb: Add plot presentation without visible method or data controls, retaining complete accessible tables and larger vertical-axis tick labels. Existing report and chart presentation outputs remain unchanged.

## 0.1.11

### Patch Changes

- 7fc069e: Add input-ordered scalar bars and recorded trajectories with explicit domains, observation counts and missing-value gaps. Reuse vertical rate geometry without changing existing rate figures or inferring ranks, intervals or scores.

## 0.1.10

### Patch Changes

- bb7d7de: Add a vertical rate chart with explicit model and harness identities, a full percentage axis, and hover and keyboard details. Add a chart-first figure presentation with supporting data and method in a closed disclosure. Default report plots and interpretation stay unchanged.

## 0.1.9

### Patch Changes

- ec66e0e: Show the cost-per-pass range, identify estimated costs, and explain the required improvement in comparison findings.

## 0.1.8

### Patch Changes

- 7c17f1d: Describe supported effects as pairwise comparisons and identify the shared tasks passed by every setup.

## 0.1.7

### Patch Changes

- d7c1194: Label comparison intervals as the oriented difference, so an unsupported registered direction does not read as a winner.
  Place the pair count below wrapped comparison labels on phones, so the labels remain readable.
  Keep the zero reference inside each phone plot instead of crossing its label.

## 0.1.6

### Patch Changes

- 3b323a4: Label rate interval counts as attempts instead of implying an independent sample size.

## 0.1.5

### Patch Changes

- 859a51a: Allow unranked rate figures to retain explicit input order with neutral findings.

## 0.1.4

### Patch Changes

- 1ce585f: Preserve unmeasured and flagged attempts in non-tier task matrices.
  Show those counts in the accessible table and refuse overlapping observation counts.

## 0.1.3

### Patch Changes

- 720de9a: Normalize the shared neutral palette and regenerate standalone chart tokens so charts follow the palette. Make user message cards wrap in narrow layouts.

## 0.1.2

### Patch Changes

- dc84d1c: Update every dependency to its latest release and build with tsdown on TypeScript 7.
  `@tangle-network/ui` now accepts `@nanostores/react` 2 as a peer, moves to lucide-react 1 and marked 18, and drops the unused `react-pdf` and `@radix-ui/react-toast` dependencies.
  Export paths are unchanged; internal chunk file names differ.

## 0.1.1

### Patch Changes

- c5984db: Keep task-clustered bootstrap marks within the producer's bootstrap estimate class while retaining Wilson uncertainty on eligible descriptive rates.
  Identify omitted intervals and show unknown costs as unknown.
  Include interval method and sample size in chart data tables and point descriptions.
  Refuse malformed source counts and intervals, and suppress unsupported rank claims.
