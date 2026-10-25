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
  promptTokens?: number
  completionTokens?: number
  /** Short producer summaries shown in the span card. */
  input?: string
  output?: string
  /** The failed span this one retries; the bar carries a retry glyph. */
  retryOf?: string
  /** For a handoff, the span that received the work; a connector joins the two rows. */
  handoffTo?: string
  meta?: Record<string, unknown>
}

/** A labelled instant on the trace clock, such as a release or an alert; drawn as a line across the rows. */
export interface FlowMarker {
  /** Trace-relative milliseconds, on the same clock as span startMs. */
  at: number
  label: string
  tone?: 'neutral' | 'ok' | 'failed'
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
  toolCalls: number
  /** Authoritative LLM request count when supplied; absent means unknown. */
  modelCalls?: number
  errors?: number
}
