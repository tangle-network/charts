/**
 * The run as a grid of cards: every agent at once, root first and then each spawn subtree by start time, with no edges
 * and no camera, so a hundred cards scroll like a list and a status update never moves one. The cards are the tree's
 * (one node model for the tree, the hub and the grid); the host's `renderAgentMark` and each card's harness and model
 * line identify them.
 */
import { useRunNow } from "@tangle-network/ui/hooks/use-live-time";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import type { AgentGraphProps } from "./AgentGraph";
import type { AgentGraphEdge, AgentGraphNode } from "./agent-graph-layout";
import { AgentCardView, agentDescription, type AttentionStatus, StatusCaption } from "./agent-graph-parts";
import { LiveAgentCardView } from "./agent-live-card";

/** Reading order: each agent nobody spawned, then its spawned children by start time, depth first. */
export function gridOrder(nodes: readonly AgentGraphNode[], edges: readonly AgentGraphEdge[]): AgentGraphNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<string, string[]>(), spawned = new Set<string>();
  for (const edge of edges) {
    if (edge.kind !== "spawn" || edge.from === edge.to || !byId.has(edge.from) || !byId.has(edge.to) || spawned.has(edge.to)) continue;
    spawned.add(edge.to);
    children.set(edge.from, [...(children.get(edge.from) ?? []), edge.to]);
  }
  const start = (id: string) => byId.get(id)?.startedAt ?? Number.MAX_SAFE_INTEGER;
  const out: AgentGraphNode[] = [], seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push(byId.get(id)!);
    for (const child of [...(children.get(id) ?? [])].sort((a, b) => start(a) - start(b))) walk(child);
  };
  for (const node of nodes) if (!spawned.has(node.id)) walk(node.id);
  for (const node of nodes) walk(node.id);
  return out;
}

export function AgentGridCanvas({ nodes, edges, selectedId, onSelect, className, emptyState, live = false, renderEventIcon, now, wholeClaims = false }: AgentGraphProps) {
  const clock = useRunNow(now);
  const [highlight, setHighlight] = useState<AttentionStatus | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const ordered = useMemo(() => gridOrder(nodes, edges), [nodes, edges]);
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const parentOf = useMemo(() => new Map(edges.filter((edge) => edge.kind === "spawn").map((edge) => [edge.to, edge.from])), [edges]);
  useEffect(() => {
    if (selectedId) root.current?.querySelector<HTMLElement>(`[data-agent-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);
  /** Arrows move across the grid as it is drawn: left and right by one card, up and down by one row. */
  const move = (event: KeyboardEvent<HTMLElement>, index: number) => {
    const list = root.current?.querySelector<HTMLElement>(".ag-grid");
    if (!list) return;
    const cards = [...list.querySelectorAll<HTMLElement>("[data-agent-id]")], columns = getComputedStyle(list).gridTemplateColumns.split(" ").length;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[event.key];
    const target = event.key === "Home" ? 0 : event.key === "End" ? cards.length - 1 : step === undefined ? -1 : index + step;
    if (target < 0 || target >= cards.length) return;
    event.preventDefault();
    cards[target]!.focus();
  };
  if (nodes.length === 0) {
    return <div className={`agent-graph flex items-center justify-center rounded-lg border border-border border-dashed p-4 text-center text-muted-foreground text-xs ${className ?? ""}`}>{emptyState ?? "No agents yet"}</div>;
  }
  return (
    <div ref={root} className={`agent-graph ag-live${live ? "" : " ag-topology"} relative flex flex-col ${className ?? ""}`} data-layout="grid" data-highlight={highlight ?? undefined}>
      <StatusCaption nodes={nodes} now={clock} highlight={highlight} onHighlight={(status) => setHighlight((on) => (on === status ? null : status))} />
      <ul className="ag-grid ag-graph-viewport" aria-label="Agents">
        {ordered.map((agent, index) => {
          const selected = selectedId === agent.id, parentLabel = byId.get(parentOf.get(agent.id) ?? "")?.label, open = onSelect ? () => onSelect(agent.id) : undefined;
          return <li key={agent.id}>
            <div role="button" tabIndex={0} aria-pressed={selected} aria-label={agentDescription(agent)} data-agent-id={agent.id} className="ag-phone-select"
              onClick={open} onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) { event.preventDefault(); open?.(); } else move(event, index); }}>
              {live
                ? <LiveAgentCardView agent={agent} parentLabel={parentLabel} selected={selected} now={clock} renderEventIcon={renderEventIcon} onOpen={open} whole={wholeClaims} />
                : <AgentCardView agent={agent} parentLabel={parentLabel} selected={selected} now={clock} direction="TB" onOpen={open} whole={wholeClaims} />}
            </div>
          </li>;
        })}
      </ul>
    </div>
  );
}
