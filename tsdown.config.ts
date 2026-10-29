import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "react/index": "src/react/index.ts",
    "react/agent-graph/index": "src/react/agent-graph/index.ts",
    "react/agent-graph/presentation": "src/react/agent-graph/presentation.ts",
  },
  format: ["esm"],
  platform: "neutral",
  external: [/^react(?:\/|$)/],
  noExternal: [/^@tangle-network\/ui(?:\/|$)/, /^lucide-react(?:\/|$)/],
  dts: true,
  clean: true,
  fixedExtension: false,
});
