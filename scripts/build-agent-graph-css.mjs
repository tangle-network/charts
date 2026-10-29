import { readFile, writeFile } from "node:fs/promises";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
const from = new URL("../src/react/agent-graph/styles.css", import.meta.url);
const result = await postcss([tailwindcss()]).process(await readFile(from, "utf8"), { from: from.pathname });
if (/@import\s/.test(result.css)) throw new Error("Unresolved graph stylesheet import");
await writeFile(new URL("../dist/react/agent-graph.css", import.meta.url), result.css);
