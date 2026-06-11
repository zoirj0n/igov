import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "jsdom",
    // Integration tests (e.g. live agent vs Ollama) need real node fetch to
    // localhost; jsdom's fetch can't reach it. Component/unit tests stay jsdom.
    environmentMatchGlobs: [["tests/integration/**", "node"]],
    globals: false,
    include: [
      "tests/unit/**/*.test.ts",
      "tests/unit/**/*.test.tsx",
      "tests/integration/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      thresholds: { lines: 80, branches: 75, functions: 80, statements: 80 },
      exclude: ["**/*.config.*", "**/*.d.ts", "tests/**", ".next/**"],
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
