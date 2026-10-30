import { HoverCard } from "@tangle-network/ui/primitives/hover-card";
/** The hub presents agent and tool calls on a stable canvas or a readable list. */

import { type KeyboardEvent, type ReactNode, type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AgentGraphEdge, AgentGraphNode } from "./agent-graph-layout";
import { AGENT_HUB_CSS } from "./agent-hub-css";
import {
  type AgentGraphCall, type AgentGraphTool, HUB_METRICS, type HubMetrics, layoutHub, orthogonalPath, YOU_ID,
} from "./agent-hub-layout";
import { CALL_COLOR, CALL_LABEL, type HubEntity, HubNode, HubPopover } from "./agent-hub-parts";
import { agentQuietActivity, tokenMilliseconds, useMotionAllowed } from "./run-ui-state";
import { useRunNow } from "@tangle-network/ui/hooks/use-live-time";
import { RunStatusIcon, statusMeta } from "@tangle-network/ui/run/status-meta";
import { fmtCost } from "./format";

const PAD_X = 84;
const PAD_Y = 36;

export interface AgentHubCanvasProps {
  nodes: readonly AgentGraphNode[];
  edges: readonly AgentGraphEdge[];
  tools?: readonly AgentGraphTool[]; // Omitted inventory is unknown; [] is recorded zero.
  calls?: readonly AgentGraphCall[]; // Omitted history is unknown; [] is recorded zero.
  /** Draw the person who asked as "You"; `summary` is the ask, shown in its popover. */
  you?: { label?: string; summary?: string } | boolean;
  /** Epoch ms the graph is drawn at; calls after it are not shown yet. Defaults to now, ticking. */
  now?: number;
  title?: ReactNode;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
}

function useWidth(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function CallStroke({ call, d, length, now, forward, animate }: { call: AgentGraphCall; d: string; length: number; now: number; forward: boolean; animate: boolean }) {
  const ref = useRef<SVGPathElement>(null);
  const routeRef = useRef<SVGPathElement>(null);
  const [chevron, setChevron] = useState<{ x: number; y: number; angle: number; travel: number; decay: number }>();
  const end = call.durationMs == null ? Infinity : call.startedAt + call.durationMs;
  const returning = now >= end;
  useLayoutEffect(() => {
    const path = routeRef.current;
    if (!path) return;
    const middle = path.getTotalLength() / 2, point = path.getPointAtLength(middle), before = path.getPointAtLength(middle - 1), after = path.getPointAtLength(middle + 1);
    const ambient = tokenMilliseconds("--duration-ambient", path);
    setChevron({ x: point.x, y: point.y, angle: Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI + (forward === returning ? 180 : 0), travel: Math.min(ambient * .9, Math.max(ambient * .3, length / 320 * 1000)), decay: ambient * 4 });
  }, [d, length, forward, returning]);
  useEffect(() => {
    const el = ref.current;
    const duration = chevron?.travel;
    if (!el || !animate || call.kind === "failed" || !duration) return;
    const age = now - (returning ? end : call.startedAt);
    if (age > duration) return;
    const reverse = forward === returning;
    const animation = el.animate([{ strokeDashoffset: reverse ? -length : 24, opacity: .35 }, { strokeDashoffset: reverse ? 24 : -length, opacity: .35 }], { duration, easing: "linear" });
    animation.currentTime = Math.max(0, age);
    return () => animation.cancel();
  }, [call.id, returning, animate, length, forward, chevron?.travel]);
  const age = Math.max(0, now - end);
  const tint = returning ? Math.max(0, .55 * (1 - age / (chevron?.decay || 1))) : .55;
  return <g data-call-id={call.id} data-direction={forward !== returning ? "forward" : "return"} style={{ stroke: CALL_COLOR[call.kind] }}>
    <path ref={routeRef} d={d} className="ag-edge-live" opacity={tint} />
    {chevron && <path data-call-arrow opacity={returning ? tint / .55 : 1} d="M-3,-3 L1,0 L-3,3" fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" transform={`translate(${chevron.x},${chevron.y}) rotate(${chevron.angle})`} />}
    {animate && <path ref={ref} d={d} className="ag-flow" strokeDasharray={`24 ${length}`} opacity={0} />}
  </g>;
}

export function AgentHubCanvas(props: AgentHubCanvasProps) {
  const { nodes, edges, tools = [], calls = [], you, now: nowProp, title = "Agent graph", selectedId, onSelect, className } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const width = useWidth(wrap);
  const now = useRunNow(nowProp);
  const [hover, setHover] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(selectedId ?? null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const closeRef = useRef<HTMLButtonElement>(null);
  const buttonRef = (id: string) => (element: HTMLButtonElement | null) => { if (element) buttons.current.set(id, element); else buttons.current.delete(id); };
  const animate = useMotionAllowed();
  const visibleCalls = useMemo(() => calls.filter((c) => c.startedAt <= now), [calls, now]);
  const nextLayout = useMemo(() => layoutHub({ nodes, edges, tools, calls, you: Boolean(you) }), [nodes, edges, tools, calls, you]);
  const layoutKey = JSON.stringify(nextLayout);
  const layoutRef = useRef({ key: layoutKey, layout: nextLayout });
  if (layoutRef.current.key !== layoutKey) layoutRef.current = { key: layoutKey, layout: nextLayout };
  const layout = layoutRef.current.layout;
  const callSummaries = useMemo(() => {
    const summaries = { call: new Map<string, AgentGraphCall>(), answer: new Map<string, AgentGraphCall>(), "needs-you": new Map<string, AgentGraphCall>() };
    for (const call of visibleCalls) if (call.kind !== "failed") {
      const bucket = summaries[call.kind], id = call.kind === "call" ? call.to : call.from;
      if (!bucket.has(id) || bucket.get(id)!.startedAt < call.startedAt) bucket.set(id, call);
    }
    return summaries;
  }, [visibleCalls]);

  const span = (m: HubMetrics) => ({ w: (layout.maxCol - layout.minCol) * m.cellX + PAD_X * 2, h: (layout.maxRow - layout.minRow) * m.cellY + PAD_Y * 2 + m.hubTile + m.label });
  const metrics = HUB_METRICS;
  const { w, h } = span(metrics);
  const list = width > 0 && (width < 600 || width / w < .85);
  const scale = width ? Math.max(.85, Math.min(1, width / w)) : 1;

  const entities = useMemo(() => {
    const map = new Map<string, HubEntity>();
    for (const p of layout.placements) {
      if (p.kind === "you") map.set(p.id, { id: p.id, kind: "you", label: typeof you === "object" && you.label ? you.label : "You" });
      else if (p.kind === "tool") {
        const tool = tools.find((t) => t.id === p.id)!;
        map.set(p.id, { id: p.id, kind: "tool", label: tool.label, tool });
      } else {
        const agent = nodes.find((n) => n.id === p.id)!;
        map.set(p.id, { id: p.id, kind: p.kind, label: agent.label, sub: (agent.status === "done" ? agent.result ?? callSummaries.answer.get(agent.id)?.label : undefined) ?? agent.turn ?? (agent.status === "needs-you" ? callSummaries["needs-you"].get(agent.id)?.label : undefined) ?? callSummaries.call.get(agent.id)?.label ?? undefined, status: agent.status, quiet: agentQuietActivity(agent, now)?.label, agent });
      }
    }
    return map;
  }, [layout, nodes, tools, you, now, callSummaries]);

  const { positions, routes } = useMemo(() => {
    const positions = new Map(layout.placements.map(p => [p.id, { x: (p.col - layout.minCol) * metrics.cellX + PAD_X, y: (p.row - layout.minRow) * metrics.cellY + PAD_Y + metrics.hubTile / 2, tile: p.kind === "hub" ? metrics.hubTile : p.kind === "you" ? metrics.tile - 8 : metrics.tile }]));
    const bounds = layout.placements.map(p => { const { x, y, tile } = positions.get(p.id)!; return { id: p.id, tile: { left: x - tile / 2 - 4, right: x + tile / 2 + 4, top: y - tile / 2 - 4, bottom: y + tile / 2 + 4 }, label: { left: x - (p.kind === "tool" || p.kind === "you" ? 70 : 92), right: x + (p.kind === "tool" || p.kind === "you" ? 70 : 92), top: y + tile / 2 + 4, bottom: y + tile / 2 + (p.kind === "tool" || p.kind === "you" ? 30 : 64) } }; });
    let lanes = 0;
    const routes = new Map(layout.links.map(link => {
      const a = positions.get(link.from)!, b = positions.get(link.to)!;
      const fromHub = layout.placements.find(p => p.id === link.from)?.kind === "hub";
      const lane = fromHub ? (++lanes % 2 ? -1 : 1) * Math.ceil(lanes / 2) * 12 : 0;
      return [`${link.from}|${link.to}`, orthogonalPath(a, b, b.y < a.y, lane, 10, bounds.flatMap(rect => [...(rect.id === link.from || rect.id === link.to ? [] : [rect.tile]), rect.label]))];
    }));
    return { positions, routes };
  }, [layout, metrics]);
  const at = (id: string) => positions.get(id)!;

  const edgeState = (from: string, to: string) => {
    let latest: AgentGraphCall | undefined;
    for (const c of visibleCalls) {
      if ((c.from === from && c.to === to) || (c.from === to && c.to === from)) if (!latest || c.startedAt > latest.startedAt) latest = c;
    }
    if (!latest) return undefined;
    return latest;
  };

  const focus = hover ?? open;
  const related = useMemo(() => {
    if (!focus) return null;
    const set = new Set([focus]);
    for (const l of layout.links) {
      if (l.from === focus) set.add(l.to);
      if (l.to === focus) set.add(l.from);
    }
    return set;
  }, [focus, layout]);

  const availableTools = tools.filter(tool => !visibleCalls.some(call => call.from === tool.id || call.to === tool.id));
  const lastMinute = visibleCalls.filter((c) => now - c.startedAt <= 60_000).length;
  const costs = nodes.map((n) => n.costUsd);
  const cost = costs.every((c) => c != null && Number.isFinite(c) && c >= 0) ? costs.reduce<number>((s, c) => s + (c ?? 0), 0) : undefined;
  const chips = nodes.filter((n) => n.status === "needs-you" || n.status === "failed" || agentQuietActivity(n, now));

  const openNode = (id: string) => {
    const next = open === id ? null : id;
    setOpen(next);
    if (next) onSelect?.(next);
  };
  useEffect(() => { if (open) { closeRef.current?.closest('[role="dialog"]')?.scrollIntoView({ block: "nearest" }); closeRef.current?.focus({ preventScroll: true }); } }, [open]);

  const keydown = (id: string) => (event: KeyboardEvent<HTMLButtonElement>) => {
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const dir = dirs[event.key];
    if (event.key === "Escape") { setOpen(null); buttons.current.get(id)?.focus(); return; }
    if (event.key === "Home") { event.preventDefault(); nodes[0] && buttons.current.get(nodes[0].id)?.focus(); return; }
    if (!dir) return;
    event.preventDefault();
    const from = at(id);
    let best: string | undefined, bestScore = Infinity;
    for (const p of layout.placements) {
      if (p.id === id) continue;
      const to = at(p.id);
      const dx = to.x - from.x, dy = to.y - from.y;
      const along = dx * dir[0] + dy * dir[1];
      if (along <= 0) continue;
      const score = along + Math.abs(dx * dir[1] - dy * dir[0]) * 2;
      if (score < bestScore) { bestScore = score; best = p.id; }
    }
    if (best) buttons.current.get(best)?.focus();
  };

  const openEntity = open ? entities.get(open) : undefined;
  const popover = openEntity && (() => {
    const summary = openEntity.kind === "you" ? (typeof you === "object" ? you.summary : undefined)
      : openEntity.agent?.turn ?? openEntity.sub ?? undefined;
    return <HubPopover entity={openEntity} entities={entities} calls={props.calls === undefined ? undefined : visibleCalls} now={now} container={wrap.current} summary={summary}
      closeRef={closeRef} onClose={() => { const id = open!; setOpen(null); buttons.current.get(id)?.focus(); }} />;
  })();


  return (
    <HoverCard anchor={open ? buttons.current.get(open) : null} open={!!openEntity}><section className={`ag-root ${className ?? ""}`} aria-label={typeof title === "string" ? title : "Agent graph"}>
      <style>{AGENT_HUB_CSS}</style>
      <header className="ag-head">
        <span className="ag-title"><span className="ag-title-mark" aria-hidden />{title}</span>
        {chips.map(n => <button type="button" key={n.id} className={`ag-chip ag-chip-${n.status}`} onClick={() => openNode(n.id)}><RunStatusIcon status={agentQuietActivity(n, now) ? "waiting" : n.status} aria-hidden />{n.label} {agentQuietActivity(n, now)?.label ?? statusMeta(n.status).label}</button>)}
        <span className="ag-stats">
          <span><b>{nodes.length}</b> {nodes.length === 1 ? "agent" : "agents"}</span>
          <span title={props.tools === undefined ? "Tool history not reported" : undefined}><b>{props.tools?.length ?? "—"}</b> {tools.length === 1 ? "tool" : "tools"}</span>
          <span title={props.calls === undefined ? "Call history not reported" : undefined}><b>{props.calls === undefined ? "—" : lastMinute}</b> calls/min</span>
          <span title={cost === undefined ? "Not every agent recorded its cost" : "Total recorded agent cost"}><b>{cost === undefined ? "—" : fmtCost(cost)}</b> cost</span>
        </span>
      </header>
      <div ref={wrap} className={`ag-canvas-wrap${list ? " ag-list-mode" : ""}`} style={list ? undefined : { height: h * scale }} onKeyDown={(e) => { if (e.key === "Escape") setOpen(null); }}>
        {list ? <><ul className="ag-mobile">{[...entities.values()].filter(e => e.agent).sort((a, b) => {
          const rank = (e: HubEntity) => e.status === "needs-you" ? 0 : e.status === "failed" ? 1 : e.quiet ? 2 : e.status === "waiting" ? 3 : e.status === "running" ? 4 : 5;
          return rank(a) - rank(b);
        }).map(entity => <li key={entity.id}>
          <HubNode entity={entity} x={0} y={0} tile={32} dimmed={false} selected={open === entity.id}
            buttonRef={buttonRef(entity.id)}
            onOpen={() => openNode(entity.id)} onHover={() => {}} onKeyDown={keydown(entity.id)} />
          <div className="ag-tools">{tools.filter(t => visibleCalls.some(c => c.from === entity.id && c.to === t.id || c.to === entity.id && c.from === t.id)).map(t =>
            <button ref={buttonRef(t.id)} type="button" key={t.id} onClick={() => openNode(t.id)}>{t.label}</button>)}</div>
        </li>)}</ul>{availableTools.length > 0 && <div className="ag-available"><span>Available tools</span><div className="ag-tools">{availableTools.map(tool => <button ref={buttonRef(tool.id)} type="button" key={tool.id} onClick={() => openNode(tool.id)}>{tool.label}</button>)}</div></div>}</> : <div className="ag-canvas" style={{ width: w, height: h, transform: `scale(${scale})` }}>
          <svg className="ag-edges" width={w} height={h} aria-hidden>
            {layout.links.map((l) => {
              const { d, length } = routes.get(`${l.from}|${l.to}`)!;
              const live = edgeState(l.from, l.to);
              const touches = !related || (related.has(l.from) && related.has(l.to));
              const forward = live ? live.from === l.from : true;
              return (
                <g key={`${l.from}-${l.to}`} className={touches ? undefined : "ag-dimmed"}>
                  <path d={d} className="ag-edge" />
                  {live && <CallStroke call={live} d={d} length={length} now={now} forward={forward} animate={animate} />}
                </g>
              );
            })}
          </svg>
          {layout.placements.map((p) => {
            const entity = entities.get(p.id)!;
            const { x, y } = at(p.id);
            const tile = p.kind === "hub" ? metrics.hubTile : p.kind === "you" ? metrics.tile - 8 : metrics.tile;
            return <HubNode key={p.id} entity={entity} x={x} y={y} tile={tile} dimmed={Boolean(related && !related.has(p.id))}
              selected={open === p.id} buttonRef={buttonRef(p.id)}
              onOpen={() => openNode(p.id)} onHover={(on) => setHover((prev) => (on ? p.id : prev === p.id ? null : prev))} onKeyDown={keydown(p.id)} />;
          })}
        </div>}
        {popover}
      </div>
      {!list && <ul className="ag-legend" aria-label="Edge colours">
        {(["call", "answer", "needs-you", "failed"] as const).map((k) => <li key={k}><span className="ag-legend-line" style={{ background: CALL_COLOR[k] }} />{CALL_LABEL[k]}</li>)}
      </ul>}
    </section></HoverCard>
  );
}
