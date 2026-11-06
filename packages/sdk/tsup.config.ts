import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  target: "es2022",
  sourcemap: false,
  // viem is a peer: one copy per app, shared with wagmi and the user's own code
  external: ["viem", /^viem\//],
});
