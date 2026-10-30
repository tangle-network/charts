import { statusMeta } from "@tangle-network/ui/run/status-meta";
export const RESTING_SHADOW =
  "inset 0 1px 0 hsl(var(--foreground) / 0.06), 0 1px 3px hsl(var(--shadow-color) / 0.08)";
export const RESTING_BORDER = "hsl(var(--foreground) / 0.14)";
export function edgeColor(status: string | undefined): string {
  return status === "failed" || status === "waiting"
    ? `var(${statusMeta(status === "waiting" ? "needs-you" : "failed").token})`
    : "color-mix(in srgb, hsl(var(--muted-foreground)) 80%, transparent)";
}
