import { AgentMark } from "./marks";
import type { Node, NodeProps } from "@xyflow/react";
import { Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { useRef } from "react";
import type { AgentGraphDirection, AgentGraphEvent, AgentGraphNode, AgentGraphStatus } from "./agent-graph-layout";
import { agentStatus, agentDescription, Handles, StatusGlyph, cardBorder } from "./agent-graph-parts";
import { SELECTION_OUTLINE } from "./canvas-theme";
import { fmtCost, fmtEventTime } from "./format";
import { shortModel } from "./naming";
import { RESTING_SHADOW } from "./graph-style";
import { agentQuietActivity, useAttention } from "./run-ui-state";
import { useRunNow } from "@tangle-network/ui/hooks";

export type LiveAgentCardNode = Node<
  { agent: AgentGraphNode; selected: boolean; direction: AgentGraphDirection; now?: number; onOpen?: () => void; parentLabel?: string; renderEventIcon?: (event: AgentGraphEvent) => ReactNode }, "liveAgent"
>;
const SETTLED: ReadonlySet<AgentGraphStatus> = new Set(["done", "stopped"]);

function middleLabel(label: string) {
  return label.length <= 52 ? label : `${label.slice(0, 32)} … ${label.slice(-17)}`;
}

/** One shell survives settling. A failure retains its evidence and absolute event times. */
export function LiveAgentCardView({ agent, selected, direction = "TB", now: fixed, handles = false, onOpen, parentLabel, renderEventIcon }: {
  agent: AgentGraphNode; selected: boolean; direction?: AgentGraphDirection; now?: number; handles?: boolean; onOpen?: () => void; parentLabel?: string; renderEventIcon?: (event: AgentGraphEvent) => ReactNode;
}) {
  const now = useRunNow(fixed);
  const ref = useRef<HTMLDivElement>(null);
  useAttention(ref, agent.status);
  const settled = SETTLED.has(agent.status);
  const failed = agent.status === "failed";
  const quiet = agentQuietActivity(agent, now);
  const s = agentStatus(agent.status);
  const meta = [agent.model ? shortModel(agent.model) : undefined, agent.effort].filter(Boolean).join(" · ");
  const events = (agent.events ?? []).slice(-3);
  const cost = Number.isFinite(agent.costUsd) ? fmtCost(agent.costUsd!) : undefined;
  const metrics = [cost, !failed && agent.startedAt != null ? `${fmtEventTime(agent.startedAt, now, false)} elapsed` : undefined, Number.isFinite(agent.commits) ? `${agent.commits} ${agent.commits === 1 ? "commit" : "commits"}` : undefined].filter(Boolean).join(" · ") || "—";
  return (
    <div className="ag-live-slot">
      {handles && <Handles direction={direction} />}
      <div ref={ref} className={`ag-live-card${settled ? " ag-live-chip" : ""}`} data-status={agent.status}
        data-sparse={events.length === 0 || undefined} data-activity={quiet ? "quiet" : agent.activity ?? undefined} data-selected={selected || undefined}
        title={agentDescription(agent)}
        style={{ boxShadow: RESTING_SHADOW, ...cardBorder(agent.status), ...(selected ? SELECTION_OUTLINE : {}), ["--ag-status" as string]: s.color }}>
        {settled && <><StatusGlyph status={agent.status} size={16} /><span className="ag-live-chip-status">{s.label}</span></>}
        <div className="ag-live-head">
          <span className="grayscale hover:grayscale-0"><AgentMark agent={agent} layout="tree" size={18} /></span>
          <div className="ag-live-names">
            <span className="ag-live-name">{parentLabel && <span className="ag-parent-label">{parentLabel} / </span>}{agent.label}</span>
            {!settled && meta && <span className="ag-live-meta">{meta}</span>}
          </div>
          <div className="ag-live-stats">
            {failed && onOpen ? <button type="button" className="ag-live-pill ag-live-inspect nodrag nopan" onClick={event => { event.stopPropagation(); onOpen(); }}><StatusGlyph status={agent.status} size={16} />{s.label}<span>Inspect</span></button> : <span className={`ag-live-pill${quiet ? " ag-live-quiet" : ""}`}><StatusGlyph status={agent.status} size={16} />{quiet?.label ?? s.label}</span>}
            {!settled && <span className="ag-live-accounting" title={metrics}>{metrics}</span>}
          </div>
        </div>
        {settled ? <><span className="ag-live-chip-result">{agent.result ?? agent.turn ?? s.label}</span>{cost && <span className="ag-live-chip-cost" title="Cost">{cost}</span>}</> : <>
          <div className="ag-live-thinking-row"><p className={`ag-live-thinking${failed ? " ag-live-failure" : ""}`}>
            {failed ? agent.result ?? events.at(-1)?.label ?? agent.turn ?? s.label : agent.turn || "—"}
          </p>
          {agent.status === "needs-you" && <button type="button" className="ag-live-respond nodrag nopan" disabled={!onOpen} title={onOpen ? undefined : "Responses unavailable in this view"} onClick={event => { event.stopPropagation(); onOpen?.(); }}>Respond</button>}</div>
          {events.length > 0 && <div className="ag-live-events-clip"><ol className="ag-live-events" aria-label="Latest events">
            {events.map(event => <li key={event.id} title={event.label}>
              {renderEventIcon?.(event) ?? <Wrench size={12} strokeWidth={1.75} aria-hidden />}
              <span className="ag-live-event-label">{middleLabel(event.label)}</span>
              <time className="ag-live-event-at" dateTime={Number.isFinite(event.at) ? new Date(event.at!).toISOString() : undefined}>{failed && event.at != null ? "at " : ""}{fmtEventTime(event.at, now, failed)}</time>
            </li>)}
          </ol></div>}
        </>}
      </div>
    </div>
  );
}
export function LiveAgentCard({ data }: NodeProps<LiveAgentCardNode>) {
  return <LiveAgentCardView {...data} handles />;
}
