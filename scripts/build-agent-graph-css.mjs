import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
const from = new URL("../src/react/agent-graph/styles.css", import.meta.url);
const result = await postcss([tailwindcss()]).process(await readFile(from, "utf8"), { from: from.pathname });
// Compile Brand's existing arrival effect without importing unrelated intro UI.
const brand = postcss.parse(await readFile(createRequire(import.meta.url).resolve("@tangle-network/brand/styles/presentation.css"), "utf8"));
brand.walkAtRules("keyframes", rule => { if (rule.params === "tangle-intro-enter") result.root.append(rule.clone()); });
// A compiled component sheet must not override its host's responsive utilities.
// Portals and the independently composed activity strip share this boundary.
result.root.walkAtRules("layer", layer => {
  if (layer.params !== "utilities" && layer.params !== "base") return;
  const scope = postcss.atRule({ name: "scope", params: "(.agent-graph, .ag-root, .ag-latest, [data-agent-metrics])" });
  scope.append(...layer.nodes);
  layer.append(scope);
});
const css = result.root.toString();
if (/@import\s/.test(css)) throw new Error("Unresolved graph stylesheet import");
await writeFile(new URL("../dist/react/agent-graph.css", import.meta.url), css);
