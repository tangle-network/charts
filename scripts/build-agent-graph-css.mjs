import { readFile, writeFile } from "node:fs/promises";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
const from = new URL("../src/react/agent-graph/styles.css", import.meta.url);
const result = await postcss([tailwindcss()]).process(await readFile(from, "utf8"), { from: from.pathname });
// Compile Brand's existing arrival effect without importing unrelated intro UI.
const brand = postcss.parse(await readFile(new URL(import.meta.resolve("@tangle-network/brand/styles/presentation.css")), "utf8"));
brand.walkAtRules("keyframes", rule => { if (rule.params === "tangle-intro-enter") result.root.append(rule.clone()); });
// A compiled component sheet must not override its host's responsive utilities.
// Scoped resets stay before utilities regardless of the host layer order.
result.root.walkAtRules("layer", layer => {
  if (layer.params !== "utilities" && layer.params !== "base") return;
  const scope = postcss.atRule({ name: "scope", params: "(.agent-graph, .ag-root, .ag-latest, [data-agent-metrics])" });
  layer.walkRules(rule => {
    // Scope roots require :scope; ordinary selectors only reach descendants.
    // Nested rules already inherit their selector, and keyframes aren't selectors.
    for (let parent = rule.parent; parent !== layer; parent = parent.parent) {
      if (parent.type === "rule" || parent.name?.endsWith("keyframes")) return;
    }
    rule.selectors = rule.selectors.flatMap(selector => [selector, `:scope:is(${selector})`]);
  });
  scope.append(...layer.nodes);
  layer.replaceWith(scope);
});
const css = result.root.toString();
if (/@import\s/.test(css)) throw new Error("Unresolved graph stylesheet import");
await writeFile(new URL("../dist/react/agent-graph.css", import.meta.url), css);
