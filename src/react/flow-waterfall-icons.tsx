import type { ReactNode } from 'react'
import { RunStatusIcon } from '@tangle-network/ui/run'
import type { FlowSpan } from '../flow-trace.js'

const svg = (children: ReactNode, label?: string) => (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}>
    {children}
  </svg>
)

/** Kind glyphs drawn when the host supplies no `renderIcon`. Brand marks belong to the host. */
/** Generic tool identity by name: a terminal, a file, a pencil, a lens, a globe or a branch, never a vendor mark. */
export function toolGlyph(name: string | undefined) {
  const n = (name ?? '').toLowerCase()
  if (/bash|shell|exec|terminal|command|run/.test(n)) return svg(<><rect x="2" y="3" width="12" height="10" rx="2" /><path d="m5 7 2 1.5L5 10M8.5 10.5h2.5" /></>)
  if (/edit|write|patch|apply/.test(n)) return svg(<path d="M3 13l1-3.5L10.5 3a1.4 1.4 0 0 1 2 2L6 11.5 3 13ZM9.5 4l2 2" />)
  if (/grep|search|find|query/.test(n)) return svg(<><circle cx="7" cy="7" r="4.25" /><path d="m10.25 10.25 3.25 3.25" /></>)
  if (/read|glob|list|ls|cat|file|view/.test(n)) return svg(<><path d="M4 2.5h5l3 3v8H4z" /><path d="M9 2.5v3h3M6 9h4M6 11h3" /></>)
  if (/web|fetch|http|browser|url/.test(n)) return svg(<><circle cx="8" cy="8" r="5.5" /><path d="M2.5 8h11M8 2.5c2 2 2 9 0 11M8 2.5c-2 2-2 9 0 11" /></>)
  if (/git|commit|branch|merge/.test(n)) return svg(<><circle cx="5" cy="4" r="1.5" /><circle cx="5" cy="12" r="1.5" /><circle cx="11" cy="6" r="1.5" /><path d="M5 5.5v5M11 7.5c0 2-3 2-6 3" /></>)
  return undefined
}

export function KindGlyph({ kind, name }: { kind: FlowSpan['kind']; name?: string }) {
  if (kind === 'tool') { const glyph = toolGlyph(name); if (glyph) return glyph }
  switch (kind) {
    case 'pipeline': return svg(<><circle cx="8" cy="4" r="1.75" /><circle cx="4" cy="12" r="1.75" /><circle cx="12" cy="12" r="1.75" /><path d="M8 5.75v2.5M8 8.25 4.8 10.6M8 8.25l3.2 2.35" /></>)
    case 'model': return svg(<path d="M8 2.5c.5 2.8 2.2 4.6 5 5.5-2.8.9-4.5 2.7-5 5.5-.5-2.8-2.2-4.6-5-5.5 2.8-.9 4.5-2.7 5-5.5Z" />)
    case 'waiting': return svg(<><path d="M4.5 2.5h7M4.5 13.5h7" /><path d="M5.5 2.5c0 3 5 3 5 5.5s-5 2.5-5 5.5M10.5 2.5c0 3-5 3-5 5.5" /></>)
    case 'handoff': return svg(<path d="M3 3v5.5a2 2 0 0 0 2 2h8M10.5 8l2.5 2.5-2.5 2.5" />)
    default: return svg(<path d="M10.2 2.8a3.2 3.2 0 0 0-4 4L2.8 10.2a1.4 1.4 0 0 0 2 2l3.4-3.4a3.2 3.2 0 0 0 4-4l-1.9 1.9-1.6-.4-.4-1.6 1.9-1.9Z" />)
  }
}

export const ChevronGlyph = () => svg(<path d="m6 4 4 4-4 4" />)
export const SearchGlyph = () => svg(<><circle cx="7" cy="7" r="4.25" /><path d="m10.25 10.25 3.25 3.25" /></>)
export const PlayGlyph = () => <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden><path d="M4.5 3.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L5.4 2.7a.6.6 0 0 0-.9.5Z" fill="currentColor" /></svg>
export const PauseGlyph = () => <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden><rect x="4" y="3" width="2.75" height="10" rx=".8" fill="currentColor" /><rect x="9.25" y="3" width="2.75" height="10" rx=".8" fill="currentColor" /></svg>
export const RestartGlyph = () => svg(<><path d="M3 8a5 5 0 1 0 1.5-3.55" /><path d="M3 2.75V5.5h2.75" /></>)
export const RetryGlyph = ({ label }: { label?: string }) => svg(<><path d="M12.5 8A4.5 4.5 0 1 1 11 4.6" /><path d="M11.5 2v3h-3" /></>, label)
export const FailGlyph = ({ label }: { label?: string }) => <RunStatusIcon status="failed" aria-label={label} style={{ color: "currentColor" }} />
export const CloseGlyph = () => svg(<path d="m4.5 4.5 7 7m0-7-7 7" />)
export const TraceGlyph = () => svg(<path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3M3.4 3.4l2.1 2.1M10.5 10.5l2.1 2.1M3.4 12.6l2.1-2.1M10.5 5.5l2.1-2.1" />)
export const AlertGlyph = FailGlyph
export const ZoomInGlyph = () => svg(<><circle cx="7" cy="7" r="4.25" /><path d="m10.25 10.25 3.25 3.25M5 7h4M7 5v4" /></>)
export const ZoomOutGlyph = () => svg(<><circle cx="7" cy="7" r="4.25" /><path d="m10.25 10.25 3.25 3.25M5 7h4" /></>)
export const FitGlyph = () => svg(<path d="M2.5 6V3.5a1 1 0 0 1 1-1H6M10 2.5h2.5a1 1 0 0 1 1 1V6M13.5 10v2.5a1 1 0 0 1-1 1H10M6 13.5H3.5a1 1 0 0 1-1-1V10" />)
