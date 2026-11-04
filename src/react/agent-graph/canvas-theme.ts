/**
 * What a React Flow canvas in this package reads from its surroundings: the
 * reader's motion preference, the colour scheme it sits in, and the ring a
 * selected node wears. Shared by `WorkflowGraph` and `AgentGraph` so the two
 * canvases answer those questions identically.
 */

import type { ColorMode } from "@xyflow/react";
import { type CSSProperties, type RefObject, useLayoutEffect, useState } from "react";

/** Motion is opt-OUT, so it is only used where the reader's preference can be
 *  read and says nothing against it. Somewhere without `matchMedia` cannot say
 *  a reader tolerates movement, so it gets none. */
export function motionAllowed(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === false
  );
}

/** React Flow adds its own .light/.dark class below the graph wrapper. Read
 * that wrapper's inherited scheme so a nested WorkspaceLayout theme wins over
 * the page root without React Flow's class influencing the answer. */
function currentColorMode(anchor: HTMLElement | null): ColorMode {
  if (typeof document === "undefined" || typeof window === "undefined") return "light";
  const scheme = window.getComputedStyle(anchor ?? document.documentElement).colorScheme;
  if (scheme.startsWith("dark")) return "dark";
  if (scheme.startsWith("light")) return "light";
  return (anchor ?? document.documentElement).closest(".dark") ? "dark" : "light";
}

export function useColorMode(wrapperRef: RefObject<HTMLDivElement | null>, hasGraph: boolean): ColorMode {
  const [mode, setMode] = useState<ColorMode>(() => currentColorMode(null));
  useLayoutEffect(() => {
    const anchor = hasGraph ? wrapperRef.current : null;
    const update = () => setMode(currentColorMode(anchor));
    update();
    const observer = new MutationObserver(update);
    for (let el: HTMLElement | null = anchor ?? document.documentElement; el; el = el.parentElement) {
      observer.observe(el, {
        attributes: true,
        attributeFilter: ["class", "data-theme", "data-sandbox-theme", "style"],
      });
    }
    return () => observer.disconnect();
  }, [wrapperRef, hasGraph]);
  return mode;
}

/** Selection preserves the status border and stays quieter than failure or a response request. */
export const SELECTION_OUTLINE: CSSProperties = {
  outline: "1px solid hsl(var(--foreground) / .45)",
  outlineOffset: 2,
};

/** Where a hover card goes: the corner of `viewport` across from the hovered `node`, so the card never covers it or its neighbours.
 *  A zero-size anchor at that corner; the card opens inward from it. Without a viewport (a list) it opens below the node. */
export function cornerAnchor(node: HTMLElement, viewport: HTMLElement | null) {
  if (!viewport) return { side: "bottom" as const, align: "start" as const, anchor: { contextElement: node, getBoundingClientRect: () => node.getBoundingClientRect() } };
  const box = viewport.getBoundingClientRect(), at = node.getBoundingClientRect(), inset = 12;
  const left = at.left + at.width / 2 > box.left + box.width / 2, top = at.top + at.height / 2 > box.top + box.height / 2;
  const x = left ? box.left + inset : box.right - inset, y = top ? box.top + inset : box.bottom - inset;
  return {
    side: top ? "bottom" as const : "top" as const, align: left ? "start" as const : "end" as const,
    anchor: { contextElement: node, getBoundingClientRect: () => DOMRect.fromRect({ x, y, width: 0, height: 0 }) },
  };
}
