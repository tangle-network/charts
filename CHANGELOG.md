# @tangle-network/charts

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
