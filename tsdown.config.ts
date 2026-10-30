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
  external: [/^react(?:\/|$)/, /^@tangle-network\/ui(?:\/(?!utils\/format$)|$)/],
  noExternal: [/^lucide-react(?:\/|$)/, "@tangle-network/ui/utils/format"],
  dts: true,
  clean: true,
  fixedExtension: false,
});
