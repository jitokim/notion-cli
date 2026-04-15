import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  banner: { js: "#!/usr/bin/env node" },
  external: ["@notionhq/client"],
  sourcemap: false,
  clean: true,
  target: "node20",
  splitting: false,
  dts: false,
});
