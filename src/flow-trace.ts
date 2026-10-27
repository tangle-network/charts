/** Producer-owned identities, explicit status and observed totals; no React dependency. */
export interface FlowSpan {
  kind: 'pipeline' | 'model' | 'tool' | 'waiting' | 'handoff'
  /** Stable identity and parent identity for nested, incrementally updated traces. */
  id?: string
  parentId?: string
  /** Running spans extend from endMs to the viewer's observation time. */
  status?: 'running' | 'done' | 'failed'
  name: string
  startMs: number
  endMs: number
  approx?: boolean
  /** Muted text after the name: the agent's model or the tool's provider. */
  detail?: string
  /** Host icon key, passed to `renderIcon`; the inspector draws a kind glyph without one. */
  icon?: string
  /** Recorded values only. Absent means unknown and is shown as Unknown, never as zero. */
  costUsd?: number
  /** `lower`: `costUsd` is a floor and prints "≥". Spans inherit a trace's `costBound: 'lower'`. */
  costBound?: 'lower' | 'upper'
  promptTokens?: number
  completionTokens?: number
  /** Input tokens the provider served from its cache, as the producer recorded them. A span without its own token fields shows
   * the sum of its descendants' in the card. */
  cachedTokens?: number
  /** Short producer summaries shown in the span card. */
  input?: string
  output?: string
  /** The failed span this one retries; the bar carries a retry glyph. */
  retryOf?: string
  /** For a handoff, the span that received the work; a connector joins the two rows. */
  handoffTo?: string
  /** The host's verdict on an agent span, such as shipped or crashed: colors its lane and joins the legend. */
  outcome?: FlowOutcome
  /** Host facts shown as extra rows of the card's table, such as releases or commits; a label the table already has is skipped. */
  facts?: readonly { label: string; value: string }[]
  /** Moments on this span's own bar, such as a restart: a notch at `at`, the state stays the span's. */
  marks?: readonly FlowSpanMark[]
  meta?: Record<string, unknown>
}

/** A moment on one bar. A restart is a mark, never the final state: the span's status and outcome stay authoritative. */
export interface FlowSpanMark {
  /** Trace-relative milliseconds, on the same clock as span startMs. */
  at: number
  label: string
  kind?: 'restart' | (string & {})
}

/** An interval when the whole run stood still, such as a host guard pause: a labelled band across every row, never blank space. */
export interface FlowPause {
  startMs: number
  endMs: number
  /** A few words on the band, such as 'Paused 4 h 40 m'. */
  label: string
  /** The full reason, shown on hover and focus of the label rather than printed across the rows. */
  detail?: string
}

/** A host verdict: `label` is the legend text, `tone` the status color. */
export interface FlowOutcome {
  /** `live` is a running agent: the one running hue the host uses for every live mark. */
  tone: 'ok' | 'live' | 'neutral' | 'failed' | 'warn'
  label: string
  /** A hollow ring in the tone instead of a filled dot: a second outcome on the same tone (Done beside Shipped, Stopped beside a plain end). */
  ring?: boolean
}

/** A labelled instant on the trace clock, such as a release or an alert; drawn as a line across the rows. */
export interface FlowMarker {
  /** Trace-relative milliseconds, on the same clock as span startMs. */
  at: number
  label: string
  tone?: 'neutral' | 'ok' | 'failed' | 'warn'
  /** What happened, such as release, verdict, spawn or crash; shown with the label on the event track. */
  kind?: string
  /** Where the event lives, for hosts that open it. */
  href?: string
}

/** Describe the structure of a flow trace including spans, timing, tokens, cost, and tool calls */
export interface FlowTrace {
  spans: FlowSpan[]
  totalMs: number
  promptTokens: number
  completionTokens: number
  /** Computed when per-token pricing is supplied. */
  costUsd?: number
  /** `list`: priced from a model catalog's list prices, not a bill; the summary says so. */
  costBasis?: 'billed' | 'list'
  /** `costUsd` is a bound, not a count: `lower` prints "≥" (a floor, such as the larger of usage and meter per agent),
   * `upper` prints "≤" (list price on inputs that include cached tokens priced as fresh). */
  costBound?: 'lower' | 'upper'
  /** How many model calls `costUsd` covers; when `priced < total` the total is a lower bound and shown as one. */
  costCoverage?: { priced: number; total: number }
  /** The real charge when the producer knows it (for example $0 on a subscription seat), shown beside a list price. */
  billedUsd?: number
  /** Tool calls the producer counted; absent means unknown and is shown as a dash, never as zero. */
  toolCalls?: number
  /** Authoritative LLM request count when supplied; absent means unknown. */
  modelCalls?: number
  errors?: number
  /** Intervals when nothing ran, drawn as labelled bands. */
  pauses?: readonly FlowPause[]
}
