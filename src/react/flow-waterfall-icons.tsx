import type { ReactNode } from 'react'
import type { FlowSpan } from '../flow-trace.js'

const svg = (children: ReactNode, label?: string) => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}>
    {children}
  </svg>
)

/** Kind glyphs drawn when the host supplies no `renderIcon`. Brand marks belong to the host. */
export function KindGlyph({ kind }: { kind: FlowSpan['kind'] }) {
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
export const PlayGlyph = () => <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><path d="M4.5 3.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L5.4 2.7a.6.6 0 0 0-.9.5Z" fill="currentColor" /></svg>
export const PauseGlyph = () => <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><rect x="4" y="3" width="2.75" height="10" rx=".8" fill="currentColor" /><rect x="9.25" y="3" width="2.75" height="10" rx=".8" fill="currentColor" /></svg>
export const RestartGlyph = () => svg(<><path d="M3 8a5 5 0 1 0 1.5-3.55" /><path d="M3 2.75V5.5h2.75" /></>)
export const RetryGlyph = ({ label }: { label?: string }) => svg(<><path d="M12.5 8A4.5 4.5 0 1 1 11 4.6" /><path d="M11.5 2v3h-3" /></>, label)
export const FailGlyph = ({ label }: { label?: string }) => svg(<path d="m4.5 4.5 7 7m0-7-7 7" />, label)
export const CloseGlyph = () => svg(<path d="m4.5 4.5 7 7m0-7-7 7" />)
export const TraceGlyph = () => svg(<path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3M3.4 3.4l2.1 2.1M10.5 10.5l2.1 2.1M3.4 12.6l2.1-2.1M10.5 5.5l2.1-2.1" />)
export const AlertGlyph = ({ label }: { label?: string }) => svg(<><path d="M8 2.5 14 13H2L8 2.5Z" /><path d="M8 6.5v3M8 11.25v.01" /></>, label)
export const ZoomInGlyph = () => svg(<><circle cx="7" cy="7" r="4.25" /><path d="m10.25 10.25 3.25 3.25M5 7h4M7 5v4" /></>)
export const ZoomOutGlyph = () => svg(<><circle cx="7" cy="7" r="4.25" /><path d="m10.25 10.25 3.25 3.25M5 7h4" /></>)
export const FitGlyph = () => svg(<path d="M2.5 6V3.5a1 1 0 0 1 1-1H6M10 2.5h2.5a1 1 0 0 1 1 1V6M13.5 10v2.5a1 1 0 0 1-1 1H10M6 13.5H3.5a1 1 0 0 1-1-1V10" />)
export const ReturnGlyph = () => svg(<path d="M6 3.5 3 6.5l3 3M3 6.5h6.5a3.5 3.5 0 0 1 3.5 3.5v2" />)
