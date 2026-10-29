import {
  Background,
  Controls,
  type Edge,
  MarkerType,
  MiniMap,
  type Node,
  ReactFlow,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AgentGraphProps } from "./AgentGraph";
import { createPortal } from "react-dom";
import { fmtCost, fmtTokenTotal } from "./format";
import { LatestEvents } from "./latest-events";
import {
  AGENT_CARD,
  FRAME_CAPTION,
  type AgentGraphStatus,
  LIVE_AGENT_CARD,
  type AgentLayout,
  buildAgentTopology,
  layoutAgents,
} from "./agent-graph-layout";
import {
  AGENT_NODE_CLASS,
  AgentCard,
  AgentCardView,
  type AgentCardNode,
  AgentFrameBox,
  type AgentFrameNode,
  type AgentMessageEdge,
  AgentMessageEdgeView,
  agentStatus,
  agentDescription,
  MESSAGE_EDGE_COLOR,
} from "./agent-graph-parts";
import { LiveAgentCard, LiveAgentCardView, type LiveAgentCardNode } from "./agent-live-card";
import { useColorMode } from "./canvas-theme";
import { edgeColor } from "./graph-style";
import { agentQuietActivity, tokenMilliseconds, useMotionAllowed, useRunNow } from "./run-ui-state";

const NODE_TYPES = { agent: AgentCard, liveAgent: LiveAgentCard, agentFrame: AgentFrameBox };
const EDGE_TYPES = { agentMessage: AgentMessageEdgeView };
/** The fit's margin, in screen pixels. */
const FIT_PADDING = 16;
const PHONE_PAGE = 24;

/** The canvas's size, once it has one. */
function useCanvasSize(): [
  { width: number; height: number } | null,
  (el: HTMLDivElement | null) => void,
] {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const measure = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el || typeof ResizeObserver === "undefined") return;
    const viewport = el.querySelector<HTMLElement>(".ag-graph-viewport") ?? el;
    const read = () => {
      const r = viewport.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      setSize((prev) =>
        prev && Math.abs(prev.width - r.width) < 1 && Math.abs(prev.height - r.height) < 1
          ? prev
          : { width: r.width, height: r.height },
      );
    };
    observer.current = new ResizeObserver(read);
    observer.current.observe(viewport);
    read();
  }, []);
  return [size, measure];
}

/** Keep the selected card inside the actual viewport without resetting the reader's camera. */
function revealSelection(inst: ReactFlowInstance, wrapper: HTMLDivElement | null, id: string) {
  const node = inst.getInternalNode(id), box = wrapper?.querySelector(".ag-graph-viewport")?.getBoundingClientRect();
  const width = node?.measured.width ?? node?.width, height = node?.measured.height ?? node?.height;
  if (!node || !box || !width || !height) return;
  const current = inst.getViewport(), position = node.internals.positionAbsolute;
  const zoom = current.zoom;
  const x = Math.max(FIT_PADDING - position.x * zoom, Math.min(box.width - FIT_PADDING - (position.x + width) * zoom, current.x));
  const y = Math.max(FIT_PADDING - position.y * zoom, Math.min(box.height - FIT_PADDING - (position.y + height) * zoom, current.y));
  if (x !== current.x || y !== current.y || zoom !== current.zoom) void inst.setViewport({ x, y, zoom });
}

export function AgentGraphCanvas({
  nodes, edges, selectedId, onSelect, direction = "TB", className, emptyState,
  live = false, renderEventIcon, showLatestEvents = true, now,
}: AgentGraphProps) {
  const card = live ? LIVE_AGENT_CARD : AGENT_CARD;
  const clock = useRunNow(now);
  const animateMotion = useMotionAllowed();
  const detailsId = useId();
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hoverTarget = useRef<HTMLElement | null>(null);
  const returningFocus = useRef(false);
  const keepDetails = () => clearTimeout(hoverTimer.current);
  const hideDetails = () => { keepDetails(); setHovered(null); };
  const leaveDetails = () => { keepDetails(); hoverTimer.current = setTimeout(() => setHovered(null), tokenMilliseconds("--duration-fast", wrapperRef.current)); };
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  const [hovered, setHovered] = useState<{ id: string; rect: DOMRect } | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [phonePage, setPhonePage] = useState(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [canvas, measureCanvas] = useCanvasSize();
  const colorMode = useColorMode(wrapperRef, nodes.length > 0);
  const narrow = canvas !== null && canvas.width < 600;
  const nextTopology = buildAgentTopology(nodes, edges);
  const topologyRef = useRef(nextTopology);
  if (topologyRef.current.key !== nextTopology.key) topologyRef.current = nextTopology;
  const topology = topologyRef.current;
  const columnKey = `${direction}:${live}:${topology.key}`;
  const columnRef = useRef<{ key: string; columns: number } | null>(null);
  if (canvas && !narrow && columnRef.current?.key !== columnKey) columnRef.current = { key: columnKey, columns: Math.max(1, Math.min(6, Math.floor((canvas.width - 2 * FIT_PADDING - (!live && direction === "LR" ? card.width + 70 : 0)) / (card.width + 10)))) };
  const columns = columnRef.current?.columns ?? 1;
  const layoutKey = JSON.stringify([direction, live, topology.key, columns, [...collapsed]]);
  const [placed, setPlaced] = useState<{ key: string; layout: AgentLayout } | null>(null);
  useEffect(() => {
    if (narrow) return;
    let active = true;
    void layoutAgents(topology, direction, columns, card, collapsed, live).then(layout => { if (active) setPlaced({ key: layoutKey, layout }); });
    return () => { active = false; };
  }, [layoutKey, narrow]);
  const layout = placed?.key === layoutKey ? placed.layout : null;
  useEffect(() => {
    const group = selectedId && topology.groupOf.get(selectedId);
    if (group) setCollapsed(current => { if (!current.has(group)) return current; const next = new Set(current); next.delete(group); return next; });
  }, [selectedId, topology.key]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const rfRef = useRef<ReactFlowInstance | null>(null);
  const flowNodes = useMemo((): Node[] => {
    if (!layout) return [];
    const frames: AgentFrameNode[] = layout.frames.map((frame) => ({
      id: frame.group.id,
      type: "agentFrame",
      position: { x: frame.x, y: frame.y },
      width: frame.width, height: frame.height, measured: rfRef.current?.getInternalNode(frame.group.id)?.measured,
      zIndex: -1,
      selectable: false,
      focusable: false,
      draggable: false,
      data: { frame, direction, groupParents: live, label: byId.get(frame.group.parentId)?.label ?? "Agent", onToggle: () => {
        if (!frame.collapsed && selectedId && frame.group.memberIds.includes(selectedId)) onSelect?.(frame.group.parentId);
        setCollapsed(current => { const next = new Set(current); next.has(frame.group.id) ? next.delete(frame.group.id) : next.add(frame.group.id); return next; });
      } },
    }));
    const cards: (AgentCardNode | LiveAgentCardNode)[] = [];
    for (const id of topology.agentIds) {
      const agent = byId.get(id);
      const position = layout.positions.get(id);
      if (!agent || !position) continue;
      const selected = selectedId === id, owned = live && layout.frames.find(frame => frame.group.parentId === id);
      const width = owned ? owned.width - 64 : card.width, height = owned ? FRAME_CAPTION - 16 : card.height;
      const measured = rfRef.current?.getInternalNode(id)?.measured;
      cards.push({
        id,
        type: live ? "liveAgent" : "agent",
        position,
        width, height, measured: measured?.width === width && measured.height === height ? measured : undefined,
        className: `${AGENT_NODE_CLASS}${owned ? " ag-frame-owner" : ""}`,
        draggable: false,
        ariaRole: "button",
        ariaLabel: agentDescription(agent),
        domAttributes: { "aria-pressed": selected, "aria-describedby": hovered?.id === id ? detailsId : undefined },
        data: { agent, selected, direction, now: clock, onOpen: onSelect ? () => onSelect(agent.id) : undefined, renderEventIcon },
      } as AgentCardNode | LiveAgentCardNode);
    }
    return [...frames, ...cards];
  }, [layout, topology, byId, selectedId, direction, live, card, clock, onSelect, renderEventIcon, hovered]);
  const flowEdges = useMemo((): Edge[] => {
    if (!layout) return [];
    const out: Edge[] = [];
    const seen = new Set<string>();
    for (const s of topology.spawns) {
      const source = (live && topology.groups.find(group => group.parentId === s.from)?.id) || s.from, target = topology.groupOf.get(s.to) ?? s.to;
      if (source === target) continue;
      const id = `spawn:${source}:${target}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        source,
        target,
        type: "smoothstep",
        pathOptions: { borderRadius: 14 },
        selectable: false,
        focusable: false,
        style: { stroke: edgeColor(undefined), strokeWidth: 1.5 },
      } as Edge);
    }
    const ids = new Set(layout.positions.keys());
    const messages = new Map<string, AgentMessageEdge>();
    for (const e of edges) {
      if (e.kind === "spawn" || e.from === e.to || !ids.has(e.from) || !ids.has(e.to)) continue;
      if (![selectedId, hovered?.id].some(id => id === e.from || id === e.to)) continue;
      const id = `${e.kind}:${e.from}:${e.to}`;
      const prior = messages.get(id);
      const count = (prior?.data?.count ?? 0) + Math.max(1, e.count ?? 1);
      const color = MESSAGE_EDGE_COLOR[e.kind] ?? MESSAGE_EDGE_COLOR.message;
      messages.set(id, {
        id,
        source: e.from,
        target: e.to,
        type: "agentMessage",
        selectable: false,
        focusable: false,
        zIndex: 0,
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color },
        ariaLabel: `${e.kind === "delegation" ? "Delegation" : "Message"} from ${byId.get(e.from)?.label ?? e.from} to ${byId.get(e.to)?.label ?? e.to}${count > 1 ? `, ${count} times` : ""}`,
        data: { kind: e.kind, count, label: e.label ?? prior?.data?.label },
      });
    }
    return [...out, ...messages.values()];
  }, [layout, topology, edges, byId, selectedId, hovered]);
  const [ready, setReady] = useState(false);
  const [shown, setShown] = useState(false);
  const selection = useRef(selectedId);
  selection.current = selectedId;
  const framed = useRef<string | null>(null);
  useEffect(() => { if (narrow) { rfRef.current = null; setReady(false); setShown(false); framed.current = null; } }, [narrow]);
  const layoutIdentity = layout ? `${layoutKey}:${layout.columns}` : null;
  const cameraKey = `${direction}:${topology.key}`;
  const minZoom = !live ? 1 : layout && canvas ? Math.max(0.02, Math.min(0.2, (canvas.width - 2 * FIT_PADDING) / layout.width, (canvas.height - 2 * FIT_PADDING) / layout.height)) : 0.2;
  useEffect(() => {
    const inst = rfRef.current;
    if (!ready || !inst || !layoutIdentity || !canvas) return;
    // Settling changes card geometry; it does not replace the reader's view.
    const relayout = framed.current !== cameraKey;
    const preserveView = !relayout;
    if (preserveView && !selection.current) return;
    const animate = framed.current !== null && relayout && animateMotion;
    framed.current = cameraKey;
    const frame = requestAnimationFrame(() => {
      if (preserveView) revealSelection(inst, wrapperRef.current, selection.current!);
      else {
        const id = selection.current ?? topology.agentIds[0], position = layout?.positions.get(id), width = inst.getInternalNode(id)?.width ?? card.width;
        const x = layout!.width + 2 * FIT_PADDING <= canvas.width ? (canvas.width - layout!.width) / 2 : position ? Math.max(FIT_PADDING - position.x, canvas.width / 2 - position.x - width / 2) : FIT_PADDING;
        const y = layout!.height + 2 * FIT_PADDING <= canvas.height ? FIT_PADDING : FIT_PADDING - (position?.y ?? 0);
        void inst.setViewport({ x, y, zoom: 1 }, { duration: animate ? tokenMilliseconds("--duration-base", wrapperRef.current) : 0 });
      }
      setShown(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, layoutIdentity, cameraKey, canvas, minZoom, animateMotion, selectedId]);
  const select = useCallback(
    (id: string) => {
      if (byId.has(id)) { onSelect?.(id); wrapperRef.current?.querySelector<HTMLElement>(`[data-agent-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" }); }
    },
    [byId, onSelect],
  );
  const handleNodeClick = useCallback((_event: ReactMouseEvent, node: Node) => select(node.id), [select]);
  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLElement)) return;
    const id = event.target.closest(".react-flow__node")?.getAttribute("data-id");
    if (!id || !byId.has(id)) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); wrapperRef.current?.focus(); return; }
    if (!event.target.classList.contains("react-flow__node")) return;
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); select(id); return; }
    const origin = layout?.positions.get(id);
    const vector = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    const target = event.key === "Home" ? topology.agentIds[0] : origin && vector ? [...(layout?.positions ?? [])]
      .filter(([key, p]) => byId.has(key) && key !== id && (p.x - origin.x) * vector[0] + (p.y - origin.y) * vector[1] > 0)
      .sort((a, b) => Math.hypot(a[1].x - origin.x, a[1].y - origin.y) - Math.hypot(b[1].x - origin.x, b[1].y - origin.y))[0]?.[0] : null;
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    const position = layout?.positions.get(target), size = rfRef.current?.getInternalNode(target)?.measured;
    if (position) void rfRef.current?.setCenter(position.x + (size?.width ?? card.width) / 2, position.y + (size?.height ?? card.height) / 2, { zoom: 1 });
    const focus = () => wrapperRef.current?.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(target)}"]`);
    const visible = focus();
    if (visible) visible.focus(); else requestAnimationFrame(() => requestAnimationFrame(() => focus()?.focus()));
  }, [byId, select, layout, topology, card, animateMotion]);
  const activityRank = (agent: (typeof nodes)[number]) => agent.status === "needs-you" ? 0 : agent.status === "failed" ? 1 : agentQuietActivity(agent, clock) ? 2 : agent.status === "waiting" ? 3 : agent.status === "running" ? 4 : 5;
  const parentOf = new Map(edges.filter(e => e.kind === "spawn").map(e => [e.to, e.from]));
  const depthOf = (id: string) => { const seen = new Set([id]); let depth = 0; while (parentOf.has(id) && !seen.has(parentOf.get(id)!)) { id = parentOf.get(id)!; seen.add(id); depth++; } return depth; };
  const readingOrder = useRef<string[]>([]), known = new Set(readingOrder.current);
  readingOrder.current = [...readingOrder.current.filter(id => byId.has(id)), ...nodes.filter(agent => !known.has(agent.id)).sort((a, b) => activityRank(a) - activityRank(b)).map(agent => agent.id)];
  const phoneNodes = readingOrder.current.map(id => byId.get(id)!);
  useEffect(() => { const at = phoneNodes.findIndex(node => node.id === selectedId); if (at >= 0) setPhonePage(Math.floor(at / PHONE_PAGE)); }, [selectedId]);
  useEffect(() => { if (!narrow || !selectedId) return; const frame = requestAnimationFrame(() => wrapperRef.current?.querySelector<HTMLElement>(`[data-agent-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: "nearest" })); return () => cancelAnimationFrame(frame); }, [selectedId, phonePage, narrow]);
  const first = Math.min(phonePage * PHONE_PAGE, Math.max(0, Math.ceil(nodes.length / PHONE_PAGE) - 1) * PHONE_PAGE);
  const counts = ["needs-you", "failed", "quiet"].map(status => { const matches = nodes.filter(agent => status === "quiet" ? agentQuietActivity(agent, clock) : agent.status === status); return { status, matches, current: matches.find(agent => agent.id === selectedId) ?? matches[0] }; });
  const caption = <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1 text-xs text-muted-foreground" aria-label="Run status">
    <span className="shrink-0 whitespace-nowrap">{nodes.length} agents</span>
    {counts.filter(group => group.matches.length).map(group => <button type="button" key={group.status} className="ag-status-button rounded-full border border-border px-2 py-1" style={{ color: group.status === "quiet" ? "var(--surface-warning-text)" : agentStatus(group.status as AgentGraphStatus).color }} onClick={() => {
      const index = group.matches.findIndex(agent => agent.id === selectedId);
      const next = group.matches[(index + 1) % group.matches.length]; select(next.id);
      const p = layout?.positions.get(next.id), size = rfRef.current?.getInternalNode(next.id)?.measured;
      if (p) void rfRef.current?.setCenter(p.x + (size?.width ?? card.width) / 2, p.y + (size?.height ?? card.height) / 2, { zoom: 1, duration: animateMotion ? tokenMilliseconds("--duration-base", wrapperRef.current) : 0 });
    }}><span className="shrink-0">{group.matches.length} {group.status === "needs-you" ? "needs you" : group.status}</span><span className="ag-caption-target">{group.current.label}{group.status === "failed" && <span className="font-normal"> · {group.current.result ?? group.current.turn ?? "Failure cause not recorded"}</span>}</span></button>)}
  </div>;
  if (nodes.length === 0) {
    return (
      <div
        className={`agent-graph flex items-center justify-center rounded-lg border border-border border-dashed p-4 text-center text-muted-foreground text-xs ${className ?? ""}`}
      >
        {emptyState ?? "No agents yet"}
      </div>
    );
  }
  return (
    <div
      ref={(el) => {
        wrapperRef.current = el;
        measureCanvas(el);
      }}
      className={`agent-graph ag-live${live ? "" : " ag-topology"} relative flex flex-col ${className ?? ""}`}
      tabIndex={-1}
      onKeyDownCapture={event => { if (event.target instanceof HTMLElement && event.target.closest("[data-agent-metrics]")) return; if (event.key === "Tab" && !event.shiftKey && hovered) { event.preventDefault(); document.getElementById(detailsId)?.focus(); return; } if (event.key === "Escape") hideDetails(); handleKeyDown(event); }}
      onFocusCapture={event => { if (!(event.target instanceof HTMLElement) || returningFocus.current) return; keepDetails(); if (event.target.closest("[data-agent-metrics]")) return; if (!event.target.matches(":focus-visible")) { hideDetails(); return; } const node = event.target.closest<HTMLElement>(".react-flow__node, [data-agent-id]"); const id = node?.dataset.id ?? node?.dataset.agentId; hoverTarget.current = node ?? null; setHovered(id && byId.has(id) ? { id, rect: node!.getBoundingClientRect() } : null); }}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget) && (event.relatedTarget as HTMLElement | null)?.id !== detailsId) hideDetails(); }}
      data-layout={narrow ? "list" : layout && shown ? "ready" : "pending"}
      data-columns={layout?.columns}
    >
      {caption}
      {showLatestEvents && live && <LatestEvents agents={nodes} now={now} live={live} selectedId={selectedId} onSelect={onSelect ? select : undefined} />}
      {narrow ? <ul className="ag-graph-viewport ag-phone-list overflow-auto" aria-label="Agents by attention">
        {phoneNodes.slice(first, first + PHONE_PAGE).map(agent => <li key={agent.id} style={{ ["--depth" as string]: depthOf(agent.id) }}>
          <div role="button" tabIndex={0} aria-pressed={selectedId === agent.id} aria-label={agentDescription(agent)} data-agent-id={agent.id} className="ag-phone-select"
            onClick={() => select(agent.id)} onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); select(agent.id); } }}>
            {live
              ? <LiveAgentCardView agent={agent} parentLabel={byId.get(parentOf.get(agent.id) ?? "")?.label} selected={selectedId === agent.id} now={clock} renderEventIcon={renderEventIcon} onOpen={onSelect ? () => select(agent.id) : undefined} />
              : <AgentCardView agent={agent} parentLabel={byId.get(parentOf.get(agent.id) ?? "")?.label} selected={selectedId === agent.id} now={clock} direction={direction} onOpen={onSelect ? () => select(agent.id) : undefined} />}
          </div>
        </li>)}
        {nodes.length > PHONE_PAGE && <li className="flex items-center justify-between gap-2 border-t border-border pt-3 text-sm" aria-label="Agent pages">
          <button type="button" className="rounded px-2 py-1 hover:bg-muted disabled:opacity-40 focus-visible:outline" disabled={!first} onClick={() => { setPhonePage(page => page - 1); wrapperRef.current?.querySelector(".ag-phone-list")?.scrollTo({ top: 0 }); }}>Previous</button><span>{first + 1}–{Math.min(nodes.length, first + PHONE_PAGE)} of {nodes.length}</span><button type="button" className="rounded px-2 py-1 hover:bg-muted disabled:opacity-40 focus-visible:outline" disabled={first + PHONE_PAGE >= nodes.length} onClick={() => { setPhonePage(page => page + 1); wrapperRef.current?.querySelector(".ag-phone-list")?.scrollTo({ top: 0 }); }}>Next</button>
        </li>}
      </ul> : <div className="ag-graph-viewport min-h-0 flex-1" style={{ opacity: shown ? 1 : 0 }}><ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        colorMode={colorMode}
        onInit={(inst) => {
          rfRef.current = inst;
          setReady(true);
        }}
        onNodeClick={handleNodeClick}
        onNodeMouseEnter={(event, node) => { keepDetails(); hoverTarget.current = (event.target as HTMLElement).closest<HTMLElement>(".react-flow__node"); if (hoverTarget.current) setHovered({ id: node.id, rect: hoverTarget.current.getBoundingClientRect() }); }}
        onNodeMouseLeave={leaveDetails}
        proOptions={{ hideAttribution: true }}
        onlyRenderVisibleElements
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        nodesFocusable
        edgesFocusable={false}
        deleteKeyCode={null}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        panOnDrag
        minZoom={minZoom}
        maxZoom={1.75}
        aria-label="Agent topology"
      >
        <Background bgColor="var(--bg-root)" gap={16} size={1} color="hsl(var(--foreground) / 0.06)" />
        {layout && canvas && (layout.width > canvas.width || layout.height > canvas.height) && (
          <MiniMap
            pannable
            zoomable
            position="bottom-left"
            style={{ width: 168, height: 104 }}
            className="!hidden sm:!block"
            ariaLabel="Agent topology overview"
          />
        )}
        <Controls
          showInteractive={false}
          position="bottom-right"
          fitViewOptions={{ padding: `${FIT_PADDING}px`, minZoom, maxZoom: 1, nodes: live ? undefined : topology.agentIds.slice(0, 2).map(id => ({ id })) }}
        />
      </ReactFlow></div>}
      {hovered && byId.has(hovered.id) && <AgentMetrics anchor={wrapperRef.current} mode={colorMode} id={detailsId} agent={byId.get(hovered.id)!} rect={hovered.rect} onEnter={keepDetails} onLeave={leaveDetails} onClose={() => { hideDetails(); returningFocus.current = true; hoverTarget.current?.focus({ preventScroll: true }); returningFocus.current = false; }} />}
    </div>
  );
}

/** Metrics stay at reading size outside the zoomed canvas and its clipping container. */
function AgentMetrics({ anchor, mode, id, agent, rect, onEnter, onLeave, onClose }: { anchor: HTMLElement | null; mode: string; id: string; agent: AgentGraphProps["nodes"][number]; rect: DOMRect; onEnter: () => void; onLeave: () => void; onClose: () => void }) {
  const [theme, setTheme] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    if (!anchor) return;
    const read = () => { const css = getComputedStyle(anchor); setTheme(Object.fromEntries(Array.from(css).filter(name => name.startsWith("--") && !name.startsWith("--tw-")).map(name => [name, css.getPropertyValue(name)])) as CSSProperties); };
    read();
    const observer = new MutationObserver(read);
    for (let el: HTMLElement | null = anchor; el; el = el.parentElement) observer.observe(el, { attributes: true, attributeFilter: ["class", "style", "data-theme", "data-sandbox-theme"] });
    return () => observer.disconnect();
  }, [anchor]);
  const facts = new Map([{ label: "Tokens", value: fmtTokenTotal(agent.tokens) ?? "Not recorded" }, { label: "Cost", value: fmtCost(agent.costUsd ?? undefined) ?? "Not recorded" }, ...(agent.facts ?? [])].map(fact => [fact.label.toLowerCase(), fact]));
  const width = Math.min(420, window.innerWidth - 24), height = Math.min(560, window.innerHeight - 24);
  const left = Math.max(12, Math.min(rect.right + 12 + width <= window.innerWidth ? rect.right + 12 : rect.left - width - 12, window.innerWidth - width - 12));
  return createPortal(<div id={id} data-agent-metrics data-theme={anchor?.closest("[data-theme]")?.getAttribute("data-theme") ?? mode} role="tooltip" tabIndex={0} onMouseEnter={onEnter} onMouseLeave={onLeave} onWheel={event => event.stopPropagation()} onBlur={onLeave} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); onClose(); } }} className={`${mode} rounded-xl border border-border bg-card p-4 text-sm text-foreground shadow-xl`} style={{ ...theme, colorScheme: mode, position: "fixed", zIndex: 1000, width, maxHeight: height, overflow: "auto", left, top: Math.max(12, Math.min(rect.top, window.innerHeight - height - 12)) }}>
    <div className="mb-2 flex items-center justify-between gap-3"><strong>{agent.label}</strong><span>{agentStatus(agent.status).label}</span></div>
    <p className="mb-3 text-muted-foreground">{[agent.model, agent.harness, agent.role].filter(Boolean).join(" · ")}</p>
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-5 gap-y-1.5">
      {[...facts.values()].map(fact => <div key={fact.label} className="contents"><dt className="min-w-0 break-words text-muted-foreground">{fact.label}</dt><dd className="m-0 min-w-0 max-w-64 whitespace-normal break-words text-right tabular-nums">{fact.value}</dd></div>)}
    </dl>
    {agent.status === "failed" && <p className="mt-3 whitespace-pre-wrap break-words text-[var(--surface-danger-text)]">{agent.result ?? agent.turn ?? "Failure cause not recorded"}</p>}
  </div>, document.body);
}
