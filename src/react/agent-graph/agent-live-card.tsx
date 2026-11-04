import { AgentMark } from "./marks";
import type { Node, NodeProps } from "@xyflow/react";
import { BookOpen, Brain, FlaskConical, Hammer, Hourglass, type LucideIcon, MessageSquare, PenLine, Repeat, RotateCcw, ScanSearch, TestTubes, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { useRef } from "react";
import type { AgentGraphActivity, AgentGraphDirection, AgentGraphEvent, AgentGraphNode } from "./agent-graph-layout";
import { agentStatus, agentDescription, failureReason, Handles, knownCost, StatusGlyph, cardBorder } from "./agent-graph-parts";
import { SELECTION_OUTLINE } from "./canvas-theme";
import { fmtEventTime } from "./format";
import { shortModel, toolLabel } from "./naming";
import { RESTING_SHADOW } from "./graph-style";
import { agentQuietActivity, useAttention } from "./run-ui-state";
import { useRunNow } from "@tangle-network/ui/hooks/use-live-time";

export type LiveAgentCardNode = Node<
  { agent: AgentGraphNode; selected: boolean; direction: AgentGraphDirection; now?: number; onOpen?: () => void; parentLabel?: string; renderEventIcon?: (event: AgentGraphEvent) => ReactNode }, "liveAgent"
>;

/** Each activity's icon and label; looping alone takes the serious status colour. */
export const AGENT_ACTIVITIES: Readonly<Record<AgentGraphActivity, { label: string; icon: LucideIcon }>> = {
  thinking: { label: "Thinking", icon: Brain }, reading: { label: "Reading", icon: BookOpen }, building: { label: "Building", icon: Hammer }, proving: { label: "Proving", icon: FlaskConical }, writing: { label: "Writing", icon: PenLine }, waiting: { label: "Waiting", icon: Hourglass },
  restarting: { label: "Restarting", icon: RotateCcw }, testing: { label: "Testing", icon: TestTubes }, messaging: { label: "Messaging", icon: MessageSquare }, reviewing: { label: "Reviewing", icon: ScanSearch }, looping: { label: "Looping", icon: Repeat },
};
/** The activity chip: the producer's classification with its icon; an uncalibrated classifier reads in the neutral step with the badge. */
function ActivityChip({ agent }: { agent: AgentGraphNode }) {
  const meta = agent.activity && AGENT_ACTIVITIES[agent.activity], uncalibrated = agent.activityCalibrated === false;
  return meta ? <span className="ag-live-activity" data-calibrated={uncalibrated ? "false" : undefined} data-serious={!uncalibrated && agent.activity === "looping" ? "" : undefined} title={`${meta.label}${uncalibrated ? " · uncalibrated classifier" : ""}`}><meta.icon size={12} strokeWidth={1.75} aria-hidden />{meta.label}{uncalibrated && <small className="ag-live-badge">uncalibrated</small>}</span> : null;
}

/** One shell survives settling. A settled or failed agent compacts to its glyph, full name and what it returned or why it failed;
 *  a running one adds what it is doing and its last events. Nothing unrecorded is printed (round s-tier: "—", "$0.00", "Done" twice). */
export function LiveAgentCardView({ agent, selected, direction = "TB", now: fixed, handles = false, onOpen, parentLabel, renderEventIcon }: {
  agent: AgentGraphNode; selected: boolean; direction?: AgentGraphDirection; now?: number; handles?: boolean; onOpen?: () => void; parentLabel?: string; renderEventIcon?: (event: AgentGraphEvent) => ReactNode;
}) {
  const now = useRunNow(fixed);
  const ref = useRef<HTMLDivElement>(null);
  useAttention(ref, agent.status);
  const failed = agent.status === "failed";
  const settled = failed || agent.status === "done" || agent.status === "stopped";
  const quiet = agentQuietActivity(agent, now);
  const s = agentStatus(agent.status);
  const meta = [agent.model ? shortModel(agent.model) : undefined, agent.effort].filter(Boolean).join(" · ");
  const events = (agent.events ?? []).slice(-1);
  const cost = knownCost(agent.costUsd);
  const metrics = [cost, agent.startedAt != null ? `${fmtEventTime(agent.startedAt, now, false)} elapsed` : undefined, Number.isFinite(agent.commits) ? `${agent.commits} ${agent.commits === 1 ? "commit" : "commits"}` : undefined].filter(Boolean).join(" · ");
  const said = failed ? failureReason(agent) : settled ? agent.result ?? undefined : agent.turn ?? undefined;
  return (
    <div className="ag-live-slot">
      {handles && <Handles direction={direction} />}
      <div ref={ref} className={`ag-live-card${settled ? " ag-live-chip" : ""}`} data-status={agent.status}
        data-sparse={events.length === 0 || undefined} data-activity={quiet ? "quiet" : agent.activity ?? undefined} data-selected={selected || undefined}
        title={agentDescription(agent)}
        style={{ boxShadow: RESTING_SHADOW, ...cardBorder(agent.status), ...(selected ? SELECTION_OUTLINE : {}), ["--ag-status" as string]: s.color }}>
        <div className="ag-live-head">
          <span className="ag-live-mark grayscale hover:grayscale-0"><AgentMark agent={agent} layout="tree" size={18} /></span>
          <span className="ag-live-glyph" title={quiet?.label ?? s.label}><StatusGlyph status={agent.status} size={14} /></span>
          <span className="ag-live-name">{parentLabel && <span className="ag-parent-label">{parentLabel} / </span>}{agent.label}</span>
          {!settled && quiet && <span className="ag-live-quiet">{quiet.label}</span>}
        </div>
        {!settled && (meta || metrics) && <span className="ag-live-meta" title={[meta, metrics].filter(Boolean).join(" · ")}>{[meta, metrics].filter(Boolean).join(" · ")}</span>}
        {(said || cost || !settled) && <div className="ag-live-thinking-row">
          {said && <p className={`ag-live-thinking${failed ? " ag-live-failure" : ""}`} title={said}>{toolLabel(said)}</p>}
          {settled && cost && <span className="ag-live-chip-cost" title="Cost">{cost}</span>}
          {!settled && <ActivityChip agent={agent} />}
          {agent.status === "needs-you" && <button type="button" className="ag-live-respond nodrag nopan" disabled={!onOpen} title={onOpen ? undefined : "Responses unavailable in this view"} onClick={event => { event.stopPropagation(); onOpen?.(); }}>Respond</button>}
        </div>}
        {!settled && events.length > 0 && <ol className="ag-live-events" aria-label="Latest events">
          {events.map(event => <li key={event.id} title={event.label}>
            {renderEventIcon?.(event) ?? <Wrench size={12} strokeWidth={1.75} aria-hidden />}
            <span className="ag-live-event-label">{toolLabel(event.label)}</span>
            <time className="ag-live-event-at" dateTime={Number.isFinite(event.at) ? new Date(event.at!).toISOString() : undefined}>{fmtEventTime(event.at, now)}</time>
          </li>)}
        </ol>}
      </div>
    </div>
  );
}
export function LiveAgentCard({ data }: NodeProps<LiveAgentCardNode>) {
  return <LiveAgentCardView {...data} handles />;
}
