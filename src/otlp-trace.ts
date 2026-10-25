import type { FlowSpan, FlowTrace } from './flow-trace.js'

/** One span of the OTLP-JSONL contract written by `traces convert` (tangle-network/traces). */
export interface OtlpSpan {
  trace_id: string
  span_id: string
  parent_span_id?: string
  name: string
  kind: 'AGENT' | 'LLM' | 'TOOL' | 'CHAIN' | string
  start_time: string
  end_time: string
  status?: { code?: string; message?: string }
  attributes?: Record<string, unknown>
  resource?: { attributes?: Record<string, unknown> }
}

export interface OtlpTraceOptions {
  /** The stream is still being written: open agent spans run to the observation time. */
  live?: boolean
  /** Attributes that name an agent, in order. Spans that carry one and have no agent ancestor are grouped under it. */
  agentKeys?: string[]
  /** List price of one model call; undefined leaves it unknown. Build it from the price owner with `catalogPrice`. */
  price?: (model: string, inputTokens: number, outputTokens: number) => number | undefined
}

/** Price model calls from an OpenAI-compatible model catalog (`data[].pricing.prompt|completion`, USD per token), such as
 * the Router's `/v1/models`. Read the catalog at runtime; never copy its numbers. */
export function catalogPrice(catalog: { data?: Array<{ id?: string; pricing?: { prompt?: string | number; completion?: string | number } }> }) {
  const rates = new Map<string, { input: number; output: number }>()
  for (const model of catalog.data ?? []) {
    const input = Number(model.pricing?.prompt), output = Number(model.pricing?.completion)
    if (model.id && Number.isFinite(input) && Number.isFinite(output)) rates.set(model.id, { input, output })
  }
  return (model: string, inputTokens: number, outputTokens: number) => {
    const rate = rates.get(model) ?? rates.get(shortModel(model))
    return rate ? rate.input * inputTokens + rate.output * outputTokens : undefined
  }
}

/** The OpenTelemetry GenAI name first, then the agent identities current producers write. */
const AGENT_KEYS = ['gen_ai.agent.name', 'agent.name', 'cli_bridge.profile.name']
const MODEL_KEYS = ['gen_ai.response.model', 'gen_ai.request.model', 'llm.model_name']

/** Parse OTLP-JSONL text; blank and malformed lines are counted, never thrown. */
export function parseOtlpJsonl(text: string): { spans: OtlpSpan[]; malformed: number } {
  const spans: OtlpSpan[] = []
  let malformed = 0
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const span = JSON.parse(line) as OtlpSpan
      if (typeof span.span_id === 'string' && typeof span.start_time === 'string') spans.push(span)
      else malformed++
    } catch { malformed++ }
  }
  return { spans, malformed }
}

const str = (value: unknown) => typeof value === 'string' && value ? value : undefined
const num = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined
const pick = (attributes: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) { const value = str(attributes[key]); if (value) return value }
  return undefined
}
/** `opencode/zai-coding-plan/glm-5.3` reads as `glm-5.3`; the full id stays in the span card input. */
const shortModel = (model: string) => model.split('/').pop() ?? model

/**
 * Project OTLP spans onto the inspector's trace. Kinds map AGENT→agent row, LLM→model call, TOOL→tool call; a TOOL
 * marked `traces.agent.spawn` becomes a handoff to the agent it parents. CHAIN spans become rows only when they have
 * children; leaf CHAIN markers (prompts, message boundaries) are counted in `omitted`. Tokens are
 * `gen_ai.usage.input_tokens` + `output_tokens`; the contract carries no cost, so cost stays unknown.
 * A later span with the same span_id replaces an earlier one, so live deltas can be appended as they arrive.
 */
export function otlpFlowTrace(input: OtlpSpan[], options: OtlpTraceOptions = {}): FlowTrace & { omitted: number } {
  const agentKeys = options.agentKeys ?? AGENT_KEYS
  const byId = new Map<string, OtlpSpan>()
  for (const span of input) byId.set(span.span_id, span)
  const spans = [...byId.values()]
  const time = (iso: string) => Date.parse(iso)
  const origin = spans.reduce((min, span) => Math.min(min, time(span.start_time)), Infinity)
  const last = spans.reduce((max, span) => Math.max(max, time(span.end_time), time(span.start_time)), -Infinity)
  const parents = new Set(spans.flatMap(span => span.parent_span_id ? [span.parent_span_id] : []))
  const attrs = (span: OtlpSpan) => span.attributes ?? {}

  // Agent identity: an AGENT span, or a named agent the contract groups by attribute.
  const isAgent = (span: OtlpSpan) => span.kind === 'AGENT'
  const agentAncestor = (span: OtlpSpan): OtlpSpan | undefined => {
    const seen = new Set<string>()
    for (let cursor = span.parent_span_id ? byId.get(span.parent_span_id) : undefined; cursor && !seen.has(cursor.span_id); cursor = cursor.parent_span_id ? byId.get(cursor.parent_span_id) : undefined) {
      seen.add(cursor.span_id)
      if (isAgent(cursor)) return cursor
    }
    return undefined
  }
  // A grouped agent's outcome is its last turn's status: errors inside earlier turns stay marks within the lane.
  const grouped = new Map<string, { start: number; end: number; models: Map<string, number>; lastEnd: number; failed: boolean }>()
  const groupOf = new Map<string, string>()
  for (const span of spans) {
    if (isAgent(span) || (span.parent_span_id && byId.has(span.parent_span_id))) continue
    const name = pick(attrs(span), agentKeys)
    if (!name) continue
    groupOf.set(span.span_id, name)
    const group = grouped.get(name) ?? { start: Infinity, end: -Infinity, models: new Map(), lastEnd: -Infinity, failed: false }
    group.start = Math.min(group.start, time(span.start_time))
    group.end = Math.max(group.end, time(span.end_time))
    if (time(span.end_time) >= group.lastEnd) { group.lastEnd = time(span.end_time); group.failed = span.status?.code === 'STATUS_CODE_ERROR' }
    grouped.set(name, group)
  }

  // Each agent row is labelled by its identity and its most used model.
  const models = new Map<string, Map<string, number>>()
  const tally = (key: string, model: string) => {
    const counts = models.get(key) ?? new Map<string, number>()
    counts.set(model, (counts.get(model) ?? 0) + 1)
    models.set(key, counts)
  }
  const rootOf = (span: OtlpSpan) => {
    let cursor = span
    const seen = new Set<string>()
    while (cursor.parent_span_id && byId.has(cursor.parent_span_id) && !seen.has(cursor.span_id)) { seen.add(cursor.span_id); cursor = byId.get(cursor.parent_span_id)! }
    return cursor
  }
  for (const span of spans) {
    if (span.kind !== 'LLM') continue
    const model = pick(attrs(span), MODEL_KEYS)
    if (!model) continue
    const agent = agentAncestor(span)
    const group = agent ? undefined : groupOf.get(rootOf(span).span_id)
    if (agent) tally(agent.span_id, shortModel(model))
    else if (group) tally(`group:${group}`, shortModel(model))
  }
  const topModel = (key: string) => [...(models.get(key)?.entries() ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0]

  const out: FlowSpan[] = []
  let omitted = 0
  let promptTokens = 0
  let completionTokens = 0
  let toolCalls = 0
  let modelCalls = 0
  let errors = 0
  let cost = 0
  let unpriced = 0
  let priced = 0
  const offset = (iso: string) => time(iso) - origin
  // Grouped agents in separate traces join on the spawn that started them: each agent with no spawn of its own
  // takes the latest unclaimed spawn call in another agent that began before it.
  const isSpawn = (span: OtlpSpan) => span.kind === 'TOOL' && (attrs(span)['traces.agent.spawn'] === true || /spawn/i.test(str(attrs(span)['gen_ai.tool.name']) ?? span.name))
  const groupOfSpan = (span: OtlpSpan) => groupOf.get(rootOf(span).span_id)
  const spawns = spans.filter(span => isSpawn(span) && groupOfSpan(span)).sort((a, b) => time(a.start_time) - time(b.start_time))
  const claimed = new Set<string>()
  const spawnedBy = new Map<string, OtlpSpan>()
  for (const [name, group] of [...grouped].sort((a, b) => a[1].start - b[1].start)) {
    let pick: OtlpSpan | undefined
    for (const spawn of spawns) {
      if (time(spawn.start_time) > group.start) break
      if (!claimed.has(spawn.span_id) && groupOfSpan(spawn) !== name) pick = spawn
    }
    if (pick) { claimed.add(pick.span_id); spawnedBy.set(name, pick) }
  }
  const handoffTo = new Map([...spawnedBy].map(([name, spawn]) => [spawn.span_id, `group:${name}`]))
  for (const [name, group] of grouped) {
    const spawn = spawnedBy.get(name)
    out.push({ id: `group:${name}`, kind: 'pipeline', name, detail: topModel(`group:${name}`), startMs: group.start - origin, endMs: group.end - origin,
      ...(spawn ? { parentId: `group:${groupOfSpan(spawn)}` } : {}),
      status: options.live ? 'running' : group.failed ? 'failed' : 'done' })
  }
  // Subagents are numbered in the order they started.
  const subagentNumber = new Map(spans.filter(span => isAgent(span) && span.parent_span_id && byId.has(span.parent_span_id) && !pick(attrs(span), agentKeys))
    .sort((a, b) => time(a.start_time) - time(b.start_time)).map((span, i) => [span.span_id, i + 1]))
  const spawnTarget = new Map<string, string>()
  for (const span of spans) if (isAgent(span) && span.parent_span_id) spawnTarget.set(span.parent_span_id, span.span_id)

  for (const span of spans) {
    const a = attrs(span)
    if (span.kind === 'CHAIN' && !parents.has(span.span_id)) { omitted++; continue }
    const failed = span.status?.code === 'STATUS_CODE_ERROR'
    const startMs = offset(span.start_time)
    let endMs = Math.max(startMs, offset(span.end_time))
    const open = options.live === true && isAgent(span) && span.status?.code !== 'STATUS_CODE_OK' && !failed
    if (open) endMs = Math.max(endMs, last - origin)
    const parentId = span.parent_span_id && byId.has(span.parent_span_id) ? span.parent_span_id : groupOf.has(span.span_id) ? `group:${groupOf.get(span.span_id)}` : undefined
    const model = pick(a, MODEL_KEYS)
    const prompt = num(a['gen_ai.usage.input_tokens'])
    const completion = num(a['gen_ai.usage.output_tokens'])
    let kind: FlowSpan['kind'] = span.kind === 'LLM' ? 'model' : span.kind === 'TOOL' ? 'tool' : 'pipeline'
    if (kind === 'tool' && (a['traces.agent.spawn'] === true || spawnTarget.has(span.span_id) || handoffTo.has(span.span_id))) kind = 'handoff'
    let name = str(a['gen_ai.tool.name']) ?? span.name
    if (isAgent(span)) {
      name = pick(a, agentKeys) ?? (subagentNumber.has(span.span_id) ? `Subagent ${subagentNumber.get(span.span_id)}` : str(a['service.name']) ?? str(span.resource?.attributes?.['service.name']) ?? span.name)
    } else if (kind === 'model' && (span.name === 'llm.call' || span.name.startsWith('chat '))) name = 'Model call'
    if (kind === 'model') modelCalls++
    if (kind === 'tool' || kind === 'handoff') toolCalls++
    if (failed) errors++
    promptTokens += prompt ?? 0
    completionTokens += completion ?? 0
    const listPrice = kind === 'model' && model && options.price && (prompt !== undefined || completion !== undefined)
      ? options.price(model, prompt ?? 0, completion ?? 0) : undefined
    if (listPrice !== undefined) { cost += listPrice; priced++ }
    else if (kind === 'model' && (prompt || completion)) unpriced++
    out.push({
      id: span.span_id, ...(parentId ? { parentId } : {}), kind, name, startMs, endMs,
      status: open ? 'running' : failed ? 'failed' : 'done',
      ...(endMs === startMs && kind !== 'pipeline' ? { approx: true } : {}),
      ...(isAgent(span) ? { detail: topModel(span.span_id) } : kind === 'model' && model ? { detail: shortModel(model) } : {}),
      ...(listPrice !== undefined ? { costUsd: listPrice } : {}),
      ...(prompt !== undefined ? { promptTokens: prompt } : {}),
      ...(completion !== undefined ? { completionTokens: completion } : {}),
      ...(span.status?.message ? { output: span.status.message } : {}),
      ...(spawnTarget.has(span.span_id) ? { handoffTo: spawnTarget.get(span.span_id) } : handoffTo.has(span.span_id) ? { handoffTo: handoffTo.get(span.span_id) } : {}),
    })
  }
  return {
    spans: out, totalMs: Number.isFinite(last - origin) ? last - origin : 0, promptTokens, completionTokens,
    toolCalls, modelCalls, errors, omitted,
    // A partly priced run still has a known floor: report it with its coverage rather than nothing.
    ...(options.price && priced > 0
      ? { costUsd: cost, costBasis: 'list' as const, costCoverage: { priced, total: priced + unpriced } } : {}),
  }
}
