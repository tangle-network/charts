## 2.0.8

Agent lanes use authoritative Model calls and Tool calls facts as opaque values, preserving explicit unknowns and measured zero when displayed steps are sampled. Families retain their agent/failure summaries and numeric token/cost rollups; synthetic family cards keep opaque counts and percentiles unknown instead of aggregating display samples.

## 2.0.7

Explicit host facts replace same-label inferred card metrics, case-insensitively. Full-stream counts, tokens, latency and explicit unknowns remain authoritative when the displayed history is bounded or coalesced. Additional host rows retain their labels and order.

## 2.0.6

Keep long agent names on their own phone line, with status and duration/cost below and work bars underneath. Preserve the full metric card, failure and quiet evidence, compact Key and desktop layout. Phone rows remain virtualized at the measured height.

## 2.0.5

Keep timeline and graph content before the shared recent-events feed, compress summary and playback controls, and keep the running Key swatch still. Status labels use the shared UI glyphs; Quiet remains an activity observation. Work swatches name their actual example rows. Failed-agent end labels and the error rug identify recorded ends, never an inferred failure instant or cause. Public APIs and measured totals are unchanged.

## 2.0.4

- Keep desktop playback time beside the mini scrubber in its own sized column, so long durations stay readable. Preserve the phone's single-line time above its track.

## 2.0.3

- Under reduced motion, keep the Live badge text still while its 6px dot alone breathes. Preserve the essential row dots without animating whole labels.

## 2.0.2

- Enforce the identity palette's exact lightness and chroma bounds, with rendered status-distance and contrast checks. Correct light cyan and the fifth family slot before publishing this version.

- Keep failed-span evidence on its own source: use explicit Failure facts, label other output as recorded output, and never substitute an agent's unrelated output. Missing detail remains explicit.
- Retain known Running/Done phone labels. Compare leaf agents only and keep scoped, neutral comparison badges in the label area.

## 2.0.1

- Optional graph and latestEvents slots compose one Agents/Steps/Graph control. Graph switches retain the owner clock and controlled selection; the shared header feed remains mounted.

- Explain bar family color and work shade with actual displayed-agent model/tool examples and the same waiting hatch.
- Give Duration and Cost the primary number role; keep other metrics on a compact line so phone agent rows lead sooner. Unknown values remain a dash and measured zero remains zero.

## 2.0.0

- Center intermediate phone axis labels so four ticks remain separated on long traces; keep the scrubber time on one line inside its track.

- Token totals are optional. Callers reading `FlowTrace.promptTokens` or `completionTokens` must handle unknown values. Omit unreported totals; numeric zero remains measured zero.
- Preserve unknown usage through OTLP construction, aggregation and playback. Guard invalid counts, avoid pricing unreported usage as zero, and keep aggregate usage from counting twice.

## 1.0.2

- Quiet requires recorded event timestamps; missing history stays unknown and simultaneous events retain zero cadence gaps.

- Keep waterfall identity colours and bar-label contrast separated from Brand 1.31.1 status colours across fill modes.
- Show canonical status dots when a trace omits custom outcomes, retain Failed and Needs you labels on phones, and mark the Key disclosure with a chevron.

# @tangle-network/charts

## 1.0.1

- The waterfall locates errors on an axis rug and opens matching agents and steps from its Errors and outcome filters. Its header reports failed-agent and quiet-agent counts. Unreported error times stay explicitly unlocated.
- `FlowSpan.activityAt` accepts trace-relative activity timestamps. Quiet agents retain their identity, name the silence and hatch their inactive tail. Running marks share Brand's opacity-only ambient breath, including under reduced motion.
- Below a 600px container width, rows stack name and duration above an 8px full-width lane; the axis has four ticks and the legend opens from Key. Cards and controls use Brand radii and motion roles. Model and tool segments use consistent lightness in both themes.
- Run labels, colors and failure glyphs consume ui's canonical status metadata at build time without adding a UI runtime dependency. `toolGlyph` is available from the React entrypoint for downstream event views.

## 1.0.0

- First stable release, the same code as 0.21.25. Later compatible changes ship as patch releases ([release versioning](https://github.com/tangle-network/agent-runtime/blob/main/docs/release-versioning.md)).

## 0.21.25

- With the muted fill (`agentFill="muted"`), an agent's dot keeps its outcome's colour. The muted fill retoned every element with a tone, so in 0.21.23 a Shipped agent's dot drew grey beside a green Shipped key.

## 0.21.24

- Nothing in the static figures or the live charts reads below 14px. The figure's note references, reading line, data table, data summary and notes were 12px (`figure.css`). The live charts' axis labels, bar values and meter text were 12px monospace (`live.css`); they are now 14px in the host's sans with tabular digits, as the design bar asks ("mono is for ids"). The dot-map tooltip was 12px. The 10-27 judges found `.tgc-table` and `.tgc-notes` at 12px in the served Discovery stylesheet, and the Fleet page's bar values and meter text use `live.css`.

## 0.21.23

- The hover card never leaves the viewport. It is capped at 60% of the viewport's height (a pinned card scrolls inside), and when neither side of its mark holds it whole it shifts up until its last row is in view. On the served 25b Timeline the card ran past the bottom edge and cut its last row (10-27 judges).
- One running hue. A new outcome tone, `live`, draws a running agent's dot, lane and key in `--fw-live` (the accent unless the host sets it), the same ink as the Live and Running pills. A host no longer has to borrow `warn` (amber) for a running agent, so amber stays for what needs attention.
- An outcome can be a ring (`FlowOutcome.ring`): the dot, the key and the card draw a hollow ring in the tone, so two outcomes on one tone read apart (Done beside Shipped). A running agent with an outcome dot no longer also shows a spinner, which on 22a sat beside a green Shipped dot and contradicted it.
- Amber is for attention only. Slowest and Costliest badges are neutral outlined pills, the muted fill no longer retones the slowest lane amber, a restart notch is the failure ink (the run overview's ✕), and a retried step's chip is grey.
- One vocabulary: "Model call", "Model calls" and "Model latency" everywhere (the key already said Model call; the card, the agent subtitles and the stat strip said LLM). Thousands print as K, as every host prints them ("41.6K out", not "41.6k").
- The card's tokens stack one value a line (in, out, cached), so no line starts on a separator ("· 3.8M cached").
- The axis dots and their dashed lines get a key: "Release 4" (the markers' kind, or Event when they mix).
- The agent count and parallel speedup share the title's line, and the green check beside them is gone, so the lanes start one row higher.

## 0.21.22

- In the agent timeline, the whole connectors between agents draw only for the agent under the pointer, pinned or focused. At rest, a spawn is a short elbow into its child, and a return is not drawn. On a 55-agent run, root's spawns no longer draw dozens of full-height lines through every lane (Drew 10-26: "lines inconsistent"; the 10-27 judges: "the main source of clutter").
- A card above its mark stays inside the chart. It is placed by its measured height, so it no longer rises over the page's header and tabs.
- Nothing in the waterfall or the live charts (`live.css`: legends, keys, tooltips, notes) reads below 14px. Agent subtitles, axis ticks, end durations, badges, the legend and the card's table were 12px.

## 0.21.21

- Bars carry identity, dots carry outcome. The agent hues are an identity ring at one lightness and a moderate chroma (OKLCH L 0.55 light, 0.70 dark, C 0.11): blue, violet, pink, cyan and slate after the neutral root. Brand's icon-strength teal and lime are gone from the lanes, so no lane outshouts another or reads as a status. Blind round 29 judges said the saturated teal, pink and violet "compete" and lime and pink long bars read olive and maroon.
- An agent's dot shows its outcome only; an agent without a recorded outcome gets a hollow ring instead of its lane hue. The outcome key's entries are 8px circles that match the dots.
- A merged step's count chip shows only beside the tool name it counts, and the folded family's `+N` badge is gone: the family's second line already says how many agents it holds.
- Dark theme: model and tool steps become light pastels at OKLCH L 0.82 and 0.64, up from 0.72 and 0.46, with dark ink. Round 27's pastel dark fills scored 39/252; round 29's judges read the darker 0.46 tool step as muddy.
- Browser proof: every filled agent dot's colour must appear in the outcome key.

## 0.21.20

- With per-agent hues, a step's kind is a fixed lightness on its agent's hue, the same for every hue: model OKLCH L 0.50 on light and 0.72 on dark, tool 0.80 and 0.46, chroma capped at 0.10 (a neutral stays neutral). Model is always the stronger step against the surface, so dark tool steps no longer read lighter than model steps against the key. The key's swatches use the same lightnesses. Label ink flips with the fill and holds 4.5:1.
- The browser proof fails when one agent's model and tool steps differ by less than 0.18 OKLab L, or when the tool step is the stronger one.

## 0.21.19

- In-bar step labels show each part (icon, tool name, count chip, duration, cost) whole or not at all: a part that does not fit wraps out of the one-line label box, so a label never reads "b…" and never paints past its step (blind round 28). The label sits 6px in from both ends.
- Label ink holds 4.5:1 on its fill: light text on the darker model step and a near-black of the agent's hue on the lighter tool step in light theme. The browser proof measures every shown label's contrast and fails under 4.5:1.

## 0.21.18

- Agent view: every step labels itself inside its bar, as trace viewers do: its tool's icon and name, a count chip when merged steps share a tool (`bash` ×9), then its duration and cost. A narrowing step drops its cost, then its duration, then its name and chip, then its icon. A failed model turn keeps the model icon and no tool name. `FlowSegment.costUsd` carries the merged steps' cost.
- Fail and retry marks inside a bar are filled red and amber chips. A folded family shows a `+N` chip beside its name. Spawn elbows rest at 80% strength with a wider curve.
- The model and the outcome that at least half the agents share are said once, by the header ("mostly glm-5.3" when not all) and the outcome key; a row names its own only when it differs.
- Light theme: solid step segments sit one step softer. With per-agent hues the slowest agent keeps its own hue and carries the amber Slowest pill instead of an amber-brown bar.

## 0.21.17

- `@tangle-network/charts/react` exports `flowWaterfallRows`, `criticalPathIds` and the `FlowWaterfallRow` type, so a host that summarizes a trace beside FlowWaterfall (slowest step, costliest subtree, the critical path) reads the same rows and roll-ups the chart draws instead of keeping a second tree.

## 0.21.16

- The trace paints Brand roles only: text, card, hairline (`--hsl-border`), in-card well, chart grid and rule, the status inks, and Brand's categorical tones for agent hues (blue, teal, pink, violet, lime; the root is the chart's muted grey). Its own hex palettes and their fallbacks are gone, and radii and shadows are Brand's. A host loads Brand's `tokens.css` or `legacy-light.css`; agent-app and Discovery already do.
- The hover card is a table of what the row recorded, each value with its unit: model, duration, tokens in, out and cached, LLM latency (median, and p95 from ten calls), cost, LLM calls, tool calls by tool, failed steps, and retries and restarts. It shows every host fact, not the first three, and skips one the table already states. `FlowSpan.cachedTokens` is new; `otlpFlowTrace` fills it from the GenAI cache-read attributes.
- The card opens at the pointer instead of the mark's start, and on the side of its row that fits the viewport; a tall card no longer runs off the top of the page.
- Phone (below 900 px): each agent is a name strip over its bar. The duration and badges sit at the strip's right end, never on the bar or across a connector, and the strip hides the gridlines, pause bands and elbows behind it. Below 480 px the strip holds only the name and duration.
- A selection recedes its peers' bars only. Their names keep the muted ink at full opacity; fading whole cells dropped them to 2.2:1 and let pause bands and connectors show through the text.
- A pause is a faint band behind the rows and a hatched strip on the axis that names its length and reason on hover and focus. The length chips covered the hour ticks.
- An agent's second line says "LLM calls", as the summary strip and card do, so a host's own "Turns" fact no longer contradicts it, and its parts drop whole when the line is full ("48 …" no longer shows). Failed calls count as calls of their kind.
- A row's hover and selected tint is one variable, so its end label and stacked name paint the same plane instead of a white chip on the selected band.
- "Thinking thinking · 50ms" reads "Thinking · 50ms".

## 0.21.15

- Per-agent hues are saturated inside the bar: model and tool steps are a darker and a lighter step of the agent's full hue, at least 3:1 against the card; waiting stays the only pale fill (blind round 26: muted bars blurred together).
- A failed turn keeps its agent's saturated hue with a thin red edge, instead of a pale fill that made a mostly-failed run read washed out.
- A family's "N failed" counts members whose recorded outcome failed (status only when there is no outcome), so it agrees with the outcome legend.
- An agent without an outcome no longer reads a bare "done"; its second line shows only its turns and tool calls.
- A subtitle no longer vanishes when the host's mark leads it: only the text and tool count wrap, so the text always keeps its line.
- The browser proof checks that the agent-view card floats beside its row; it still asserted the docked card 0.21.12 removed.
- A merged run of tool steps that share one tool names itself in the bar ("bash ×9"); a single step shows its full name with an ellipsis. Before, only single steps were named, so every wide segment on a real run, a merged one, showed nothing.

## 0.21.14

- While searching, rows that matched by themselves are marked `data-search="match"` and their names are bold. Ancestors shown only for context are marked `"context"` and recede.
- When the host changes `selectedId`, for example by stepping through search matches, the row scrolls into view without taking focus.
- `criticalPath` builds each child list in place instead of copying it for every child, so a span with thousands of children no longer costs quadratic time.

## 0.21.13

- `FlowWaterfall` can leave its search text, folded spans and time window to the host: `query`/`onQueryChange`, `collapsed`/`onCollapsedChange` and `zoom`/`onZoomChange`. A page can now keep that view in its URL so a link reopens it. Without these props nothing changes.
- `criticalPath` marks the chain of steps that decides when the trace ends: from each root, follow the latest-ending child down to a leaf, and take the root whose chain ends last. Each step on it gets `data-critical`, an accent edge under its bar and "critical path" in its accessible label.
- `matchSpan` replaces the built-in search match, such as so a host can search span attributes.
- `FlowWaterfallWindow` is exported for typing `zoom`.

## 0.21.11

- `agentFill` defaults to `agent`: each agent or family keeps its own muted hue across dot, bar and handoffs, with model and tool steps as darker and lighter shades of it. The outcome stays on the row dot, amber marks the slowest agent and red stays for failure (blind round 25: two global step hues made agents blur together). `muted` and `outcome` keep the global step colors.
- The agent palette drops its orange for a green, so amber means only the slowest.
- A tool step's in-bar name ends with an ellipsis rather than clipping mid-letter.
- With per-agent hues the key shows step kind as shade (darker model call, lighter tool call), matching the bars.

## 0.21.10

- Agent view: a step's kind owns its color inside the bar (model indigo, tool cyan, strong in light and dark); the agent's outcome stays on its lane tint, dot and end label (blind round 24: green and grey bars looked alike).
- The bar-type key joins the outcome legend in the header row, so one band leads the chart instead of three.
- Family rows are named by their role; the count is in their second line ("6 agents · 5 failed").
- Event lines across the rows are faint; their dots and labels stay on the axis.
- Row subtitles are 13 px.
- A segment's tooltip names its step (with "+N more" when merged); a single tool step names itself inside the bar when it is wide enough.
- The Waiting key swatch is the flat fill the bars use.

## 0.21.9

- The agents-view scrubber is a thin neutral track with its round handle; played to the end it no longer paints a full-width blue bar (blind round 23).
- An agent's waiting time is a flat faint fill under its step segments, not long hatching.
- Every agent row keeps the chevron gutter, so names line up whether or not a row opens.
- A subtitle that does not fit drops its tool count whole instead of cutting it ("12 turns · 7 to…").

## 0.21.8

- A pause's length label sits on the time axis over its band, not over the first row, where it covered the root's end label.

## 0.21.7

- Agent lanes are a tint of their color; model and tool segments and the status dot keep full saturation (blind round 22: full-length saturated slabs).
- With outcome fill, a family row takes its members' shared outcome and is neutral when they differ, never a hue of its own.
- Pause labels thin out where they would overlap; a hidden one's length and reason stay on its band's tooltip.
- Tabular figures apply to numeric cells only, so names keep proportional hyphens ("v6-battery", not "v6 - battery").

## 0.21.6

- `agentFill` defaults to `outcome` when agents carry outcomes, so bars match the outcome legend; `muted` only when none do.
- Slowest and Costliest rank agents only, never a family row (its bar is its members' extent, its cost their sum) or an opened step.
- Agent rows drop the alert glyph: the second line says the agent failed and its bar marks the failed turn.
- A pause band's label is its length alone and may run past a narrow band; the reason is its tooltip.
- The agents view names events on the axis only; labels over the rows collided with end labels.
- Families open only when every agent fits in 12 rows.
- The playhead shows as a round knob on a filled track; the cursor line draws only while scrubbing or playing, not while following live, where it crossed running bars' labels.

## 0.21.5

- `agentFill` gains `muted`, now the default: every agent bar in one quiet tone, the slowest agent in amber, failure in red and the outcome on the row dot, so color only means state (blind A/B against reference trace UIs, 10-26). `agent` keeps a hue per agent.
- Agent view: families (`role ×N`) start open when every agent fits the 20-row body, so a run lists each agent and its steps; bigger runs still fold them, and a click flips either way.
- End labels never run past the lane: a duration, cost and Slowest/Costliest badge that would be cut at the right edge slides back over its bar's tail. Labels sit on the surface, so connectors and event lines stop at them instead of striking through the cost.
- Event lines draw behind the rows, with the gridlines; their labels stay on top.
- A pause band's label leads with its length ("45.0 min Paused: …"), so a narrow band keeps the number when the reason is cut. Hosts can drop the duration from `FlowPause.label`.

## 0.21.4

- Agent view: a host's `renderIcon` mark leads the row's second line instead of taking a third line that overflowed the 40 px row into the next agent's name.

## 0.21.3

- A live trace's body fits its rows and grows as rows arrive instead of holding the full height, so a short live run leaves no empty band under its last row. It still never shrinks while live.

## 0.21.2

- Agent view: the Slowest badge ranks only agents with a parent; the root spans the whole run by construction and always won (hard-code audit D16).

## 0.21.1

- `FlowPause.detail`: the full reason shows on hover and focus of the band's label, so the band prints only a few words.
- Clicking the event you jumped to lets go of it, and clicking a pinned mark again closes its card, so no re-click is a no-op.
- `FlowSpan.costBound`: a span's cost can be a floor; spans inherit a trace's `costBound: 'lower'`, so per-agent and family costs from the same rule as the run print "≥" in end labels and cards.

## 0.21.0

- `Gap` (react): one reading against its target band, and an optional stretch band, on a log or linear scale. A measured value is a dot; a bound is an open arrow pointing where the true value lies. A dashed span runs to the nearest target edge, and every mark has a tooltip. For a metric's distance from its paper number, as in a bar strip.

## 0.20.3

- The card of a member of a folded family takes the family's hue, so its dot matches the lane.
- Connectors draw under the rows, so end labels and Slowest/Costliest badges sit above them.

## 0.20.2

- Agent rows count their turns and tool calls from the spans, not the merged display marks, so the counts no longer change with zoom; a trace without `toolCalls` keeps the dash during playback (both from Codex review on #30).
- Agent view: three or more consecutive steps of one kind and name fold into one row ("15 model calls"), each step a mark in its bar. Tool steps carry a generic identity glyph by name (terminal, file, pencil, lens, globe, branch). The playhead stays in sight at rest. End labels sit above connectors. The card's dot takes the lane's drawn hue. The Cost tile is left out when no cost source exists. Light bars carry the full hue (tool steps 62%).
- Event track: the event a reader jumps to keeps its label up on the axis and its dot reads pressed, so the jump says where it went.
- `FlowTrace.costBound: 'lower' | 'upper'` marks `costUsd` as a floor ("≥") or a ceiling ("≤"); it replaces 0.20.1's `costUpperBound` flag, which `otlpFlowTrace` now writes as `costBound: 'upper'`.
- `FlowTrace.toolCalls` is optional: absent shows a dash with its reason, never "0". `summary={false}` drops the stat strip for a page with its own stat row.
- Agent view: one faint curved elbow per spawn at rest, in the agent's hue, at full strength for the agent under the pointer, pinned or focused.
- Agent view: the kind key sits directly above the lanes.
- Agent view: agents sharing a role (a name that differs only by a trailing counter) fold into one family row, `memscale-engineer ×6`, whose bar carries every member's work in its member's hue; its chevron or a click opens the members beneath it.
- Agent view: every agent row has a second line saying how it ended and how much it did (`failed · 3 turns · 412 tool calls`; a family: `6 agents · 4 failed`), after the model when agents differ.
- Agent view: the turn that ended a failed agent carries the failure glyph inside the bar, and retries keep theirs.
- Agent view: an agent's chevron opens its own steps (turns and tool calls) nested beneath it, with their icons, end labels and a summary line, instead of switching to the steps view.
- Agent view: every top-level row takes the next hue slot, so no two families share a hue; dark fills carry 94% of the hue; spawn elbows rest at 60%.
- Agent view: a family row keeps one hue, its members alternating shades of it, and its end label shows the family's duration and cost (a floor, "≥", when some members recorded none).
- Agent view: the card docks under the lanes instead of covering the plot; the scrubber track shows its progress.
- Cards: a zero-length step gets no step line.
- Agent view: when every agent runs the same model, the headline names it once and the rows leave it out.
- Agent view: a failed turn draws like any turn and the warning by the name is muted; the agent's failure shows once, by its name and its end label.
- Live: the body keeps its full height as agents arrive, so the page below does not shift.
- Light theme: bars carry 88% of the agent hue (tool steps 46%).
- `live.css`: meter key values use weight 600, so live charts keep to the 400/600 pair.
- Demo harness: live replay sums run totals from the calls finished so far; the motion recording is captured in its own folder.

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
