/** Embeds a static Figure or Refusal in React: the wide or phone render chosen by the container's width, the data
 * table in a disclosure. The SVG and table strings come from this library's figure functions, which escape input. */
import { NARROW, WIDE } from '../svg.js'
import { type Figure, isRefusal, type Refusal } from '../types.js'
import { useWidth } from './live.js'

export interface FigureViewProps {
  figure: Figure | Refusal
  /** `chart` (default) keeps the lede, reading and method in the disclosure; `report` also shows the finding and lede. */
  presentation?: 'chart' | 'report'
}

export function FigureView({ figure, presentation = 'chart' }: FigureViewProps) {
  const [ref, width] = useWidth<HTMLElement>()
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
      <div className={`tgc-view-plot tgc-view-${layout}`} role={figure.svg.interactive ? 'group' : 'img'} aria-label={`${figure.finding} ${figure.lede}`}
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
