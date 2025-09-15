import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: {
      oxc: true,
    },
    sourcemap: false,
    clean: true,
    outDir: "dist",
  },
]);
