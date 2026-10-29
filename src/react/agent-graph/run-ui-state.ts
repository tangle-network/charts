import { quietGap } from "../flow-waterfall-model";
import { statusMeta } from "@tangle-network/ui/run";
import { type AnimationEvent, type CSSProperties, type RefObject, useEffect, useSyncExternalStore } from "react";
import type { AgentGraphNode } from "./agent-graph-layout";

const listeners = new Set<() => void>();
let clock = Date.now();
let timer: ReturnType<typeof setTimeout> | undefined;
function tick() {
  clock = Date.now();
  for (const listener of listeners) listener();
  timer = setTimeout(tick, 1000 - Date.now() % 1000);
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) tick();
  return () => { listeners.delete(listener); if (!listeners.size) clearTimeout(timer); };
}
const noSubscribe = () => () => {};
export function useRunNow(fixed?: number) {
  const now = useSyncExternalStore(fixed === undefined ? subscribe : noSubscribe, () => fixed ?? clock, () => fixed ?? 0);
  return fixed ?? now;
}
const motionQuery = () => typeof matchMedia === "undefined" ? null : matchMedia("(prefers-reduced-motion: reduce)");
const subscribeMotion = (listener: () => void) => {
  const query = motionQuery();
  query?.addEventListener("change", listener);
  return () => query?.removeEventListener("change", listener);
};
export function useMotionAllowed() {
  return useSyncExternalStore(subscribeMotion, () => motionQuery()?.matches === false, () => false);
}
export function tokenMilliseconds(token: string, element?: Element | null) {
  if (typeof document === "undefined") return 0;
  const value = getComputedStyle(element ?? document.documentElement).getPropertyValue(token).trim();
  return (parseFloat(value) || 0) * (value.endsWith("ms") ? 1 : 1000);
}
export const ambientStyle: CSSProperties = { animation: "tangle-breathe var(--motion-ambient) infinite" };
/** The document timeline is the page's epoch, including marks mounted later. */
export function syncAmbient(event: AnimationEvent<HTMLElement | SVGElement>) {
  for (const animation of event.currentTarget.getAnimations()) {
    if ((animation as CSSAnimation).animationName === "tangle-breathe") animation.startTime = 0;
  }
}
export function activityTiming(agent: Pick<AgentGraphNode, "events" | "lastActivityAt" | "medianEventGapMs">) {
  const measured = Number.isFinite(agent.lastActivityAt) && Number.isFinite(agent.medianEventGapMs) && agent.medianEventGapMs! >= 0;
  const times = measured ? [] : (agent.events ?? []).flatMap(e => e.at != null && Number.isFinite(e.at) ? [e.at] : []).sort((a, b) => a - b);
  const last = Number.isFinite(agent.lastActivityAt) ? agent.lastActivityAt : times.at(-1);
  const gaps = times.slice(1).map((time, i) => time - times[i]).sort((a, b) => a - b);
  const middle = Math.floor(gaps.length / 2);
  const median = Number.isFinite(agent.medianEventGapMs) && agent.medianEventGapMs! >= 0 ? agent.medianEventGapMs! : gaps.length ? gaps.length % 2 ? gaps[middle] : (gaps[middle - 1] + gaps[middle]) / 2 : 0;
  return { lastActivityAt: last, medianEventGapMs: median };
}
export function agentQuietActivity(agent: AgentGraphNode, now: number) {
  if (agent.status !== "running") return null;
  const { lastActivityAt, medianEventGapMs } = activityTiming(agent);
  if (lastActivityAt == null || !Number.isFinite(lastActivityAt)) return null;
  const { quietMs, quiet } = quietGap(lastActivityAt, medianEventGapMs, now);
  return quiet ? { quietMs, label: `Quiet ${Math.floor(quietMs / 60_000)}m` } : null;
}
/** Attention is finite and state changes work without animation completion. */
export function useAttention(ref: RefObject<HTMLElement | null>, status: string) {
  const allowed = useMotionAllowed();
  useEffect(() => {
    const element = ref.current;
    if (!element || !allowed || (status !== "needs-you" && status !== "failed")) return;
    const token = statusMeta(status).token;
    const duration = tokenMilliseconds("--duration-ambient", element) * (status === "needs-you" ? .45 : .3);
    element.dataset.attn = status;
    const shadow = getComputedStyle(element).boxShadow;
    const resting = shadow === "none" ? "" : `, ${shadow}`;
    const animation = element.animate([
      { boxShadow: `0 0 0 0 color-mix(in srgb, var(${token}) 40%, transparent)${resting}` },
      { boxShadow: `0 0 0 6px transparent${resting}` },
    ], { duration, iterations: status === "needs-you" ? 2 : 1, easing: getComputedStyle(element).getPropertyValue("--ease-exit").trim() || "ease-out" });
    const end = setTimeout(() => { delete element.dataset.attn; }, duration * (status === "needs-you" ? 2 : 1));
    return () => { animation.cancel(); clearTimeout(end); delete element.dataset.attn; };
  }, [ref, status, allowed]);
}
