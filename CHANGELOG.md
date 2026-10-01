# @tangle-network/charts

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
