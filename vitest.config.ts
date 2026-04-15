import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.spec.ts", "src/cli.ts", "src/l2/commands/**"],
    },
  },
  resolve: {
    alias: {
      "@l0": "/src/l0",
      "@l1": "/src/l1",
      "@l2": "/src/l2",
    },
  },
});
