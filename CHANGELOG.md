# @tangle-network/charts

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
