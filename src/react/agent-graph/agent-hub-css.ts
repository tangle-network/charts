/** Hub styles consume Brand's status, elevation, radius and motion roles. */
export const AGENT_HUB_CSS = `
.ag-root { --ag-surface: var(--bg-card); --ag-fg: var(--text-primary); --ag-muted: var(--text-muted); --ag-border: var(--border-default); --ag-accent: var(--brand-primary);
  color: var(--ag-fg); font-size: 12px; line-height: 16px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.ag-root * { box-sizing: border-box; }
.ag-head, .ag-title, .ag-chip, .ag-legend li, .ag-pop-head, .ag-pop-foot { display: flex; align-items: center; gap: 8px; }
.ag-head { flex-wrap: wrap; flex-shrink: 0; min-height: 40px; }
.ag-title, .ag-pop-name { font-weight: 600; font-size: 14px; line-height: 20px; }
.ag-title-mark { width: 6px; height: 6px; border-radius: var(--radius-pill); background: var(--ag-accent); }
.ag-chip, .ag-pill { display: inline-flex; align-items: center; gap: 4px; padding: 0 8px; border: 1px solid var(--ag-border); border-radius: var(--radius-pill); font-size: 12px; font-weight: 500; min-height: 24px; background: transparent; color: var(--ag-muted); }
.ag-chip { cursor: pointer; }
.ag-chip-needs-you, .ag-pill-needs-you { color: var(--surface-warning-text); }
.ag-chip-failed, .ag-pill-failed { color: var(--surface-danger-text); }
.ag-pill-succeeded { color: var(--surface-success-text); }
.ag-stats { margin-left: auto; display: flex; gap: 12px; flex-wrap: wrap; color: var(--ag-muted); font-variant-numeric: tabular-nums; }
.ag-stats b, .ag-pop-call b, .ag-pop-foot b { color: var(--ag-fg); font-weight: 500; }
.ag-canvas-wrap { position: relative; min-height: 0; border: 1px solid var(--ag-border); border-radius: var(--radius-container); background: var(--bg-root); overflow: auto; }
.ag-canvas { position: absolute; inset: 0 auto auto 0; transform-origin: 0 0; }
.ag-edges { position: absolute; inset: 0; overflow: visible; }
.ag-edge { fill: none; stroke: color-mix(in srgb, var(--ag-muted) 80%, transparent); stroke-width: 1.25; }
.ag-edge-live, .ag-flow { fill: none; stroke-linecap: round; }
.ag-edge-live { stroke-width: 1.25; }
.ag-flow { stroke-width: 2; }
.ag-root g, .ag-node { transition: opacity var(--motion-control); }
.ag-dimmed .ag-tile { opacity: .45; } .ag-edges .ag-dimmed { opacity: .32; }
.ag-node { position: absolute; display: flex; flex-direction: column; align-items: center; width: 176px; margin-left: -88px; margin-top: calc(var(--ag-tile) / -2); padding: 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; outline: none; }
.ag-tile { position: relative; display: grid; place-items: center; width: var(--ag-tile); height: var(--ag-tile); flex-shrink: 0; border-radius: var(--radius-card); background: var(--ag-surface); border: 1px solid var(--ag-border); box-shadow: var(--shadow-card); transition: box-shadow var(--motion-control); }
.ag-node:hover .ag-tile { box-shadow: var(--shadow-dropdown); }
.ag-model-mark { display: grid; place-items: center; width: 20px; height: 20px; filter: grayscale(1) var(--tw-invert,); color: var(--ag-muted); } .ag-model-mark img, .ag-model-mark svg { max-width: 20px; max-height: 20px; } .ag-node:hover .ag-model-mark { filter: var(--tw-invert, none); } .ag-node:not(:hover) .ag-model-mark svg path { fill: currentColor; }
.ag-node:focus-visible, .ag-selected .ag-tile, .ag-close:focus-visible, .ag-chip:focus-visible { outline: 2px solid color-mix(in srgb, var(--ag-fg) 70%, transparent); outline-offset: 2px; }
.ag-node[style*="--ag-tone"] .ag-tile { border: 1.5px solid var(--ag-tone); }
.ag-node-you .ag-tile { background: var(--ag-fg); color: var(--ag-surface); }
.ag-name, .ag-sub { max-width: 176px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ag-name { margin-top: 6px; font-size: 14px; font-weight: 600; line-height: 20px; }
.ag-sub { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; white-space: normal; }
.ag-node-tool .ag-name { max-width: 132px; }
.ag-sub, .ag-node-tool .ag-name { font-size: 12px; font-weight: 400; color: var(--ag-muted); } .ag-canvas .ag-sub { font-size: 13px; line-height: 17px; }
.ag-badge { position: absolute; top: -5px; right: -5px; display: grid; place-items: center; background: var(--ag-surface); border-radius: var(--radius-pill); box-shadow: 0 0 0 2px var(--ag-surface); }
.ag-root [data-activity="quiet"] .ag-running-dot { animation: none !important; }
.ag-running-dot { display: inline-block; flex-shrink: 0; width: 6px; height: 6px; border-radius: var(--radius-pill); background: var(--surface-info-text); animation: tangle-breathe var(--motion-ambient) infinite; }
.ag-legend { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 16px; color: var(--ag-muted); }
.ag-legend-line { width: 14px; height: 2px; border-radius: var(--radius-pill); }
.ag-popover { overflow: auto; position: absolute; z-index: 5; width: min(280px, calc(100% - 16px)); padding: 12px; border-radius: var(--radius-card); background: var(--bg-elevated); color: var(--ag-fg); border: 1px solid var(--ag-border); box-shadow: var(--shadow-overlay); animation: agent-arrive var(--motion-arrive); }
.ag-tile-mini { border-radius: var(--radius-control); box-shadow: none; }
.ag-tile-micro { border: 0; border-radius: var(--radius-tag); background: none; box-shadow: none; }
.ag-pop-title { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.ag-pop-sub, .ag-pop-call { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ag-muted); }
.ag-close { display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: var(--radius-control); background: none; color: var(--ag-muted); cursor: pointer; }
.ag-close:hover { background: var(--bg-hover); color: var(--ag-fg); }
.ag-pop-summary { overflow-wrap: anywhere; margin: 8px 0 0; font-size: 14px; line-height: 20px; }
.ag-pop-calls { list-style: none; margin: 8px 0 0; padding: 8px 0 0; border-top: 1px solid var(--ag-border); display: grid; gap: 6px; }
.ag-pop-calls li { display: flex; align-items: center; gap: 6px; min-width: 0; }
.ag-pop-dir, .ag-pop-time { color: var(--ag-muted); flex-shrink: 0; }
.ag-pop-call { flex: 1; min-width: 0; }
.ag-pop-time { font-variant-numeric: tabular-nums; display: inline-flex; }
.ag-pop-foot { margin: 8px 0 0; padding-top: 8px; border-top: 1px solid var(--ag-border); color: var(--ag-muted); }
.ag-mobile { list-style: none; margin: 0; padding: 8px; display: grid; gap: 12px; }
.ag-mobile .ag-node { position: relative; left: auto !important; top: auto !important; margin: 0; width: 100%; min-height: 48px; display: grid; grid-template-columns: 32px minmax(0,1fr); text-align: left; column-gap: 12px; }
.ag-mobile .ag-tile { grid-row: span 2; }
.ag-mobile .ag-name, .ag-mobile .ag-sub { max-width: 100%; width: 100%; margin: 0; }
.ag-mobile .ag-sub { display: block; white-space: nowrap; }
.ag-tools { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 0 44px; }
.ag-tools button { color: var(--ag-muted); background: transparent; border: 1px solid var(--ag-border); border-radius: var(--radius-pill); min-height: 28px; padding: 0 8px; font: inherit; cursor: pointer; }
.ag-available { padding: 8px; border-top: 1px solid var(--ag-border); color: var(--ag-muted); } .ag-available .ag-tools { margin: 8px 0 0; }
.ag-list-mode .ag-popover { overflow: auto; position: relative; left: auto !important; top: auto !important; width: auto; margin: 8px; }
@media (prefers-reduced-motion: reduce) { .ag-root *, .ag-root *::before { animation: none !important; transition: opacity var(--duration-fast) !important; } .ag-root .ag-running-dot { animation: tangle-breathe var(--motion-ambient) infinite !important; } }
`;
