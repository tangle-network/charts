import { RunStatusIcon, statusMeta } from "@tangle-network/ui/run/status-meta";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AgentGraphNode, AgentGraphStatus } from "./agent-graph-layout";
import { tokenMilliseconds } from "./run-ui-state";
import { useRunNow } from "@tangle-network/ui/hooks/use-live-time";
import { fmtEventTime } from "./format";

export interface LatestEventsProps {
  agents: readonly AgentGraphNode[];
  n?: number;
  now?: number;
  /** Observe incoming status changes. Disable when scrubbing a trace without an epoch. */
  live?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}
type Entry = { id: string; agentId: string; name: string; label: string; at?: number; status: AgentGraphStatus; observed?: boolean };

function EventRow({ entry, now, onSelect }: { entry: Entry; now: number; onSelect?: (entry: Entry) => void }) {
  const meta = statusMeta(entry.observed ? entry.status : "unknown"), age = fmtEventTime(entry.at, now);
  return <li><button type="button" disabled={!onSelect} onClick={() => onSelect?.(entry)} title={entry.name + ": " + entry.label}>
    <span className="ag-latest-dot" style={{ background: entry.observed ? "var(" + meta.token + ")" : "transparent", border: entry.observed ? undefined : "1.5px solid var(" + meta.token + ")" }} aria-hidden />
    <strong>{entry.name}</strong>
    {entry.observed && <span className="ag-latest-state" style={{ color: "var(" + meta.token + ")" }}>{entry.status !== "running" && <RunStatusIcon status={entry.status} size={14} aria-hidden />}{meta.label}</span>}
    <span className="ag-latest-label">{entry.label}</span>
    <time>{entry.observed ? "Observed " : ""}{age}{age !== "now" && age !== "—" ? " ago" : ""}</time>
  </button></li>;
}

/** Recorded events and locally observed state changes. Hover or focus holds the reading position. */
export function LatestEvents({ agents, n = 5, now, live = now === undefined, selectedId, onSelect }: LatestEventsProps) {
  const clock = useRunNow(now), limit = Number.isFinite(n) ? Math.max(1, Math.trunc(n)) : 5;
  const latest = useMemo(() => agents.flatMap(agent => (agent.events ?? []).map(event => ({
    id: agent.id + ":" + event.id, agentId: agent.id, name: agent.label, label: event.label, at: event.at, status: agent.status,
  }))).sort((a, b) => (Number.isFinite(b.at) ? b.at! : -Infinity) - (Number.isFinite(a.at) ? a.at! : -Infinity) || a.id.localeCompare(b.id)).slice(0, limit), [agents, limit]);
  const [rows, setRows] = useState<Entry[]>(latest), [pins, setPins] = useState<Entry[]>([]), [announcement, setAnnouncement] = useState("");
  const [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false), paused = hovered || focused;
  const source = useRef(latest), pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const announce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), messages = useRef(new Map<string, string>());
  source.current = latest;
  const previous = useRef(new Map(agents.map(agent => [agent.id, agent.status])));
  useEffect(() => {
    const changes: Entry[] = agents.filter(agent => previous.current.has(agent.id) && previous.current.get(agent.id) !== agent.status).map(agent => ({
      id: agent.id + ":status:" + clock, agentId: agent.id, name: agent.label, status: agent.status, label: agent.result ?? agent.turn ?? "Status changed", at: clock, observed: true,
    }));
    previous.current = new Map(agents.map(agent => [agent.id, agent.status]));
    if (!live) { setPins(old => old.length ? [] : old); messages.current.clear(); clearTimeout(announce.current); announce.current = undefined; return; }
    const ids = new Set(agents.map(agent => agent.id));
    setPins(old => {
      const next = [...changes, ...old.filter(entry => ids.has(entry.agentId) && !changes.some(change => change.agentId === entry.agentId))].slice(0, limit);
      return !changes.length && next.length === old.length ? old : next;
    });
    if (!changes.length) return;
    for (const entry of changes) messages.current.set(entry.agentId, entry.name + ": " + statusMeta(entry.status).label);
    if (announce.current === undefined) announce.current = setTimeout(() => { setAnnouncement([...messages.current.values()].join("; ")); messages.current.clear(); announce.current = undefined; }, tokenMilliseconds("--duration-ambient"));
  }, [agents, clock, limit, live]);
  useEffect(() => { if (selectedId) setPins(old => old.filter(entry => entry.agentId !== selectedId)); }, [selectedId]);
  useEffect(() => {
    if (paused) { clearTimeout(pending.current); pending.current = undefined; return; }
    if (pending.current === undefined) pending.current = setTimeout(() => { setRows(source.current); pending.current = undefined; }, tokenMilliseconds("--duration-ambient") / 2);
  }, [latest, paused]);
  useEffect(() => () => { clearTimeout(pending.current); clearTimeout(announce.current); }, []);
  const current = [...pins, ...rows.filter(entry => !pins.some(pin => pin.agentId === entry.agentId))].slice(0, limit);
  const held = useRef(current);
  useLayoutEffect(() => { if (!paused) held.current = current; }, [current, paused]);
  const visible = paused ? held.current : current;
  const refresh = () => { setRows([...source.current]); held.current = [...pins, ...source.current.filter(entry => !pins.some(pin => pin.agentId === entry.agentId))].slice(0, limit); };
  return <section className="ag-latest" aria-label="Latest activity" tabIndex={0} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <header><strong>Latest activity</strong><span>{paused ? "Paused while reading" : "Recorded events · age"}</span>{paused && <button type="button" onClick={refresh}>Show latest</button>}</header>
    <ol tabIndex={0} aria-label="Recorded activity events">
      {visible.length ? visible.map(entry => <EventRow key={entry.id} entry={entry} now={clock} onSelect={onSelect ? item => { setPins(old => old.filter(pin => pin.agentId !== item.agentId)); onSelect(item.agentId); } : undefined} />) : <li className="ag-latest-empty">No activity events were reported.</li>}
    </ol>
    <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
  </section>;
}
