/**
 * Stable desktop geometry for AgentGraph. Spawn edges determine the tree and
 * packed leaf groups; message and delegation edges never move cards.
 * ELK lays out candidate column counts; a row-per-depth fallback keeps the
 * graph usable without that optional peer. Narrow containers use Canvas's list.
 */

import type { ElkNode } from "elkjs/lib/elk-api";
import { loadElk } from "./elk-loader";

export type AgentGraphStatus =
  | "running"
  | "waiting"
  /** Blocked on a person: drawn amber, named in the header. */
  | "needs-you"
  | "succeeded"
  | "failed"
  | "stopped"
  | "idle"
  | "unknown";

export interface AgentGraphNode {
  id: string;
  /** The agent's name, e.g. "root", "memscale". */
  label: string;
  /** What it was started as, e.g. "manager", "v6-battery". */
  role?: string | null;
  /** The coding harness it runs in, e.g. "opencode", "claude-code", "codex". */
  harness?: string | null;
  /** The model it runs, e.g. "glm-5.3-flash"; its brand mark identifies the card. */
  model?: string | null;
  status: AgentGraphStatus;
  /** What it is doing now, or did last — one line. */
  turn?: string | null;
  costUsd?: number | null;
  tokens?: number | null;
  /** Recorded metrics with units; retained in pointer and keyboard detail cards. */
  facts?: readonly { label: string; value: string }[];
  /** Live cards: what it is doing now, from its real state; the card carries it as `data-activity` for hosts to style. */
  activity?: AgentGraphActivity | null;
  /** Live cards: its latest tool calls or events, oldest first; the card shows the last three. */
  events?: readonly AgentGraphEvent[] | null;
  /** Recorded activity and full-stream median, when the visible event tail is bounded. Epoch milliseconds. */
  lastActivityAt?: number;
  /** Median interval between recorded events, in milliseconds. */
  medianEventGapMs?: number;
  /** Live cards: the reasoning effort it runs at, e.g. "high". */
  effort?: string | null;
  /** Live cards: epoch ms it was spawned, for its time alive. */
  startedAt?: number | null;
  /** Live cards: commits it shipped. */
  commits?: number | null;
  /** Live cards: a settled agent's result in its compact row, e.g. "rc2 · 14 commits". */
  result?: string | null;
}

export type AgentGraphActivity = "thinking" | "reading" | "building" | "proving" | "writing" | "waiting" | "restarting";

export interface AgentGraphEvent {
  id: string;
  /** One line, e.g. "bash cargo test -p prover". */
  label: string;
  at?: number;
}

export type AgentGraphEdgeKind = "spawn" | "message" | "delegation";

export interface AgentGraphEdge {
  from: string;
  to: string;
  kind: AgentGraphEdgeKind;
  /** How many times it happened; a badge shows counts above one. */
  count?: number;
  label?: string;
}

export type AgentGraphDirection = "TB" | "LR";

/** Every agent card's size. Fixed, so a status or turn update never moves a card. */
export const AGENT_CARD = { width: 232, height: 112 } as const;
/** A live card: room for the header, a two-line thinking line and the last three events. Fixed for the same reason. */
export const LIVE_AGENT_CARD = { width: 296, height: 164 } as const;

export type CardSize = { readonly width: number; readonly height: number };
/** A parent with at least this many leaf workers draws them as a grid. */
export const GRID_MIN_LEAVES = 4;
const GRID_GAP = 10;
const FRAME_PAD = 12;
/** The manager stays with its workers instead of reserving an otherwise empty tree layer. */
export const FRAME_CAPTION = 80;
const LAYER_GAP = 56;
const SIBLING_GAP = 24;

/** A parent's leaf workers, drawn as one grid in one frame. */
export interface AgentLeafGroup {
  id: string;
  parentId: string;
  memberIds: readonly string[];
}

/** The run's tree as the layout reads it: valid, de-duplicated spawn edges and
 *  the leaf groups they produce. */
export interface AgentTopology {
  /** Changes only when the tree does, never on a status update. */
  key: string;
  agentIds: readonly string[];
  spawns: readonly { from: string; to: string }[];
  groups: readonly AgentLeafGroup[];
  /** Agent id → the group drawing it, for grouped agents only. */
  groupOf: ReadonlyMap<string, string>;
}

export function buildAgentTopology(
  nodes: readonly AgentGraphNode[],
  edges: readonly AgentGraphEdge[],
): AgentTopology {
  const ids = new Set<string>();
  const agentIds: string[] = [];
  for (const n of nodes) {
    if (ids.has(n.id)) continue;
    ids.add(n.id);
    agentIds.push(n.id);
  }
  const seen = new Set<string>();
  const spawns: { from: string; to: string }[] = [];
  const children = new Map<string, string[]>();
  const parentCount = new Map<string, number>();
  for (const e of edges) {
    if (e.kind !== "spawn" || e.from === e.to) continue;
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    const key = `${e.from}\u0000${e.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    spawns.push({ from: e.from, to: e.to });
    children.set(e.from, [...(children.get(e.from) ?? []), e.to]);
    parentCount.set(e.to, (parentCount.get(e.to) ?? 0) + 1);
  }
  const groups: AgentLeafGroup[] = [];
  const groupOf = new Map<string, string>();
  for (const parentId of agentIds) {
    const leaves = (children.get(parentId) ?? []).filter(
      (c) => !children.has(c) && parentCount.get(c) === 1,
    );
    if (leaves.length < GRID_MIN_LEAVES) continue;
    const id = `agent-group:${parentId}`;
    groups.push({ id, parentId, memberIds: leaves });
    for (const leaf of leaves) groupOf.set(leaf, id);
  }
  return {
    key: JSON.stringify([agentIds, spawns.map((s) => [s.from, s.to])]),
    agentIds,
    spawns,
    groups,
    groupOf,
  };
}

export interface AgentFrame {
  group: AgentLeafGroup;
  x: number;
  y: number;
  width: number;
  height: number;
  collapsed?: boolean;
}

export interface AgentLayout {
  /** The grid column count this layout was made with. */
  columns: number;
  /** Top-left corner of every agent card. */
  positions: ReadonlyMap<string, { x: number; y: number }>;
  frames: readonly AgentFrame[];
  width: number;
  height: number;
}

function gridSize(members: number, columns: number, card: CardSize, collapsed = false): { width: number; height: number } {
  if (collapsed) return { width: card.width + 2 * FRAME_PAD, height: FRAME_CAPTION };
  const cols = Math.max(1, Math.min(columns, members));
  const rows = Math.ceil(members / cols);
  return {
    width: cols * card.width + (cols - 1) * GRID_GAP + 2 * FRAME_PAD,
    height:
      FRAME_CAPTION + rows * card.height + (rows - 1) * GRID_GAP + FRAME_PAD,
  };
}

interface Unit extends CardSize {
  id: string;
}

/** The boxes the layouter places: each ungrouped agent, and each grid as one block. */
function layoutUnits(topology: AgentTopology, columns: number, card: CardSize, collapsed: ReadonlySet<string>, groupParents: boolean) {
  const ownerGroup = new Map(groupParents ? topology.groups.map(group => [group.parentId, group.id]) : []);
  const units: Unit[] = topology.agentIds.filter(id => !topology.groupOf.has(id) && !ownerGroup.has(id)).map(id => ({ id, ...card }));
  units.push(...topology.groups.map(group => ({ id: group.id, ...gridSize(group.memberIds.length, columns, card, collapsed.has(group.id)) })));
  const unitOf = (id: string) => topology.groupOf.get(id) ?? ownerGroup.get(id) ?? id;
  const seen = new Set<string>();
  const links = topology.spawns.flatMap(spawn => {
    const from = unitOf(spawn.from), to = unitOf(spawn.to), key = `${from}\u0000${to}`;
    if (from === to || seen.has(key)) return [];
    seen.add(key);
    return [{ from, to }];
  });
  return { units, links };
}

async function placeWithElk(
  units: readonly Unit[],
  links: readonly { from: string; to: string }[],
  direction: AgentGraphDirection,
): Promise<Map<string, { x: number; y: number }> | null> {
  const elk = await loadElk();
  if (!elk) return null;
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction === "LR" ? "RIGHT" : "DOWN",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
      "elk.layered.spacing.nodeNodeBetweenLayers": String(LAYER_GAP),
      "elk.spacing.nodeNode": String(SIBLING_GAP),
      "elk.spacing.componentComponent": String(SIBLING_GAP * 2),
      "elk.separateConnectedComponents": "true",
      "elk.padding": "[top=0,left=0,bottom=0,right=0]",
    },
    children: units.map((u) => ({ id: u.id, width: u.width, height: u.height })),
    edges: links.map((l, i) => ({ id: `e${i}`, sources: [l.from], targets: [l.to] })),
  };
  try {
    const out = await elk.layout(graph);
    const at = new Map<string, { x: number; y: number }>();
    for (const c of out.children ?? []) at.set(c.id, { x: c.x ?? 0, y: c.y ?? 0 });
    return at;
  } catch {
    return null;
  }
}

/** Without ELK: one row (TB) or column (LR) per spawn depth, each centred. */
function placeByDepth(
  units: readonly Unit[],
  links: readonly { from: string; to: string }[],
  direction: AgentGraphDirection,
): Map<string, { x: number; y: number }> {
  const parents = new Map<string, string[]>();
  for (const l of links) parents.set(l.to, [...(parents.get(l.to) ?? []), l.from]);
  const depth = new Map<string, number>();
  const depthOf = (id: string, path: Set<string>): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (path.has(id)) return 0;
    path.add(id);
    const d = Math.max(-1, ...(parents.get(id) ?? []).map((p) => depthOf(p, path))) + 1;
    path.delete(id);
    depth.set(id, d);
    return d;
  };
  const layers: Unit[][] = [];
  for (const u of units) (layers[depthOf(u.id, new Set())] ??= []).push(u);
  const along = (u: Unit) => (direction === "TB" ? u.width : u.height);
  const across = (u: Unit) => (direction === "TB" ? u.height : u.width);
  const extents = layers.map(
    (l) => l.reduce((sum, u) => sum + along(u), 0) + (l.length - 1) * SIBLING_GAP,
  );
  const widest = Math.max(...extents);
  const at = new Map<string, { x: number; y: number }>();
  let offset = 0;
  layers.forEach((layer, i) => {
    let cursor = (widest - extents[i]) / 2;
    for (const u of layer) {
      at.set(u.id, direction === "TB" ? { x: cursor, y: offset } : { x: offset, y: cursor });
      cursor += along(u) + SIBLING_GAP;
    }
    offset += Math.max(...layer.map(across)) + LAYER_GAP;
  });
  return at;
}

/** Lay the run out with every grid `columns` wide. */
export async function layoutAgents(
  topology: AgentTopology,
  direction: AgentGraphDirection,
  columns: number,
  card: CardSize = AGENT_CARD,
  collapsed: ReadonlySet<string> = new Set(),
  groupParents = true,
): Promise<AgentLayout> {
  const { units, links } = layoutUnits(topology, columns, card, collapsed, groupParents);
  const placed =
    (await placeWithElk(units, links, direction)) ?? placeByDepth(units, links, direction);
  const positions = new Map<string, { x: number; y: number }>();
  const frames: AgentFrame[] = [];
  let width = 0;
  let height = 0;
  for (const u of units) {
    const p = placed.get(u.id) ?? { x: 0, y: 0 };
    width = Math.max(width, p.x + u.width);
    height = Math.max(height, p.y + u.height);
    positions.set(u.id, p);
  }
  for (const g of topology.groups) {
    const origin = positions.get(g.id) ?? { x: 0, y: 0 };
    positions.delete(g.id);
    const closed = collapsed.has(g.id);
    const size = gridSize(g.memberIds.length, columns, card, closed);
    frames.push({ group: g, ...origin, ...size, collapsed: closed });
    positions.set(g.parentId, groupParents ? { x: origin.x + FRAME_PAD, y: origin.y + 8 } : { ...positions.get(g.parentId)!, y: origin.y });
    if (closed) continue;
    const cols = Math.max(1, Math.min(columns, g.memberIds.length));
    g.memberIds.forEach((id, i) => {
      positions.set(id, {
        x: origin.x + FRAME_PAD + (i % cols) * (card.width + GRID_GAP),
        y: origin.y + FRAME_CAPTION + Math.floor(i / cols) * (card.height + GRID_GAP),
      });
    });
  }
  return { columns, positions, frames, width, height };
}
