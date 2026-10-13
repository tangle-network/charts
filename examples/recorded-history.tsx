import { useState } from "react";
import { createRoot } from "react-dom/client";
import { TangleKnot } from "@tangle-network/brand";
import { Lines } from "@tangle-network/charts/react";
import type { LinePoint, LineSelection, LineSeries } from "@tangle-network/charts/react";
import "@tangle-network/charts/react/live.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";

// Illustrative behavior records, deliberately separate from benchmark results.
const scenarios = ["recorded", "empty", "unavailable", "single", "flat", "negative", "large", "long"];

function App() {
  const [kind, setKind] = useState("recorded");
  const [recent, setRecent] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<Pick<LineSelection, "seriesIndex" | "pointIndex"> | null>(null);
  const [opened, setOpened] = useState<LineSelection | null>(null);
  const [dark, setDark] = useState(false);

  let points: readonly LinePoint[] = [[1, 5.2], [2, 5.9], [3, null], [4, 6.4], [5, 7.1], [6, 8.1]];
  let domain: readonly [number, number] = [4.8, 9];
  let references = [{ value: 5.8, label: "Baseline" }, { value: 8, label: "Target" }];
  let format = (value: number) => value.toFixed(2);
  let name = "Search A";

  if (kind === "empty") points = [];
  if (kind === "unavailable") points = [[1, null], [2, null], [3, null]];
  if (kind === "single") { points = [[1, 0]]; domain = [0, 1]; references = []; }
  if (kind === "flat") { points = [[1, .6], [2, .6], [3, .6]]; domain = [0, 1]; references = []; }
  if (kind === "negative") { points = [[1, -4], [2, -2], [3, 0]]; domain = [-5, 1]; references = [{ value: -3, label: "Baseline" }]; }
  if (kind === "large") {
    points = [[1, 1e12], [2, 1.4e12], [3, 1.7e12]];
    domain = [1e12, 1.8e12]; references = [];
    format = (value) => value.toLocaleString("en-US");
  }
  if (kind === "long") name = "A deliberately long recorded search label retained in the accessible series key and complete data";

  const series: LineSeries[] = [
    { name, color: "var(--brand-cool)", points },
    ...(kind === "recorded" || kind === "long" ? [{
      name: "Search B", color: "var(--tone-orange-icon)",
      points: [[1, 5.5], [3, 6], [5, 6.5], [6, 7.4]] as const,
    }] : []),
  ];
  const changeKind = (value: string) => {
    setKind(value); setRecent(false); setSelectedPoint(null); setOpened(null);
  };
  const openPoint = (point: LineSelection) => { setSelectedPoint(point); setOpened(point); };

  return (
    <main className="example-page">
      <header className="example-masthead">
        <a className="example-brand" href="https://www.tangle.tools/">
          <span aria-hidden="true"><TangleKnot size={32} /></span>
          <span>Tangle <span className="example-brand-section">Charts</span></span>
        </a>
        <button onClick={() => {
          document.documentElement.dataset.theme = dark ? "light" : "dark";
          setDark(!dark);
        }}>{dark ? "Light" : "Dark"} theme</button>
      </header>

      <div className="example-introduction">
        <h1>Recorded scores</h1>
        <p>Compare observations. Open the exact record behind a point.</p>
      </div>

      <section className="example-figure" data-theme="dark" aria-label="Recorded score example">
        <Lines
          label="Score over recorded experiments"
          controls={<>
            <button aria-pressed={!recent} onClick={() => setRecent(false)}>Full history</button>
            <button aria-pressed={recent} onClick={() => setRecent(true)}>Recent records</button>
          </>}
          series={series}
          xLabel="Experiment"
          yLabel="Score"
          xFormat={(x) => `Record ${x}`}
          axis={(x) => Number.isInteger(x) ? String(x) : ""}
          format={format}
          yTickFormat={kind === "large" ? (value) => new Intl.NumberFormat("en-US", { notation: "compact" }).format(value) : undefined}
          yDomain={domain}
          xDomain={recent ? [4, 6] : undefined}
          references={references}
          curve="step"
          markers
          rows={14}
          selectedPoint={selectedPoint}
          onSelect={openPoint}
        />
      </section>

      <div className="example-footer">
        <p>Illustrative records for this example, not benchmark results. Missing observations remain gaps.</p>
        <output aria-label="Opened point">{opened
          ? `Opened series ${opened.seriesIndex}, original point ${opened.pointIndex}, record ${opened.x}`
          : "Select a record to inspect its exact source."}</output>
      </div>

      <details className="example-settings">
        <summary>Explore the example data</summary>
        <div className="example-settings-content">
          <label>Dataset
            <select aria-label="Fixture data" value={kind} onChange={(event) => changeKind(event.target.value)}>
              {scenarios.map((scenario) => <option key={scenario} value={scenario}>{scenario}</option>)}
            </select>
          </label>
          <div className="example-selection-controls">
            <button onClick={() => setSelectedPoint({ seriesIndex: 0, pointIndex: 1 })}>Select earlier result</button>
            <button onClick={() => setSelectedPoint(null)}>Clear selected result</button>
          </div>
        </div>
      </details>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
