// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import * as source from "./index.js";

// Compare the packed entrypoint with the untouched static implementation,
// including SVG, tables, Refusals and all three HTML presentations. Existing
// static figure tests remain the semantic fixtures (and are not rewritten).
function fixtures(charts: typeof source) {
  const options = { measure: "recorded score", unit: "score", domain: [0, 1] as [number, number] };
  const figures = [
    charts.metricBars([
      { id: "zero", label: "Observed zero", value: 0 },
      { id: "gap", label: "Not measured", value: null },
      { id: "one", label: "<One>", value: 0.5 },
    ], options),
    charts.timeSeries([{ id: "a", label: "A", points: [
      { x: 1, y: 0 }, { x: 2, y: null }, { x: 3, y: 0.5 }, { x: 4, y: 1 },
    ] }], { x: { label: "sample", domain: [1, 4] }, y: { label: "score", unit: "score", domain: [0, 1] } }),
  ];
  const refusal = charts.metricBars([{ id: "bad", label: "Bad", value: -1 }], options);
  if (!charts.isRefusal(refusal)) throw new Error("Invalid static value must remain a Refusal");
  return {
    exports: Object.keys(charts).sort(),
    figures: figures.map((figure) => {
      if (charts.isRefusal(figure)) throw new Error(figure.refused);
      return { figure, notes: charts.renderNotes([figure]),
        presentations: [
          charts.renderFigure(figure, 1),
          charts.renderFigure(figure, 1, { presentation: "chart" }),
          charts.renderFigure(figure, 1, { presentation: "plot" }),
        ] };
    }),
    refusal, refusalHtml: charts.renderRefusals([refusal]),
    figureCss: charts.figureCss, chartTokensCss: charts.chartTokensCss,
  };
}

it("packs an isolated static root and optional React entrypoint", () => {
  const packageDir = fileURLToPath(new URL("../", import.meta.url));
  const require = createRequire(import.meta.url);
  const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  expect(manifest.exports["."]).toEqual({
    types: "./dist/index.d.ts", import: "./dist/index.js", default: "./dist/index.js",
  });
  expect(manifest.exports["./figure.css"]).toBe("./dist/figure.css");
  expect(manifest.exports["./react"]).toEqual({
    types: "./dist/react/index.d.ts", import: "./dist/react/index.js", default: "./dist/react/index.js",
  });
  expect(manifest.peerDependenciesMeta.react.optional).toBe(true);
  expect(Object.keys(manifest.dependencies ?? {})).toEqual([]);
  expect(Object.keys(manifest.optionalDependencies ?? {})).toEqual([]);
  expect(Object.keys(source).sort()).toEqual([
    "breakdown", "chartTokensCss", "comparisonIntervals", "costFrontier", "figureCss", "isRefusal",
    "metricBars", "rankedRates", "rateOrder", "renderFigure", "renderNotes", "renderRefusals", "taskMatrix", "timeSeries",
  ].sort());

  // Build once here so a clean `pnpm test` does not depend on stale dist files.
  execFileSync("pnpm", ["--filter", "@tangle-network/charts", "build"], { cwd: packageDir, stdio: "pipe", timeout: 90_000 });
  const temp = mkdtempSync(join(tmpdir(), "charts-consumer-"));
  try {
    const packed = JSON.parse(execFileSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", temp], {
      cwd: packageDir, encoding: "utf8", timeout: 30_000,
    }));
    const consumer = join(temp, "consumer");
    mkdirSync(consumer);
    writeFileSync(join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }));
    // No --omit=peer or --legacy-peer-deps: a normal install must not install
    // the optional React peer. Offline also prevents accidental registry pulls.
    execFileSync("npm", ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", join(temp, packed[0].filename)], {
      cwd: consumer, stdio: "pipe", timeout: 30_000,
    });
    writeFileSync(join(consumer, "expected.json"), JSON.stringify(fixtures(source)));
    writeFileSync(join(consumer, "static.mjs"), `
      import assert from "node:assert/strict";
      import { readFileSync } from "node:fs";
      import { createRequire } from "node:module";
      const require = createRequire(import.meta.url);
      for (const name of ["react", "react/jsx-runtime", "react-dom", "@types/react/package.json"]) {
        assert.throws(() => require.resolve(name), { code: "MODULE_NOT_FOUND" });
      }
      for (const name of ["window", "document", "HTMLElement", "SVGElement", "ResizeObserver"]) {
        assert.equal(typeof globalThis[name], "undefined");
      }
      const charts = await import("@tangle-network/charts");
      const fixtures = (${fixtures.toString()});
      assert.deepEqual(JSON.parse(JSON.stringify(fixtures(charts))), JSON.parse(readFileSync(new URL("expected.json", import.meta.url), "utf8")));
      assert.equal(readFileSync(require.resolve("@tangle-network/charts/figure.css"), "utf8"), charts.figureCss);
      console.log("Static root: React absent; no DOM; exports, SVG, HTML, Refusal and CSS match");
    `);
    const runtime = execFileSync(process.execPath, ["static.mjs"], {
      cwd: consumer, encoding: "utf8", timeout: 30_000, env: { ...process.env, NODE_PATH: "" },
    });
    expect(runtime).toContain("Static root: React absent");

    writeFileSync(join(consumer, "static.ts"), `
      import { metricBars, timeSeries, isRefusal, renderFigure, renderRefusals,
        type Figure, type Refusal, type MetricRow, type TimeSeriesRow } from "@tangle-network/charts";
      const rows: MetricRow[] = [{ id: "x", label: "X", value: 0 }];
      const result: Figure | Refusal = metricBars(rows, { measure: "score", unit: "score", domain: [0, 1] });
      const html: string = isRefusal(result) ? renderRefusals([result]) : renderFigure(result, 1);
      const history: TimeSeriesRow[] = [{ id: "a", label: "A", points: [{ x: 1, y: null }] }];
      timeSeries(history, { x: { label: "sample", domain: [1, 2] }, y: { label: "value", unit: "units", domain: [0, 1] } });
      void html;
    `);
    const staticConfig = {
      compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext",
        lib: ["ES2022"], types: [], strict: true, skipLibCheck: false, noEmit: true },
      files: ["static.ts"],
    };
    writeFileSync(join(consumer, "tsconfig.json"), JSON.stringify(staticConfig));
    const typescriptManifestPath = require.resolve("typescript/package.json");
    const typescriptManifest = JSON.parse(readFileSync(typescriptManifestPath, "utf8"));
    const tsc = join(dirname(typescriptManifestPath), typescriptManifest.bin.tsc);
    execFileSync(process.execPath, [tsc, "-p", "tsconfig.json"], { cwd: consumer, stdio: "pipe", timeout: 30_000 });

    // Only AFTER the React-free runtime/type proofs, supply the workspace's
    // installed React peer. This tests package export resolution, not sources.
    symlinkSync(dirname(require.resolve("react/package.json")), join(consumer, "node_modules/react"), "dir");
    mkdirSync(join(consumer, "node_modules/@types"), { recursive: true });
    symlinkSync(dirname(require.resolve("@types/react/package.json")), join(consumer, "node_modules/@types/react"), "dir");
    writeFileSync(join(consumer, "react.mjs"), `
      import assert from "node:assert/strict";
      import { Sparkline, StackedBarChart, sparklineGeometry, WaterfallHeader, WaterfallRow,
        waterfallSpanGeometry } from "@tangle-network/charts/react";
      assert.equal(typeof Sparkline, "function"); assert.equal(typeof StackedBarChart, "function");
      assert.equal(typeof WaterfallHeader, "function"); assert.equal(typeof WaterfallRow, "function");
      assert.equal(waterfallSpanGeometry(20, 30, { startMs: 0, endMs: 100 }).offsetPct, 20);
      assert.equal(sparklineGeometry([1, null, 3]).gaps, 1);
      assert.equal(typeof document, "undefined");
    `);
    execFileSync(process.execPath, ["react.mjs"], { cwd: consumer, stdio: "pipe", timeout: 30_000 });
    writeFileSync(join(consumer, "react.tsx"), `
      import { Sparkline, StackedBarChart, WaterfallHeader, WaterfallRow,
        type StackedBarBucket, type WaterfallWindow } from "@tangle-network/charts/react";
      const buckets: StackedBarBucket[] = [{ id: "b", label: "B", total: 0, segments: [{ seriesId: "s", value: 0 }] }];
      const glyph = <Sparkline values={[1, null, -1]} label="Delta" />;
      const chart = <StackedBarChart label="Units" buckets={buckets} maxValue={1}
        series={[{ id: "s", label: "S", color: "currentColor" }]} formatValue={String}
        selectedBucketId={null} onSelectionChange={() => {}} />;
      const window: WaterfallWindow = { startMs: 0, endMs: 100 };
      const axis = <WaterfallHeader windowMs={100} />;
      const row = <WaterfallRow label="Recorded tool" startMs={20} endMs={30} window={window} />;
      void glyph; void chart; void axis; void row;
    `);
    writeFileSync(join(consumer, "tsconfig.json"), JSON.stringify({
      ...staticConfig, files: ["react.tsx"], compilerOptions: {
        ...staticConfig.compilerOptions, lib: ["ES2022", "DOM", "DOM.Iterable"], jsx: "react-jsx",
      },
    }));
    execFileSync(process.execPath, [tsc, "-p", "tsconfig.json"], { cwd: consumer, stdio: "pipe", timeout: 30_000 });
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}, 240_000);
