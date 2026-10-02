import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "react/index": "src/react/index.ts",
  },
  format: ["esm"],
  platform: "neutral",
  external: [/^react(?:\/|$)/],
  dts: true,
  clean: true,
  fixedExtension: false,
});
