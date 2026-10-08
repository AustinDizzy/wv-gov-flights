import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "unit",
    include: ["tests/unit/**/*.test.ts"],
    coverage: { reporter: ["text", "json-summary"] },
  },
});
