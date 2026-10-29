import { AgentMark } from "./marks";
/**
 * What `AgentGraph` draws: an agent's card, the frame around a grid of leaf
 * workers, and the curved edge a message or delegation travels along.
 *
 * The visual vocabulary is the workflow graph's own (`node-ui.tsx`): the same
 * model brand mark, status colours, resting elevation and selection ring, so an
 * agent run and a workflow run read as one system.
 */

import {
  BaseEdge,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  Handle,
  type InternalNode,
  type Node,
  type NodeProps,
  Position,
  useInternalNode,
} from "@xyflow/react";
import { RunStatusIcon, statusMeta } from "@tangle-network/ui/run";
import { ChevronDown } from "lucide-react";
import { ambientStyle, syncAmbient, agentQuietActivity, useRunNow } from "./run-ui-state";
import { MOTION_CONTROL } from "./motion";
import type {
  AgentFrame,
  AgentGraphDirection,
  AgentGraphEdgeKind,
  AgentGraphNode,
  AgentGraphStatus,
} from "./agent-graph-layout";
import { shortModel } from "./naming";
import { SELECTION_OUTLINE } from "./canvas-theme";
import { fmtCost, fmtTokenTotal } from "./format";
import {
  RESTING_BORDER,
  RESTING_SHADOW,
} from "./graph-style";

/** Workflow state adaptation stays at its boundary; agent states use ui directly. */
export function agentStatus(status: AgentGraphStatus) {
  const meta = statusMeta(status);
  const flow = status === "needs-you" ? "waiting" : status === "waiting" || status === "idle" || status === "unknown" ? "queued" : status === "stopped" ? "succeeded" : status;
  return { ...meta, color: `var(${meta.token})`, flow };
}

export function StatusGlyph({ status, size }: { status: AgentGraphStatus; size: number }) {
  return status === "running"
    ? <span aria-hidden data-motion="essential" className="ag-running-dot" style={ambientStyle} onAnimationStart={syncAmbient} />
    : <RunStatusIcon status={status} size={size} aria-hidden />;
}

export function cardBorder(status: AgentGraphStatus) {
  if (status === "needs-you" || status === "failed") return { borderColor: agentStatus(status).color, borderWidth: status === "needs-you" ? 1.5 : 1 };
  return { borderColor: RESTING_BORDER };
}

/** The words a reader without the picture receives for one agent. */
export function agentDescription(agent: AgentGraphNode): string {
  const cost = fmtCost(agent.costUsd ?? undefined);
  const tokens = fmtTokenTotal(agent.tokens);
  return [
    agent.label,
    agent.role,
    agent.harness,
    agent.model,
    agentStatus(agent.status).label,
    agent.turn,
    agent.result,
    cost,
    tokens,
  ]
    .filter(Boolean)
    .join(", ");
}

export type AgentCardNode = Node<
  { agent: AgentGraphNode; selected: boolean; direction: AgentGraphDirection; now?: number; onOpen?: () => void; parentLabel?: string },
  "agent"
>;

/** Set on each card's React Flow wrapper — the element that takes keyboard
 *  focus — so the card inside can draw the focus ring. */
export const AGENT_NODE_CLASS = "group/agent !outline-none";

const HANDLE_CLASS = "!h-1 !w-1 !min-w-0 !border-0 !bg-transparent opacity-0";

export function Handles({ direction, source = true }: { direction: AgentGraphDirection; source?: boolean }) {
  return (
    <>
      <Handle
        type="target"
        position={direction === "LR" ? Position.Left : Position.Top}
        isConnectable={false}
        className={HANDLE_CLASS}
      />
      {source && (
        <Handle
          type="source"
          position={direction === "LR" ? Position.Right : Position.Bottom}
          isConnectable={false}
          className={HANDLE_CLASS}
        />
      )}
    </>
  );
}

export function AgentCardView({ agent, selected, direction, now: fixed, onOpen, parentLabel, handles = false }: AgentCardNode["data"] & { handles?: boolean }) {
  const now = useRunNow(fixed);
  const quiet = agentQuietActivity(agent, now);
  const s = agentStatus(agent.status);
  return <div data-status={agent.status} data-activity={quiet ? "quiet" : undefined} data-selected={selected || undefined}
    title={agentDescription(agent)} className={`ag-agent-card relative flex h-full w-full flex-col gap-0.5 rounded-[var(--radius-card)] border bg-card px-3 py-2 text-left ${MOTION_CONTROL}`}
    style={{ boxShadow: RESTING_SHADOW, ...cardBorder(agent.status), ...(selected ? SELECTION_OUTLINE : {}) }}>
    {handles && <Handles direction={direction} />}
    <div className="flex min-w-0 items-center gap-2">
      <AgentMark agent={agent} layout="tree" size={24} />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-[18px]">{parentLabel && <span className="ag-parent-label">{parentLabel} / </span>}{agent.label}</span>
      <span className="text-[13px] text-muted-foreground tabular-nums" title={agent.costUsd == null ? "Cost not reported" : "Cost"}>{fmtCost(agent.costUsd ?? undefined) ?? "—"}</span>
    </div>
    <p data-agent-identity="" className="m-0 truncate text-[13px] leading-[18px] text-muted-foreground" title={[agent.harness, agent.model].filter(Boolean).join(" · ")}>{[agent.harness, agent.model ? shortModel(agent.model) : null].filter(Boolean).join(" · ") || "Identity not recorded"}</p>
    {agent.status === "failed" && <p className="m-0 line-clamp-2 text-[13px] leading-4">{agent.result ?? agent.turn ?? "Failure cause not recorded"}</p>}
    <div className="mt-auto flex items-center justify-between gap-1 text-[13px]" style={{ color: quiet ? "var(--surface-warning-text)" : s.color }}>
      <span className="flex items-center gap-1"><StatusGlyph status={agent.status} size={16} />{quiet?.label ?? s.label}</span>
      <span data-agent-tokens="" className="text-muted-foreground tabular-nums whitespace-nowrap">{fmtTokenTotal(agent.tokens) ?? "Tokens not recorded"}</span>
      {agent.status === "needs-you" && <button type="button" className="ag-live-respond nodrag nopan" disabled={!onOpen} onClick={event => { event.stopPropagation(); onOpen?.(); }}>Respond</button>}
    </div>
  </div>;
}

export function AgentCard({ data }: NodeProps<AgentCardNode>) { return <AgentCardView {...data} handles />; }

export type AgentFrameNode = Node<
  { frame: AgentFrame; direction: AgentGraphDirection; label: string; groupParents: boolean; onToggle: () => void },
  "agentFrame"
>;

export function AgentFrameBox({ data }: NodeProps<AgentFrameNode>) {
  const { frame, direction } = data;
  return (
    <div
      className="ag-team-frame relative h-full w-full rounded-2xl border"
      style={{
        background: "color-mix(in srgb, hsl(var(--muted-foreground)) 7%, transparent)",
        borderColor: "hsl(var(--foreground) / 0.08)",
      }}
    >
      <Handles direction={direction} />
      <button type="button" className={`nodrag nopan absolute top-2 flex h-16 items-center justify-center gap-2 rounded text-sm text-muted-foreground hover:bg-muted focus-visible:outline ${data.groupParents ? "right-3 w-8 flex-col" : "left-3 right-3 justify-start"}`} aria-label={`${frame.collapsed ? "Expand" : "Collapse"} ${data.label} team`} aria-expanded={!frame.collapsed} title={`${data.label} · ${frame.group.memberIds.length} agents`} onClick={event => { event.stopPropagation(); data.onToggle(); }}><ChevronDown size={16} className={frame.collapsed ? "-rotate-90" : undefined} />{!data.groupParents && <strong>{data.label} team</strong>}<span>{frame.group.memberIds.length}</span></button>
    </div>
  );
}

export type AgentMessageEdge = Edge<
  { kind: Exclude<AgentGraphEdgeKind, "spawn">; count?: number; label?: string },
  "agentMessage"
>;

/** Resting message and delegation edges stay neutral. */
export const MESSAGE_EDGE_COLOR: Record<Exclude<AgentGraphEdgeKind, "spawn">, string> = {
  message: "color-mix(in srgb, hsl(var(--muted-foreground)) 70%, transparent)",
  delegation: "color-mix(in srgb, hsl(var(--muted-foreground)) 80%, transparent)",
};

type Box = { x: number; y: number; w: number; h: number };

function boxOf(node: InternalNode): Box {
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    w: node.measured.width ?? node.width ?? 0,
    h: node.measured.height ?? node.height ?? 0,
  };
}

/** Where the line from a box's centre toward `toward` leaves the box, `gap`px out. */
function exitPoint(b: Box, toward: { x: number; y: number }, gap: number) {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: cx, y: cy };
  const scale = Math.min(
    dx === 0 ? Number.POSITIVE_INFINITY : b.w / 2 / Math.abs(dx),
    dy === 0 ? Number.POSITIVE_INFINITY : b.h / 2 / Math.abs(dy),
  );
  return { x: cx + dx * scale + (dx / len) * gap, y: cy + dy * scale + (dy / len) * gap };
}

/**
 * A curve from one card's border to another's, bowed to the right of its
 * direction of travel: two agents messaging each other both ways draw two
 * separate arcs instead of one line over another, and a curve never hides
 * under the straight spawn edges of the tree.
 */
export function messageCurve(a: Box, b: Box) {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const dx = bc.x - ac.x;
  const dy = bc.y - ac.y;
  const len = Math.hypot(dx, dy) || 1;
  const bend = Math.min(90, Math.max(24, len * 0.22));
  const control = { x: (ac.x + bc.x) / 2 - (dy / len) * bend, y: (ac.y + bc.y) / 2 + (dx / len) * bend };
  const start = exitPoint(a, control, 2);
  const end = exitPoint(b, control, 4);
  return {
    path: `M${start.x},${start.y} Q${control.x},${control.y} ${end.x},${end.y}`,
    mid: {
      x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x,
      y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y,
    },
  };
}

export function AgentMessageEdgeView({ id, source, target, data, markerEnd }: EdgeProps<AgentMessageEdge>) {
  const from = useInternalNode(source);
  const to = useInternalNode(target);
  if (!from || !to || !data) return null;
  const { path, mid } = messageCurve(boxOf(from), boxOf(to));
  const color = MESSAGE_EDGE_COLOR[data.kind] ?? MESSAGE_EDGE_COLOR.message;
  const count = data.count ?? 1;
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={10}
        style={{ stroke: color, strokeWidth: 1.25, fill: "none" }}
      />
      {count > 1 && (
        <EdgeLabelRenderer>
          <div
            title={data.label ? `${data.label} ×${count}` : `${count} ${data.kind}s`}
            className="nodrag nopan pointer-events-auto absolute rounded-full border bg-card px-1.5 font-medium text-[10px] text-muted-foreground tabular-nums leading-4 shadow-sm"
            style={{
              transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)`,
              borderColor: color,
            }}
          >
            ×{count}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
