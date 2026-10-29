/**
 * Where everything sits on the `AgentGraph` hub layout: the orchestrator in the
 * middle, the agents it runs on the rings around it, each tool one cell further
 * out beside the agent that uses it, and "You" above the ring. Positions are
 * grid cells, so a call or a status change never moves a node, and edges are
 * orthogonal paths with rounded elbows that leave through empty cells.
 */

import type { AgentGraphEdge, AgentGraphNode } from "./agent-graph-layout";

/** A tool or service an agent calls: drawn as an outer node with its brand mark. */
export interface AgentGraphTool {
  id: string;
  label: string;
  /** Brand id for `ProviderIcon` ("github", "slack", "postgres"…). */
  provider?: string | null;
  /** One line under the name in its popover, e.g. "Postgres, read-only". */
  detail?: string | null;
}

export type AgentGraphCallKind = "call" | "answer" | "needs-you" | "failed";

/** One recorded call between two nodes ("you", an agent id or a tool id). */
export interface AgentGraphCall {
  id: string;
  from: string;
  to: string;
  kind: AgentGraphCallKind;
  /** What was asked or answered, one line. */
  label?: string | null;
  /** Epoch ms. */
  startedAt: number;
  /** Absent while it runs. */
  durationMs?: number | null;
}

/** The id the "You" node takes in `calls`. */
export const YOU_ID = "you";

export type HubNodeKind = "you" | "hub" | "agent" | "tool";

export interface HubNodePlacement {
  id: string;
  kind: HubNodeKind;
  /** Grid cell; the hub is (0, 0). */
  col: number;
  row: number;
}

export interface HubLink {
  from: string;
  to: string;
}

export interface HubMetrics {
  cellX: number;
  cellY: number;
  tile: number;
  hubTile: number;
  /** Room under a tile for its two label lines. */
  label: number;
}

export const HUB_METRICS: HubMetrics = { cellX: 184, cellY: 140, tile: 48, hubTile: 60, label: 34 };

const key = (col: number, row: number) => `${col},${row}`;

/** Ring cells around the hub, nearest first: the diagonals, then the sides, then ring two by angle. */
function ringCells(count: number): [number, number][] {
  const cells: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1], [-1, 0], [1, 0], [0, 1], [0, -1]];
  for (let ring = 2; cells.length < count; ring++) {
    const outer: [number, number][] = [];
    for (let c = -ring; c <= ring; c++) for (let r = -ring; r <= ring; r++) {
      if (Math.max(Math.abs(c), Math.abs(r)) === ring) outer.push([c, r]);
    }
    outer.sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
    cells.push(...outer);
  }
  return cells.slice(0, count);
}

/** The orchestrator: the agent nobody spawned, else the first. */
export function hubAgentId(nodes: readonly AgentGraphNode[], edges: readonly AgentGraphEdge[]): string | undefined {
  const spawned = new Set(edges.filter((e) => e.kind === "spawn").map((e) => e.to));
  return (nodes.find((n) => !spawned.has(n.id)) ?? nodes[0])?.id;
}

export interface HubLayout {
  placements: HubNodePlacement[];
  links: HubLink[];
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
}

/**
 * Place every node on the grid. Agents take ring cells in order; each tool takes
 * the first free cell outward from the first agent that called it (beside, then
 * above or below, then diagonal), so it sits next to its user.
 */
export function layoutHub(input: {
  nodes: readonly AgentGraphNode[];
  edges: readonly AgentGraphEdge[];
  tools: readonly AgentGraphTool[];
  calls: readonly AgentGraphCall[];
  you: boolean;
}): HubLayout {
  const { nodes, edges, tools, calls, you } = input;
  const hub = hubAgentId(nodes, edges);
  const placements: HubNodePlacement[] = [];
  const taken = new Set<string>();
  const place = (id: string, kind: HubNodeKind, col: number, row: number) => {
    placements.push({ id, kind, col, row });
    taken.add(key(col, row));
  };
  if (hub) place(hub, "hub", 0, 0);
  const agents = nodes.filter((n) => n.id !== hub);
  ringCells(agents.length).forEach(([c, r], i) => place(agents[i]!.id, "agent", c, r));
  const ring = Math.max(1, ...placements.map((p) => Math.max(Math.abs(p.col), Math.abs(p.row))));

  // "You" sits above the ring, left of the hub's column so its edge runs down an empty lane.
  if (you) {
    const col = -Math.min(ring, 1);
    let row = -ring - 1;
    while (taken.has(key(col, row))) row--;
    place(YOU_ID, "you", col, row);
  }

  const cell = new Map(placements.map((p) => [p.id, p]));
  const userOf = new Map<string, string>();
  for (const call of calls) {
    const toolId = tools.some((t) => t.id === call.to) ? call.to : tools.some((t) => t.id === call.from) ? call.from : undefined;
    const agentId = toolId === call.to ? call.from : call.to;
    if (toolId && cell.has(agentId) && !userOf.has(toolId)) userOf.set(toolId, agentId);
  }
  for (const tool of tools) {
    const owner = cell.get(userOf.get(tool.id) ?? hub ?? "");
    const ac = owner?.col ?? 0, ar = owner?.row ?? 0;
    const sx = Math.sign(ac) || 1, sy = Math.sign(ar) || 1;
    const options: [number, number][] = ac === 0
      ? [[0, sy], [sx, sy], [-sx, sy], [sx, 0]]
      : ar === 0 ? [[sx, 0], [sx, -1], [sx, 1], [0, -1]]
      : [[sx, 0], [0, sy], [sx, sy], [-sx, sy], [sx, -sy]];
    let spot: [number, number] | undefined;
    for (let step = 1; !spot && step < 6; step++) {
      for (const [dx, dy] of options) {
        const c = ac + dx * step, r = ar + dy * step;
        if (!taken.has(key(c, r))) { spot = [c, r]; break; }
      }
    }
    place(tool.id, "tool", spot![0], spot![1]);
    cell.set(tool.id, placements.at(-1)!);
  }

  const links: HubLink[] = [];
  const seen = new Set<string>();
  const link = (from: string, to: string) => {
    const k = [from, to].sort().join("|");
    if (from === to || seen.has(k) || !taken.size) return;
    seen.add(k);
    links.push({ from, to });
  };
  if (you && hub) link(YOU_ID, hub);
  for (const agent of agents) {
    const parent = edges.find((e) => e.kind === "spawn" && e.to === agent.id)?.from;
    link(parent && cell.has(parent) ? parent : hub!, agent.id);
  }
  for (const call of calls) if (cell.has(call.from) && cell.has(call.to)) link(call.from, call.to);

  return {
    placements,
    links,
    minCol: Math.min(...placements.map((p) => p.col)),
    maxCol: Math.max(...placements.map((p) => p.col)),
    minRow: Math.min(...placements.map((p) => p.row)),
    maxRow: Math.max(...placements.map((p) => p.row)),
  };
}

export interface Point { x: number; y: number }
export interface HubBounds { left: number; right: number; top: number; bottom: number }

/**
 * A short rounded Manhattan route around tile and label bounds. Departure lanes
 * separate parallel calls; the path length keeps finite trips at a consistent speed.
 */
export function orthogonalPath(a: Point, b: Point, verticalFirst: boolean, lane = 0, radius = 10, obstacles: readonly HubBounds[] = []): { d: string; length: number } {
  const clear = (p: Point, q: Point) => obstacles.every(rect => p.x === q.x
    ? p.x <= rect.left || p.x >= rect.right || Math.max(p.y, q.y) <= rect.top || Math.min(p.y, q.y) >= rect.bottom
    : p.y <= rect.top || p.y >= rect.bottom || Math.max(p.x, q.x) <= rect.left || Math.min(p.x, q.x) >= rect.right);
  const xs = [...new Set([a.x + lane, (a.x + b.x) / 2, ...obstacles.flatMap(rect => [rect.left - 8, rect.right + 8])])];
  const ys = [...new Set([a.y + lane, (a.y + b.y) / 2, ...obstacles.flatMap(rect => [rect.top - 8, rect.bottom + 8])])];
  const candidates: Point[][] = [[a, { x: a.x, y: b.y }, b], [a, { x: b.x, y: a.y }, b]];
  for (const x of xs) candidates.push([a, { x, y: a.y }, { x, y: b.y }, b]);
  for (const y of ys) candidates.push([a, { x: a.x, y }, { x: b.x, y }, b]);
  for (const x of xs) for (const y of ys) {
    candidates.push([a, { x: a.x, y }, { x, y }, { x, y: b.y }, b], [a, { x, y: a.y }, { x, y }, { x: b.x, y }, b]);
  }
  let points = candidates[verticalFirst ? 0 : 1]!, best = Infinity;
  for (const candidate of candidates) {
    const path = candidate.filter((p, i) => !i || p.x !== candidate[i - 1]!.x || p.y !== candidate[i - 1]!.y);
    if (!path.slice(1).every((point, i) => clear(path[i]!, point))) continue;
    const distance = path.slice(1).reduce((sum, point, i) => sum + Math.abs(point.x - path[i]!.x) + Math.abs(point.y - path[i]!.y), 0);
    const trunk = path.find((point, i) => i && point.y !== path[i - 1]!.y)?.x ?? a.x;
    const score = distance + path.length + (lane ? Math.abs(trunk - a.x - lane) : 0);
    if (score < best) { best = score; points = path; }
  }
  points = points.filter((point, i) => !i || i === points.length - 1 || !(points[i - 1]!.x === point.x && point.x === points[i + 1]!.x || points[i - 1]!.y === point.y && point.y === points[i + 1]!.y));
  let d = `M${a.x},${a.y}`, length = 0;
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1]!, point = points[i]!, next = points[i + 1];
    const incoming = Math.hypot(point.x - previous.x, point.y - previous.y);
    length += incoming;
    if (!next) { d += ` L${point.x},${point.y}`; continue; }
    const outgoing = Math.hypot(next.x - point.x, next.y - point.y), r = Math.min(radius, incoming / 2, outgoing / 2);
    d += ` L${point.x - Math.sign(point.x - previous.x) * r},${point.y - Math.sign(point.y - previous.y) * r} Q${point.x},${point.y} ${point.x + Math.sign(next.x - point.x) * r},${point.y + Math.sign(next.y - point.y) * r}`;
    length -= 2 * r - Math.PI * r / 2;
  }
  return { d, length };
}
