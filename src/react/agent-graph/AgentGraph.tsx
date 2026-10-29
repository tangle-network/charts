import { GraphMarksProvider, type GraphMarks } from "./marks";
/**
 * `AgentGraph` — the topology of a multi-agent run, for a run page's side pane.
 *
 * Lazy and error-isolated like `WorkflowGraph`: React Flow and ELK load on
 * first render, a transient chunk failure retries, and a graph that cannot
 * render degrades to a plain list of the agents (still selectable) instead of
 * taking the pane down.
 */

import { lazy, type ReactNode, Suspense, useMemo, useState } from "react";
import type {
  AgentGraphDirection,
  AgentGraphEvent,
  AgentGraphEdge,
  AgentGraphNode,
} from "./agent-graph-layout";
import { AgentHubCanvas } from "./AgentHubCanvas";
import type { AgentGraphCall, AgentGraphTool } from "./agent-hub-layout";
import { GraphErrorBoundary, retryImport } from "./graph-lazy";

export type { AgentGraphCall, AgentGraphCallKind, AgentGraphTool } from "./agent-hub-layout";
export type {
  AgentGraphActivity,
  AgentGraphDirection,
  AgentGraphEvent,
  AgentGraphEdge,
  AgentGraphEdgeKind,
  AgentGraphNode,
  AgentGraphStatus,
} from "./agent-graph-layout";

export interface AgentGraphProps extends GraphMarks {
  nodes: readonly AgentGraphNode[];
  /** `spawn` edges shape the tree; `message` and `delegation` edges are drawn
   *  over it as dashed curves and never move a card. */
  edges: readonly AgentGraphEdge[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Tree direction. Default `TB` (root at the top). */
  direction?: AgentGraphDirection;
  /** Sizes the canvas; the graph fills it. Give it a height. */
  className?: string;
  /** Shown instead of the canvas when there are no agents. */
  emptyState?: ReactNode;
  /**
   * `tree` (default) lays out a spawn tree of cards for large runs. `hub` draws
   * the run around its orchestrator: You, the agents, the tools they call, and
   * each call travelling along its edge in its kind's colour.
   */
  layout?: "tree" | "hub";
  /** Hub tools/services. Omit unreported inventory; [] records no tools. */
  tools?: readonly AgentGraphTool[];
  /** Hub calls, newest last. Omit unreported history; [] records no calls. They colour edges and fill popovers. */
  calls?: readonly AgentGraphCall[];
  /** Hub layout: draw the person who asked as "You". */
  you?: { label?: string; summary?: string } | boolean;
  /** Hub layout and live cards: epoch ms to draw at (a replay position); defaults to now, ticking. */
  now?: number;
  /** Hub layout: the header title. Default "Agent graph". */
  title?: ReactNode;
  /**
   * Tree layout: readable task summaries, the latest three events and model/accounting details. Desktop slots stay
   * fixed through status updates; completed results compact while failures retain their evidence. Phones preserve
   * their initial attention order. Only the running dot breathes; commands update without routine sliding.
   */
  live?: boolean;
  /** Host tool identity, such as charts' toolGlyph(event.label). Core graphs need no charts dependency. */
  renderEventIcon?: (event: AgentGraphEvent) => ReactNode;
  /** Live tree activity; false when a shared workspace already supplies its strip. */
  showLatestEvents?: boolean;
}

function lazyCanvas() {
  return lazy(() =>
    retryImport(() =>
      import("./AgentGraphCanvas").then((m) => ({ default: m.AgentGraphCanvas })),
    ),
  );
}

/** The agents as a list, for when the canvas cannot load. */
function AgentListFallback({
  nodes,
  selectedId,
  onSelect,
  className,
  onRetry,
}: AgentGraphProps & { onRetry: () => void }) {
  return (
    <div className={`agent-graph overflow-auto rounded-lg border border-border bg-background p-2 ${className ?? ""}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">Couldn't draw the graph — showing the agents.</p>
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded border border-border px-1.5 py-0.5 text-muted-foreground text-xs transition hover:text-foreground"
        >
          Retry
        </button>
      </div>
      <ul className="space-y-0.5">
        {nodes.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              aria-pressed={selectedId === n.id}
              onClick={() => onSelect?.(n.id)}
              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-foreground text-xs hover:bg-muted aria-pressed:bg-muted"
            >
              <span className="truncate">{n.label}</span>
              <span className="shrink-0 text-muted-foreground">{n.status}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AgentGraphBody(props: AgentGraphProps) {
  if (props.layout === "hub") {
    if (props.nodes.length === 0 && props.emptyState) return <>{props.emptyState}</>;
    return <AgentHubCanvas {...props} />;
  }
  return <AgentGraphTree {...props} />;
}

function AgentGraphTree(props: AgentGraphProps) {
  const [attempt, setAttempt] = useState(0);
  // A fresh lazy() per attempt: React.lazy caches a rejected import.
  const Canvas = useMemo(() => lazyCanvas(), [attempt]);
  return (
    <GraphErrorBoundary
      key={attempt}
      fallback={<AgentListFallback {...props} onRetry={() => setAttempt((a) => a + 1)} />}
    >
      <Suspense
        fallback={
          <div
            className={`agent-graph flex items-center justify-center rounded-lg border border-border border-dashed text-muted-foreground text-xs ${props.className ?? ""}`}
          >
            Loading graph…
          </div>
        }
      >
        <Canvas {...props} />
      </Suspense>
    </GraphErrorBoundary>
  );
}

export function AgentGraph(props: AgentGraphProps) {
  return <GraphMarksProvider value={props}><AgentGraphBody {...props} /></GraphMarksProvider>;
}
