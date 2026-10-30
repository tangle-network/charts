import { AgentMark, ToolMark } from "./marks";
/** Hub nodes and call details share the run status vocabulary. */

import { Bot, User, Wrench, X } from "lucide-react";
import { runStatus, statusMeta, RunStatusIcon } from "@tangle-network/ui/run/status-meta";
import { type CSSProperties, type KeyboardEvent, type ReactNode, type Ref, useRef } from "react";
import type { AgentGraphNode, AgentGraphStatus } from "./agent-graph-layout";
import type { AgentGraphCall, AgentGraphCallKind, AgentGraphTool, HubNodeKind } from "./agent-hub-layout";
import { HoverCardContent } from "@tangle-network/ui/primitives/hover-card";
import { fmtCost } from "./format";
import { formatSpanDuration as fmtMs } from "../../format.js";
import { ambientStyle, syncAmbient, useAttention } from "./run-ui-state";

/** One colour per call kind, shared by edges, the legend and popover rows. */
export const CALL_COLOR: Record<AgentGraphCallKind, string> = {
  call: "var(--brand-primary)",
  answer: `var(${statusMeta("done").token})`,
  "needs-you": `var(${statusMeta("needs-you").token})`,
  failed: `var(${statusMeta("failed").token})`,
};
export const CALL_LABEL: Record<AgentGraphCallKind, string> = { call: "Call", answer: "Answer", "needs-you": statusMeta("needs-you").label, failed: statusMeta("failed").label };


export interface HubEntity {
  id: string;
  kind: HubNodeKind;
  label: string;
  sub?: string;
  status?: AgentGraphStatus;
  quiet?: string;
  agent?: AgentGraphNode;
  tool?: AgentGraphTool;
}

function NodeIcon({ entity, size }: { entity: HubEntity; size: number }) {
  if (entity.kind === "you") return <User size={size * 0.42} strokeWidth={2.2} aria-hidden />;
  if (entity.kind === "tool") {
    return <ToolMark tool={entity.tool} label={entity.label} size={size} />;
  }
  return <AgentMark agent={entity.agent} layout="hub" size={size} />;
}

/** Running has one quiet opacity signal; all other states use the shared glyph. */
function StatusBadge({ status, quiet }: { status?: AgentGraphStatus; quiet?: string }) {
  if (!status) return null;
  return <span className="ag-badge">{runStatus(status) === "running"
    ? <span className="ag-running-dot" data-motion="essential" aria-label="Running" style={quiet ? { animation: "none", background: "var(--ag-muted)" } : ambientStyle} onAnimationStart={syncAmbient} />
    : <RunStatusIcon status={status} />}</span>;
}

export interface HubNodeProps {
  entity: HubEntity;
  x: number;
  y: number;
  tile: number;
  dimmed: boolean;
  selected: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  onOpen: (element: HTMLButtonElement) => void;
  onHover: (on: boolean) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

export function HubNode({ entity, x, y, tile, dimmed, selected, buttonRef, onOpen, onHover, onKeyDown }: HubNodeProps) {
  const attentionRef = useRef<HTMLButtonElement>(null);
  useAttention(attentionRef, entity.status ?? "unknown");
  const attention = entity.status === "needs-you" || entity.status === "failed";
  const tone = attention ? `var(${statusMeta(entity.status!).token})` : undefined;
  const sub = entity.quiet ?? (entity.status === "needs-you" ? "Needs you · Respond" : entity.status === "waiting" ? entity.agent?.turn || "Waiting on peer" : entity.status === "failed" ? entity.agent?.result ?? entity.agent?.turn ?? "Failure cause not recorded" : entity.sub ? `${statusMeta(entity.status ?? "unknown").label} · ${entity.sub}` : entity.status ? statusMeta(entity.status).label : undefined);
  return (
    <button
      ref={(el) => { attentionRef.current = el; if (typeof buttonRef === "function") buttonRef(el); else if (buttonRef) buttonRef.current = el; }}
      type="button"
      data-agent-graph-node={entity.id}
      data-kind={entity.kind}
      data-status={entity.status}
      data-activity={entity.quiet ? "quiet" : undefined}
      aria-label={`${entity.label}${entity.sub ? `, ${entity.sub}` : ""}${entity.status ? `, ${entity.status === "needs-you" ? "needs you" : entity.status}` : ""}`}
      aria-expanded={selected}
      className={`ag-node ag-node-${entity.kind}${dimmed ? " ag-dimmed" : ""}${selected ? " ag-selected" : ""}`}
      style={{ left: x, top: y, "--ag-tile": `${tile}px`, ...(tone ? { "--ag-tone": tone } : {}) } as CSSProperties}
      onClick={event => onOpen(event.currentTarget)}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      onKeyDown={onKeyDown}
    >
      <span className="ag-tile">
        <NodeIcon entity={entity} size={tile} />
        <StatusBadge status={entity.status} quiet={entity.quiet} />
      </span>
      <span className="ag-name">{entity.label}</span>
      {sub && <span className="ag-sub" style={tone ? { color: tone } : undefined}>{entity.quiet ? <>{statusMeta(entity.status ?? "running").label} · <span style={{ color: "var(--surface-warning-text)" }}>{sub}</span></> : sub}</span>}
    </button>
  );
}


export interface HubPopoverProps {
  entity: HubEntity;
  entities: Map<string, HubEntity>;
  calls?: readonly AgentGraphCall[];
  now: number;
  container: HTMLElement | null;
  summary?: ReactNode;
  onClose: () => void;
}

/** A node's recent calls: who it called or was called by, what for, how long, and what failed. */
export function HubPopover({ entity, entities, calls, now, container, summary, onClose }: HubPopoverProps) {
  const mine = (calls ?? []).filter((c) => (c.from === entity.id || c.to === entity.id) && c.startedAt <= now).sort((a, b) => b.startedAt - a.startedAt);
  const recent = mine.slice(0, 5);
  const lastMinute = mine.filter((c) => now - c.startedAt <= 60_000).length;
  const status = entity.status ? statusMeta(entity.status).label : undefined;
  const cost = entity.agent?.costUsd;
  return (
    <HoverCardContent container={container} side="right" align="start" collisionPadding={8} role="dialog" aria-label={`${entity.label} calls`} className="ag-popover" onOpenAutoFocus={event => { (event.target as HTMLElement).querySelector<HTMLButtonElement>(".ag-close")?.focus({ preventScroll: true }); }} onEscapeKeyDown={event => { event.preventDefault(); onClose(); }}>
      <div className="ag-pop-head">
        <span className="ag-tile ag-tile-mini" style={{ "--ag-tile": "28px" } as CSSProperties}><NodeIcon entity={entity} size={28} /></span>
        <span className="ag-pop-title">
          <span className="ag-pop-name">{entity.label}</span>
          {(entity.agent?.model || entity.sub || entity.tool?.detail) && <span className="ag-pop-sub">{entity.agent?.model ?? entity.tool?.detail ?? entity.sub}</span>}
        </span>
        {status && <span className={`ag-pill ag-pill-${entity.status}`}>{entity.status === "running" && !entity.quiet ? <span className="ag-running-dot" data-motion="essential" style={ambientStyle} onAnimationStart={syncAmbient} /> : <RunStatusIcon status={entity.quiet ? "waiting" : entity.status!} aria-hidden />}{entity.quiet ?? status}</span>}
        <button type="button" className="ag-close" aria-label="Close" onClick={onClose}><X size={14} /></button>
      </div>
      {summary && <p className="ag-pop-summary">{summary}</p>}
      {recent.length > 0 && <ul className="ag-pop-calls">
        {recent.map((c) => {
          const outgoing = c.from === entity.id;
          const other = entities.get(outgoing ? c.to : c.from);
          const running = c.durationMs == null;
          return (
            <li key={c.id}>
              <span className="ag-pop-dir" aria-label={outgoing ? "to" : "from"}>{outgoing ? "→" : "←"}</span>
              {other && <span className="ag-tile ag-tile-micro" style={{ "--ag-tile": "16px" } as CSSProperties}><NodeIcon entity={other} size={16} /></span>}
              <span className="ag-pop-call"><b>{other?.label ?? (outgoing ? c.to : c.from)}</b>{c.label ? ` · ${c.label}` : ""}</span>
              <span className="ag-pop-time" style={c.kind === "failed" ? { color: CALL_COLOR.failed } : undefined}>
                {c.kind === "failed" ? "Failed" : running ? <span className="ag-running-dot" data-motion="essential" aria-label="Running" style={ambientStyle} onAnimationStart={syncAmbient} /> : fmtMs(c.durationMs!)}
              </span>
            </li>
          );
        })}
      </ul>}
      <p className="ag-pop-foot">
        {cost != null && <b>{fmtCost(cost)}</b>}
        <span title={calls === undefined ? "Call history not reported" : undefined}>{calls === undefined ? "—" : lastMinute} {lastMinute === 1 ? "call" : "calls"} in the last minute</span>
      </p>
    </HoverCardContent>
  );
}
