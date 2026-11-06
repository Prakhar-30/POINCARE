import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/server.ts"],
  format: ["esm"],
  dts: { entry: "src/server.ts" },
  clean: true,
  target: "node18",
  sourcemap: false,
});
