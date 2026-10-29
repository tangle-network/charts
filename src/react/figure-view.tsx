/** Embeds a static Figure or Refusal in React: the wide or phone render chosen by the container's width, the data
 * table in a disclosure. The SVG and table strings come from this library's figure functions, which escape input. */
import { useMemo } from 'react'
import { NARROW, WIDE } from '../svg.js'
import { type Figure, isRefusal, type Refusal } from '../types.js'
import { useWidth } from './live-presentation.js'

/** A figure drawn for a width: FigureView calls it with its container's measured width (at least 720 px). */
export type FigureAtWidth = (width: number) => Figure | Refusal

export interface FigureViewProps {
  /**
   * A figure, or a function that draws one for a width. With a function the wide render is drawn at the container's
   * width, in 32 px steps, so its text and marks keep their set size on a wide page instead of being scaled up from 720.
   * Memoize the function: a new function redraws the figure.
   */
  figure: Figure | Refusal | FigureAtWidth
  /** `chart` (default) keeps the lede, reading and method in the disclosure; `report` also shows the finding and lede. */
  presentation?: 'chart' | 'report'
  /** timeSeries valued-point index, in row order. Hover/click choose the nearest mark; Enter/Space activate the focused mark. */
  onPointSelect?: (index: number) => void
}

export function FigureView({ figure: given, presentation = 'chart', onPointSelect }: FigureViewProps) {
  const [ref, width] = useWidth<HTMLElement>()
  // Before measurement the function draws at 720, as a static figure's wide render does.
  const drawn = width >= WIDE ? Math.floor(width / 32) * 32 : WIDE
  const figure = useMemo(() => (typeof given === 'function' ? given(drawn) : given), [given, drawn])
  if (isRefusal(figure)) return <p className="ov-refusal" role="note" data-refused={figure.id}>{figure.refused}</p>
  // Before measurement (server render, print) the wide render shows, as in renderFigure's print rule.
  const layout = width > 0 && width < WIDE ? (figure.svg.narrow ? 'narrow' : 'table') : 'wide'
  const plot = layout === 'wide' ? figure.svg.wide : layout === 'narrow' ? figure.svg.narrow! : figure.table
  const method = [figure.note.method, figure.note.n, ...figure.note.exclusions].join(' ')
  return (
    <figure ref={ref} className="tgc-figure tgc-figure-chart tgc-figure-view" data-figure={figure.id} data-layout={layout} aria-label={figure.finding}>
      {presentation === 'report' && (
        <>
          <h3 className="tgc-finding">{figure.finding}</h3>
          <p className="tgc-lede">{figure.lede}</p>
        </>
      )}
      <div className={`tgc-view-plot tgc-view-${layout}`} data-point-actions={onPointSelect ? '' : undefined}
        onPointerMove={onPointSelect ? event => { const point = nearestPoint(event.currentTarget, event.clientX, event.clientY); for (const old of event.currentTarget.querySelectorAll('[data-near]')) old.removeAttribute('data-near'); point?.setAttribute('data-near', '') } : undefined}
        onPointerLeave={onPointSelect ? event => { for (const old of event.currentTarget.querySelectorAll('[data-near]')) old.removeAttribute('data-near') } : undefined}
        onClick={onPointSelect ? event => { const point = nearestPoint(event.currentTarget, event.clientX, event.clientY); if (point) onPointSelect(Number(point.getAttribute('data-point'))) } : undefined}
        onKeyDown={onPointSelect ? event => { const point = event.target instanceof Element ? event.target.closest('[data-point]') : null; if (point && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onPointSelect(Number(point.getAttribute('data-point'))) } } : undefined}
        role={figure.svg.interactive ? 'group' : 'img'} aria-label={`${figure.finding} ${figure.lede}`}
        style={layout === 'narrow' ? { maxWidth: NARROW } : undefined} dangerouslySetInnerHTML={{ __html: plot }} />
      <details className="tgc-data">
        <summary>Data and method</summary>
        <p className="tgc-lede">{figure.lede}</p>
        <p className="tgc-read">{figure.read}</p>
        <p className="tgc-read">{method}</p>
        <div className="tgc-scroll" role="region" aria-label={`${figure.finding} data`} tabIndex={0} dangerouslySetInnerHTML={{ __html: figure.table }} />
      </details>
    </figure>
  )
}

/** Hit circles may overlap on a phone or at zero. Resolve their centres rather than the last painted circle. */
function nearestPoint(root: HTMLElement, x: number, y: number) {
  let nearest: Element | undefined, distance = Infinity
  for (const point of root.querySelectorAll('.tgc-series-observation[data-point]')) {
    const hit = point.querySelector('.tgc-series-hit')?.getBoundingClientRect()
    if (!hit?.width || !hit.height) continue
    const d = Math.hypot(x - hit.x - hit.width / 2, y - hit.y - hit.height / 2)
    if (d <= Math.max(hit.width, hit.height) / 2 && d < distance) { nearest = point; distance = d }
  }
  return nearest
}
